// pages/api/xero/xero_email_invoice_for_job.js
//
// POST { job_id }
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Purpose:
// Emails the Xero invoice for a job using Xero's "Email invoice" endpoint.
// If the job isn't linked to a Xero invoice yet (xero_invoice_id missing),
// this endpoint will find it in Xero by Reference == job.job_number (ACCREC only),
// write xero_invoice_id / number / status to the job, then email it.
//
// Deterministic rules:
// - Must find exactly 1 invoice match when linking, otherwise error.
// - Only searches ACCREC invoices.
// - Tenant-safe: uses subscriberId from office auth context.

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getValidXeroClient } from "../../../lib/xeroOAuth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function escapeForXeroWhere(s) {
  return String(s || "").replace(/"/g, '\\"');
}

async function xeroRequest({ accessToken, tenantId, path, method = "GET", body = null }) {
  const url = `${XERO_API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Xero-tenant-id": tenantId,
    Accept: "application/json",
  };
  if (body != null) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Xero request failed: ${res.status} ${res.statusText} – ${text}`);
  }
  return json;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = String(auth.subscriber_id || "");
    assert(subscriberId, "No subscriber in auth context");

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobId = asText(body.job_id);
    if (!jobId) return res.status(400).json({ ok: false, error: "job_id is required" });

    const supabase = getSupabaseAdmin();

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(
        `
        id,
        subscriber_id,
        job_number,
        xero_invoice_id,
        xero_invoice_number,
        xero_invoice_status
      `
      )
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (jobErr) {
      console.error("xero_email_invoice_for_job load job error:", jobErr);
      return res.status(500).json({ ok: false, error: "Failed to load job" });
    }
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });

    const jobNumber = asText(job.job_number);
    if (!jobNumber) return res.status(400).json({ ok: false, error: "Job has no job_number" });

    const xc = await getValidXeroClient(subscriberId);
    if (!xc?.tenantId) throw new Error("Xero connected but no organisation selected");

    const accessToken = xc.accessToken;
    const tenantId = xc.tenantId;

    let invoiceId = asText(job.xero_invoice_id);
    let linkedMode = "already_linked";

    // If not linked, deterministically locate by Reference == job_number (ACCREC) and store on job
    if (!invoiceId) {
      const where = encodeURIComponent(`Type=="ACCREC" AND Reference=="${escapeForXeroWhere(jobNumber)}"`);
      const found = await xeroRequest({
        accessToken,
        tenantId,
        path: `/Invoices?where=${where}`,
        method: "GET",
      });

      const invoices = Array.isArray(found?.Invoices) ? found.Invoices : [];

      if (invoices.length === 0) {
        return res.status(404).json({
          ok: false,
          error: `No Xero invoice found with Reference == ${jobNumber}`,
        });
      }

      if (invoices.length > 1) {
        const ids = invoices.map((i) => i?.InvoiceID).filter(Boolean).slice(0, 10);
        return res.status(409).json({
          ok: false,
          error: `Multiple Xero invoices found with Reference == ${jobNumber}. Refusing to auto-link.`,
          details: { count: invoices.length, invoice_ids: ids },
        });
      }

      const inv = invoices[0];
      invoiceId = inv?.InvoiceID ? String(inv.InvoiceID) : "";
      if (!invoiceId) throw new Error("Matched invoice has no InvoiceID");

      const update = {
        xero_invoice_id: invoiceId,
        xero_invoice_number: inv?.InvoiceNumber ? String(inv.InvoiceNumber) : null,
        xero_invoice_status: inv?.Status ? String(inv.Status) : null,
      };

      const { error: updErr } = await supabase.from("jobs").update(update).eq("id", job.id).eq("subscriber_id", subscriberId);

      if (updErr) {
        console.error("xero_email_invoice_for_job update error:", updErr);
        return res.status(500).json({ ok: false, error: "Failed to update job with Xero invoice fields" });
      }

      linkedMode = "linked_now";
    }

    // Email the invoice from Xero
    // Xero endpoint: POST /Invoices/{InvoiceID}/Email
    await xeroRequest({
      accessToken,
      tenantId,
      path: `/Invoices/${encodeURIComponent(invoiceId)}/Email`,
      method: "POST",
      body: null,
    });

    return res.status(200).json({
      ok: true,
      mode: "emailed",
      linked: linkedMode,
      job: {
        id: job.id,
        job_number: job.job_number,
      },
      invoice: {
        invoice_id: invoiceId,
      },
    });
  } catch (err) {
    console.error("xero_email_invoice_for_job error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
