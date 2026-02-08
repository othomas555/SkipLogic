// pages/api/xero/xero_apply_payment.js
//
// POST { job_id, paid_method?, amount? }
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Applies a Xero Payment to an existing Xero invoice for a job.
// - Requires job.xero_invoice_id
// - Blocks payment_type === "account" (monthly DRAFT invoice flow)
// - Prevents double-payment using jobs.xero_payment_id
//
// Account selection (from invoice_settings):
// - paid_method starts with "card" (or equals "card") -> card_clearing_account_code
// - paid_method == "cash" -> cash_bank_account_code
//
// Amount:
// - If body.amount is provided and > 0, uses that
// - Else pays the invoice AmountDue (from Xero invoice), must be > 0
//
// Writes back:
// - jobs.xero_payment_id
//
// Returns:
// { ok:true, payment_id, account_code, amount, invoice_id, invoice_number, invoice_status }

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getValidXeroClient } from "../../../lib/xeroOAuth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

// ENV FALLBACKS (only used if subscriber settings allow)
const ENV_CARD_CLEARING_FALLBACK = process.env.XERO_CARD_CLEARING_ACCOUNT_CODE || "800";
const ENV_CASH_BANK_FALLBACK = process.env.XERO_CASH_BANK_ACCOUNT_CODE || ""; // optional env fallback

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function looksLikeAccountCode(x) {
  const v = asText(x);
  if (!v) return false;
  if (v.length > 50) return false;
  return /^[A-Za-z0-9_-]+$/.test(v);
}

function ymdTodayUTC() {
  const dt = new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

async function getInvoiceById({ accessToken, tenantId, invoiceId }) {
  const res = await xeroRequest({ accessToken, tenantId, path: `/Invoices/${invoiceId}`, method: "GET" });
  const inv = Array.isArray(res?.Invoices) ? res.Invoices[0] : null;
  if (!inv?.InvoiceID) throw new Error("Could not load invoice from Xero");
  return inv;
}

async function createPaymentInXero({ accessToken, tenantId, invoiceId, amount, accountCode }) {
  assert(Number(amount) > 0, "Payment amount must be > 0");
  assert(looksLikeAccountCode(accountCode), "Payment account code is missing/invalid");

  const payload = {
    Payments: [
      {
        Invoice: { InvoiceID: String(invoiceId) },
        Account: { Code: String(accountCode) },
        Date: ymdTodayUTC(),
        Amount: Number(amount),
      },
    ],
  };

  const out = await xeroRequest({
    accessToken,
    tenantId,
    path: "/Payments",
    method: "PUT",
    body: payload,
  });

  const p = Array.isArray(out?.Payments) ? out.Payments[0] : null;
  const paymentId = p?.PaymentID ? String(p.PaymentID) : null;

  return { paymentId, raw: out };
}

async function loadPaymentAccountCodes({ supabase, subscriberId }) {
  const defaults = {
    cardClearingAccountCode: ENV_CARD_CLEARING_FALLBACK,
    cashBankAccountCode: ENV_CASH_BANK_FALLBACK,
    useDefaultsWhenMissing: true,
    source: "env_fallback",
  };

  const { data, error } = await supabase
    .from("invoice_settings")
    .select("card_clearing_account_code, cash_bank_account_code, use_defaults_when_missing")
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (error) return { ...defaults, source: "env_fallback_error" };
  if (!data) return { ...defaults, source: "env_fallback_missing_row" };

  const useDefaultsWhenMissing = data.use_defaults_when_missing === false ? false : true;

  const c1 = asText(data.card_clearing_account_code);
  const c2 = asText(data.cash_bank_account_code);

  const resolved = {
    cardClearingAccountCode:
      looksLikeAccountCode(c1) ? c1 : useDefaultsWhenMissing ? ENV_CARD_CLEARING_FALLBACK : "",
    cashBankAccountCode: looksLikeAccountCode(c2) ? c2 : useDefaultsWhenMissing ? ENV_CASH_BANK_FALLBACK : "",
    useDefaultsWhenMissing,
    source: "invoice_settings",
  };

  if (!useDefaultsWhenMissing) {
    if (!looksLikeAccountCode(resolved.cardClearingAccountCode)) {
      throw new Error("Missing invoicing setting: card_clearing_account_code");
    }
    if (!looksLikeAccountCode(resolved.cashBankAccountCode)) {
      throw new Error("Missing invoicing setting: cash_bank_account_code");
    }
  }

  return resolved;
}

function normalizePaidMethod(x) {
  const v = asText(x).toLowerCase();
  return v;
}

function chooseAccountCode({ paidMethod, cardClearingAccountCode, cashBankAccountCode }) {
  // card variants: "card", "card_phone", "card-clearing", etc.
  if (paidMethod === "cash") {
    return { accountCode: cashBankAccountCode, accountKind: "cash_bank" };
  }
  if (paidMethod.startsWith("card")) {
    return { accountCode: cardClearingAccountCode, accountKind: "card_clearing" };
  }
  // Default: treat unknown as card (safer for your intended phone-card use)
  return { accountCode: cardClearingAccountCode, accountKind: "card_clearing_default" };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = String(auth.subscriber_id || "");
    if (!subscriberId) return res.status(401).json({ ok: false, error: "No subscriber in auth context" });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobId = String(body.job_id || "");
    if (!jobId) return res.status(400).json({ ok: false, error: "job_id is required" });

    const supabase = getSupabaseAdmin();

    // Load job (tenant scoped)
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(
        `
        id,
        subscriber_id,
        job_number,
        payment_type,
        price_inc_vat,
        xero_invoice_id,
        xero_invoice_number,
        xero_invoice_status,
        xero_payment_id
      `
      )
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (jobErr) {
      console.error("xero_apply_payment load job error:", jobErr);
      return res.status(500).json({ ok: false, error: "Failed to load job" });
    }
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });

    // No payments for account customers (monthly DRAFT invoice)
    if (String(job.payment_type || "").toLowerCase() === "account") {
      return res.status(400).json({
        ok: false,
        error: "Account jobs cannot be paid job-by-job (monthly DRAFT invoice flow).",
      });
    }

    const invoiceId = job.xero_invoice_id ? String(job.xero_invoice_id) : "";
    if (!invoiceId) {
      return res.status(400).json({ ok: false, error: "Job has no xero_invoice_id to pay" });
    }

    // Idempotency: if already stored, do not create another payment
    if (job.xero_payment_id) {
      return res.status(200).json({
        ok: true,
        mode: "already",
        payment_id: String(job.xero_payment_id),
        invoice_id: invoiceId,
        invoice_number: job.xero_invoice_number || null,
        invoice_status: job.xero_invoice_status || null,
      });
    }

    const xc = await getValidXeroClient(subscriberId);
    if (!xc?.tenantId) throw new Error("Xero connected but no organisation selected");

    const accessToken = xc.accessToken;
    const tenantId = xc.tenantId;

    // Load invoice from Xero to get AmountDue + Status
    const inv = await getInvoiceById({ accessToken, tenantId, invoiceId });

    const invStatus = String(inv.Status || "");
    if (invStatus !== "AUTHORISED" && invStatus !== "PAID") {
      return res.status(400).json({
        ok: false,
        error: `Invoice is not payable (Status is "${invStatus}")`,
      });
    }

    const amountDue = Number(inv.AmountDue || 0);
    const requestedAmount = body.amount == null ? null : Number(body.amount);

    const amountToPay =
      Number.isFinite(requestedAmount) && requestedAmount > 0 ? requestedAmount : Number(amountDue);

    if (!Number.isFinite(amountToPay) || amountToPay <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Nothing to pay (invoice AmountDue is 0 and no amount provided).",
        details: { amount_due: amountDue },
      });
    }

    // Choose account code from settings
    const invoiceAccounts = await loadPaymentAccountCodes({ supabase, subscriberId });

    const paidMethod = normalizePaidMethod(body.paid_method || "card");
    const { accountCode, accountKind } = chooseAccountCode({
      paidMethod,
      cardClearingAccountCode: invoiceAccounts.cardClearingAccountCode,
      cashBankAccountCode: invoiceAccounts.cashBankAccountCode,
    });

    if (accountKind === "cash_bank" && !looksLikeAccountCode(accountCode)) {
      return res.status(400).json({
        ok: false,
        error: "Missing cash_bank_account_code in invoice_settings for this subscriber.",
      });
    }
    if ((accountKind === "card_clearing" || accountKind === "card_clearing_default") && !looksLikeAccountCode(accountCode)) {
      return res.status(400).json({
        ok: false,
        error: "Missing card_clearing_account_code in invoice_settings for this subscriber.",
      });
    }

    // Create payment in Xero
    const payOut = await createPaymentInXero({
      accessToken,
      tenantId,
      invoiceId,
      amount: amountToPay,
      accountCode,
    });

    const paymentId = payOut.paymentId || null;

    // Persist payment ID (even if null, we still want to know we attempted? no — only store if present)
    if (paymentId) {
      const { error: updErr } = await supabase
        .from("jobs")
        .update({ xero_payment_id: paymentId })
        .eq("id", jobId)
        .eq("subscriber_id", subscriberId);

      if (updErr) {
        console.error("xero_apply_payment failed to write xero_payment_id:", updErr);
        return res.status(500).json({
          ok: false,
          error: "Payment created in Xero but failed to write xero_payment_id to job",
          details: updErr.message || String(updErr),
        });
      }
    }

    // Reload invoice to reflect new status/amount due (optional but helpful)
    const invAfter = await getInvoiceById({ accessToken, tenantId, invoiceId });

    // Update invoice fields on the job (keeps UI consistent)
    const { error: invUpdErr } = await supabase
      .from("jobs")
      .update({
        xero_invoice_number: invAfter?.InvoiceNumber ? String(invAfter.InvoiceNumber) : job.xero_invoice_number || null,
        xero_invoice_status: invAfter?.Status ? String(invAfter.Status) : job.xero_invoice_status || null,
      })
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId);

    if (invUpdErr) {
      // Not fatal: payment already applied
      console.error("xero_apply_payment invoice field update warning:", invUpdErr);
    }

    return res.status(200).json({
      ok: true,
      payment_id: paymentId,
      account_code: accountCode,
      account_kind: accountKind,
      amount: amountToPay,
      invoice_id: String(invAfter.InvoiceID),
      invoice_number: invAfter.InvoiceNumber || null,
      invoice_status: invAfter.Status || null,
      amount_due_after: Number(invAfter.AmountDue || 0),
    });
  } catch (err) {
    console.error("xero_apply_payment error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
