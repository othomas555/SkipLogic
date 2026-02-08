// pages/api/xero/xero_create_invoice.js
//
// POST { job_id }
// Office-authenticated via Authorization: Bearer <access_token>
//
// Behaviour (LOCKED):
// - payment_type = 'card'   → create Xero invoice (AUTHORISED) + create payment to card clearing account
// - payment_type = 'cash'   → create Xero invoice (AUTHORISED), NOT paid
// - payment_type = 'pay_later' → create Xero invoice (AUTHORISED), NOT paid (UI may add later)
// - payment_type = 'account'→ attach job to monthly bucket + rebuild DRAFT monthly invoice lines
//
// Multi-tenant Xero OAuth:
// - Uses lib/xeroOAuth.getValidXeroClient(subscriberId)
// - Uses customers.account_code as Xero Contact AccountNumber (deterministic)

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getValidXeroClient } from "../../../lib/xeroOAuth";
import {
  resolveXeroContactIdByAccountNumber,
  createAuthorisedInvoiceForJob,
  createPaymentForInvoice,
  periodYmFromJob,
  buildJobLineDescription,
  createOrUpdateDraftMonthlyInvoice,
  updateExistingInvoiceLines,
} from "../../../lib/xeroApi";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    // 1) Office auth + subscriber scope
    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = auth.subscriber_id;
    const supabase = getSupabaseAdmin();

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobId = String(body.job_id || "");
    if (!jobId) return res.status(400).json({ ok: false, error: "job_id is required" });

    // 2) Load job (subscriber scoped)
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(
        `
        id,
        job_number,
        subscriber_id,
        customer_id,
        skip_type_id,
        payment_type,
        price_inc_vat,
        notes,
        scheduled_date,
        site_postcode,
        xero_invoice_id,
        xero_invoice_number,
        xero_invoice_status
      `
      )
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId)
      .single();

    if (jobErr) {
      console.error("Load job error:", jobErr);
      return res.status(500).json({ ok: false, error: "Failed to load job", details: jobErr.message || String(jobErr) });
    }
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });

    const paymentType = String(job.payment_type || "card");

    // 3) Load customer (subscriber scoped)
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select(
        `
        id,
        subscriber_id,
        first_name,
        last_name,
        company_name,
        email,
        is_credit_account,
        account_code
      `
      )
      .eq("id", job.customer_id)
      .eq("subscriber_id", subscriberId)
      .single();

    if (custErr) {
      console.error("Load customer error:", custErr);
      return res.status(500).json({ ok: false, error: "Failed to load customer", details: custErr.message || String(custErr) });
    }
    if (!customer) return res.status(404).json({ ok: false, error: "Customer not found" });

    // 4) Xero client (multi-tenant)
    const { tenantId, accessToken } = await getValidXeroClient(subscriberId);
    if (!tenantId) {
      return res.status(400).json({
        ok: false,
        error: "Xero connected but no tenant selected. Please select a tenant in Settings.",
      });
    }

    const salesAccountCode = process.env.XERO_SALES_ACCOUNT_CODE || "200";
    const clearingAccountCode = process.env.XERO_CARD_CLEARING_ACCOUNT_CODE;
    assert(clearingAccountCode, "Missing XERO_CARD_CLEARING_ACCOUNT_CODE");

    // 5) Resolve contact deterministically (AccountNumber)
    const contactId = await resolveXeroContactIdByAccountNumber({
      accessToken,
      tenantId,
      customer,
    });

    // 6) Load skip type name (for description)
    let skipTypeName = "";
    if (job.skip_type_id) {
      const { data: st, error: stErr } = await supabase
        .from("skip_types")
        .select("id, name")
        .eq("id", job.skip_type_id)
        .eq("subscriber_id", subscriberId)
        .maybeSingle();

      if (stErr) {
        console.error("Load skip type error:", stErr);
        // Not fatal; we can still invoice without a skip name
      } else {
        skipTypeName = st?.name || "";
      }
    }

    // ===== A) Non-account: create single invoice immediately =====
    if (paymentType === "card" || paymentType === "cash" || paymentType === "pay_later") {
      const amount = Number(job.price_inc_vat);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ ok: false, error: "Job has invalid price_inc_vat" });
      }

      // Idempotency: if already created, return existing
      if (job.xero_invoice_id) {
        return res.status(200).json({
          ok: true,
          already_created: true,
          mode: paymentType,
          xero_invoice_id: job.xero_invoice_id,
          xero_invoice_number: job.xero_invoice_number || null,
          xero_invoice_status: job.xero_invoice_status || null,
        });
      }

      // Create AUTHORISED invoice
      const inv = await createAuthorisedInvoiceForJob({
        accessToken,
        tenantId,
        contactId,
        job,
        skipTypeName,
        salesAccountCode,
      });

      // If card: create payment to clearing
      if (paymentType === "card") {
        await createPaymentForInvoice({
          accessToken,
          tenantId,
          invoiceId: inv.InvoiceID,
          amount,
          clearingAccountCode,
        });
      }

      // Persist onto job
      const newStatus = inv.Status || "AUTHORISED";
      const update = {
        xero_invoice_id: inv.InvoiceID,
        xero_invoice_number: inv.InvoiceNumber || inv.InvoiceID,
        xero_invoice_status: newStatus,
      };

      const { error: updErr } = await supabase
        .from("jobs")
        .update(update)
        .eq("id", job.id)
        .eq("subscriber_id", subscriberId);

      if (updErr) {
        console.error("Update job xero fields error:", updErr);
        return res.status(500).json({ ok: false, error: "Invoice created but failed to store on job", details: updErr.message || String(updErr) });
      }

      return res.status(200).json({
        ok: true,
        mode: paymentType,
        xero_invoice_id: inv.InvoiceID,
        xero_invoice_number: inv.InvoiceNumber || null,
        xero_invoice_status: newStatus,
        paid: paymentType === "card",
      });
    }

    // ===== B) Account: monthly draft invoice aggregation =====
    if (paymentType === "account") {
      if (!customer.is_credit_account) {
        return res.status(400).json({
          ok: false,
          error: "payment_type is account but customer.is_credit_account is false",
        });
      }

      const periodYm = periodYmFromJob(job);

      // Upsert bucket (xero_monthly_invoices)
      const { data: bucket, error: bucketErr } = await supabase
        .from("xero_monthly_invoices")
        .upsert(
          {
            subscriber_id: subscriberId,
            customer_id: customer.id,
            period_ym: periodYm,
            // allow null until created in Xero
            xero_invoice_id: null,
            status: "DRAFT",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "subscriber_id,customer_id,period_ym" }
        )
        .select("id, subscriber_id, customer_id, period_ym, xero_invoice_id, status")
        .single();

      if (bucketErr) {
        console.error("Upsert monthly invoice bucket error:", bucketErr);
        return res.status(500).json({ ok: false, error: "Failed to upsert monthly invoice bucket", details: bucketErr.message || String(bucketErr) });
      }

      // Attach job to bucket (idempotent via unique index)
      const { error: linkErr } = await supabase
        .from("xero_monthly_invoice_jobs")
        .insert([
          {
            subscriber_id: subscriberId,
            monthly_invoice_id: bucket.id,
            job_id: job.id,
          },
        ]);

      // If duplicate, ignore; otherwise error
      if (linkErr && !String(linkErr.message || "").toLowerCase().includes("duplicate")) {
        console.error("Attach job to monthly invoice error:", linkErr);
        return res.status(500).json({ ok: false, error: "Failed to attach job to monthly invoice", details: linkErr.message || String(linkErr) });
      }

      // Build line items from ALL linked jobs (current live values)
      const { data: linked, error: linkedErr } = await supabase
        .from("xero_monthly_invoice_jobs")
        .select(
          `
          job_id,
          jobs:jobs (
            id,
            job_number,
            scheduled_date,
            site_postcode,
            price_inc_vat,
            skip_type_id
          )
        `
        )
        .eq("subscriber_id", subscriberId)
        .eq("monthly_invoice_id", bucket.id);

      if (linkedErr) {
        console.error("Load linked jobs error:", linkedErr);
        return res.status(500).json({ ok: false, error: "Failed to load linked jobs for monthly invoice", details: linkedErr.message || String(linkedErr) });
      }

      const jobs = (linked || []).map((r) => r.jobs).filter(Boolean);

      // If any job lacks price, fail deterministically
      for (const j of jobs) {
        const amt = Number(j.price_inc_vat);
        if (!Number.isFinite(amt) || amt <= 0) {
          return res.status(400).json({
            ok: false,
            error: `Monthly invoice contains a job with invalid price_inc_vat: ${j.job_number || j.id}`,
          });
        }
      }

      // Load skip type names in one query
      const skipTypeIds = Array.from(new Set(jobs.map((j) => j.skip_type_id).filter(Boolean)));
      let skipNameById = {};
      if (skipTypeIds.length > 0) {
        const { data: stRows, error: stErr } = await supabase
          .from("skip_types")
          .select("id, name")
          .eq("subscriber_id", subscriberId)
          .in("id", skipTypeIds);

        if (stErr) {
          console.error("Load skip names for monthly invoice error:", stErr);
        } else {
          skipNameById = Object.fromEntries((stRows || []).map((r) => [r.id, r.name]));
        }
      }

      const lineItems = jobs.map((j) => ({
        Description: buildJobLineDescription(
          {
            job_number: j.job_number,
            scheduled_date: j.scheduled_date,
            site_postcode: j.site_postcode,
          },
          skipNameById[j.skip_type_id] || ""
        ),
        Quantity: 1,
        UnitAmount: Number(j.price_inc_vat),
        AccountCode: salesAccountCode,
      }));

      const reference = `ACCOUNT-${periodYm}-${customer.account_code || "UNKNOWN"}`;

      // Ensure Xero invoice exists, then update lines
      let xeroInvoiceId = bucket.xero_invoice_id;

      if (!xeroInvoiceId) {
        const created = await createOrUpdateDraftMonthlyInvoice({
          accessToken,
          tenantId,
          contactId,
          reference,
          lineItems,
          salesAccountCode,
        });

        xeroInvoiceId = created.InvoiceID;

        const { error: saveErr } = await supabase
          .from("xero_monthly_invoices")
          .update({
            xero_invoice_id: xeroInvoiceId,
            status: "DRAFT",
            updated_at: new Date().toISOString(),
          })
          .eq("id", bucket.id)
          .eq("subscriber_id", subscriberId);

        if (saveErr) {
          console.error("Save monthly invoice xero id error:", saveErr);
          return res.status(500).json({ ok: false, error: "Created draft invoice but failed to store xero_invoice_id", details: saveErr.message || String(saveErr) });
        }
      } else {
        await updateExistingInvoiceLines({
          accessToken,
          tenantId,
          invoiceId: xeroInvoiceId,
          contactId,
          reference,
          lineItems,
          salesAccountCode,
        });
      }

      return res.status(200).json({
        ok: true,
        mode: "account",
        monthly_invoice_id: bucket.id,
        period_ym: periodYm,
        xero_invoice_id: xeroInvoiceId,
        status: "DRAFT",
        line_count: lineItems.length,
      });
    }

    return res.status(400).json({ ok: false, error: `Unsupported payment_type: ${paymentType}` });
  } catch (err) {
    console.error("Error in pages/api/xero/xero_create_invoice.js:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: err?.message ? String(err.message) : String(err),
    });
  }
}
