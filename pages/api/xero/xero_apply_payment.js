// pages/api/xero/xero_apply_payment.js
//
// POST { job_id, paid_method, amount?, paid_reference? }
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Applies a Payment in Xero against the job's Xero invoice.
//
// IMPORTANT:
// - In some orgs, BANK accounts do not have a "Code" via /Accounts (Code may be null).
// - Therefore we support storing BANK account selection as AccountID (UUID) in invoice_settings.
// - For backwards compatibility we still allow Code.
//
// invoice_settings fields used here:
// - cash_bank_account_code: BANK AccountID (preferred) OR Code (legacy)
// - card_clearing_account_code: BANK AccountID (preferred) OR Code (legacy)
//
// paid_method:
// - "cash" → uses invoice_settings.cash_bank_account_code
// - "card" → uses invoice_settings.card_clearing_account_code
//
// Response:
// { ok:true, job, xero: { invoice_id, payment_id, amount_paid, amount_due_after, invoice_status }, account_used }
// or { ok:false, error, details? }

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getValidXeroClient } from "../../../lib/xeroOAuth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function looksLikeUuid(x) {
  const v = asText(x);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

async function loadPaymentSettings({ supabase, subscriberId }) {
  const { data, error } = await supabase
    .from("invoice_settings")
    .select("cash_bank_account_code, card_clearing_account_code")
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (error) throw new Error("Failed to load invoice_settings");

  return {
    cashBankKey: asText(data?.cash_bank_account_code),
    cardClearingKey: asText(data?.card_clearing_account_code),
  };
}

function resolveXeroPaymentAccount(keyRaw, fieldName) {
  const key = asText(keyRaw);

  if (!key) {
    throw new Error(
      `Missing invoice_settings.${fieldName}. Set it to a Xero BANK AccountID (preferred) or an account Code.`
    );
  }

  if (looksLikeUuid(key)) {
    return { account: { AccountID: String(key) }, accountUsed: { type: "AccountID", value: key } };
  }

  if (looksLikeAccountCode(key)) {
    return { account: { Code: String(key) }, accountUsed: { type: "Code", value: key } };
  }

  throw new Error(
    `Invalid invoice_settings.${fieldName}. Must be an AccountID (UUID) or a Code. Got: "${key}".`
  );
}

async function createPaymentInXero({ accessToken, tenantId, invoiceId, amount, account }) {
  const payment = {
    Invoice: { InvoiceID: String(invoiceId) },
    Date: ymdTodayUTC(),
    Amount: Number(amount),
    Account: account,
  };

  const payload = { Payments: [payment] };

  // Xero uses PUT for /Payments
  const res = await xeroRequest({ accessToken, tenantId, path: "/Payments", method: "PUT", body: payload });
  const pay = Array.isArray(res?.Payments) ? res.Payments[0] : null;

  return {
    paymentId: pay?.PaymentID ? String(pay.PaymentID) : null,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = String(auth.subscriber_id || "");
    const officeUserId = String(auth.user_id || auth.id || "");

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobId = asText(body.job_id);
    const paidMethod = asText(body.paid_method) || "cash";
    const amountIn = body.amount == null ? null : Number(body.amount);
    const paidReference = asText(body.paid_reference) || null;

    if (!jobId) return res.status(400).json({ ok: false, error: "job_id is required" });

    if (paidMethod !== "cash" && paidMethod !== "card") {
      return res.status(400).json({
        ok: false,
        error: `Unsupported paid_method "${paidMethod}" (supported: "cash", "card").`,
      });
    }

    const supabase = getSupabaseAdmin();

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
      .single();

    if (jobErr || !job) return res.status(404).json({ ok: false, error: "Job not found" });

    if (!job.xero_invoice_id) {
      return res.status(400).json({ ok: false, error: "Job has no xero_invoice_id to pay" });
    }

    const xc = await getValidXeroClient(subscriberId);
    if (!xc?.tenantId) return res.status(400).json({ ok: false, error: "Xero connected but no organisation selected" });

    const accessToken = xc.accessToken;
    const tenantId = xc.tenantId;

    // Determine amount to pay: default pay AmountDue
    const invBefore = await getInvoiceById({ accessToken, tenantId, invoiceId: String(job.xero_invoice_id) });
    const amountDue = Number(invBefore?.AmountDue ?? 0);

    if (!Number.isFinite(amountDue) || amountDue <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Invoice has no amount due to pay",
        details: { amount_due: invBefore?.AmountDue, status: invBefore?.Status },
      });
    }

    const amountToPay = amountIn == null ? amountDue : amountIn;

    if (!Number.isFinite(amountToPay) || amountToPay <= 0) {
      return res.status(400).json({ ok: false, error: "amount must be a positive number" });
    }
    if (amountToPay > amountDue + 0.0001) {
      return res.status(400).json({
        ok: false,
        error: "amount exceeds AmountDue",
        details: { amount: amountToPay, amount_due: amountDue },
      });
    }

    const settings = await loadPaymentSettings({ supabase, subscriberId });

    let resolved;
    if (paidMethod === "cash") {
      resolved = resolveXeroPaymentAccount(settings.cashBankKey, "cash_bank_account_code");
    } else {
      resolved = resolveXeroPaymentAccount(settings.cardClearingKey, "card_clearing_account_code");
    }

    const payOut = await createPaymentInXero({
      accessToken,
      tenantId,
      invoiceId: String(job.xero_invoice_id),
      amount: amountToPay,
      account: resolved.account,
    });

    const invAfter = await getInvoiceById({ accessToken, tenantId, invoiceId: String(job.xero_invoice_id) });
    const amountDueAfter = Number(invAfter?.AmountDue ?? 0);

    // Update job (SkipLogic-side paid markers + xero fields we know)
    const updatePayload = {
      xero_invoice_status: invAfter?.Status ? String(invAfter.Status) : job.xero_invoice_status,
      xero_payment_id: payOut.paymentId || job.xero_payment_id || null,

      paid_at: new Date().toISOString(),
      paid_by_user_id: officeUserId || null,
      paid_method: paidMethod,
      paid_reference: paidReference,
    };

    const { data: updatedJob, error: upErr } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", job.id)
      .eq("subscriber_id", subscriberId)
      .select(
        `
        id,
        job_number,
        payment_type,
        xero_invoice_id,
        xero_invoice_number,
        xero_invoice_status,
        xero_payment_id,
        paid_at,
        paid_method,
        paid_reference
      `
      )
      .single();

    if (upErr) {
      return res.status(500).json({
        ok: false,
        error: "Payment created in Xero, but failed to update job in SkipLogic",
        details: String(upErr?.message || upErr),
      });
    }

    return res.status(200).json({
      ok: true,
      job: updatedJob,
      xero: {
        invoice_id: String(job.xero_invoice_id),
        payment_id: payOut.paymentId,
        amount_paid: amountToPay,
        amount_due_after: amountDueAfter,
        invoice_status: invAfter?.Status ? String(invAfter.Status) : null,
      },
      account_used: resolved.accountUsed,
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
