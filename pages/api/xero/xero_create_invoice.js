// pages/api/xero/xero_create_invoice.js
//
// POST { job_id }
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Behaviour:
// - card   → create AUTHORISED invoice, then create Payment to card clearing account
// - cash   → create AUTHORISED invoice, unpaid
// - account→ append to ONE DRAFT monthly invoice per customer per month (xero_monthly_invoices table)
//
// VAT / NO VAT:
// - Skip hire uses tax rate name: "20% (VAT on Income)"
// - Permit uses tax rate name: "No VAT"
// We resolve the TaxType values dynamically from Xero /TaxRates.
//
// IMPORTANT (Option B):
// - DO NOT set InvoiceNumber. Let Xero auto-assign (INV-####).
// - Use job.job_number in Reference for traceability.

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getValidXeroClient } from "../../../lib/xeroOAuth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

// ENV DEFAULTS (used only as fallback if subscriber settings allow)
const ENV_SKIP_SALES_FALLBACK = process.env.XERO_SALES_ACCOUNT_CODE || "200";
const ENV_PERMIT_SALES_FALLBACK = process.env.XERO_PERMIT_SALES_ACCOUNT_CODE || "215";
const ENV_CARD_CLEARING_FALLBACK = process.env.XERO_CARD_CLEARING_ACCOUNT_CODE || "800";

// TAX RATE NAMES (as seen in Xero)
const TAX_RATE_NAME_VAT_INCOME = "20% (VAT on Income)";
const TAX_RATE_NAME_NO_VAT = "No VAT";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function escapeForXeroWhere(s) {
  return String(s || "").replace(/"/g, '\\"');
}

function ymdTodayUTC() {
  const dt = new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

async function loadInvoiceAccountCodes({ supabase, subscriberId }) {
  const defaults = {
    skipHireSalesAccountCode: ENV_SKIP_SALES_FALLBACK,
    permitSalesAccountCode: ENV_PERMIT_SALES_FALLBACK,
    cardClearingAccountCode: ENV_CARD_CLEARING_FALLBACK,
    useDefaultsWhenMissing: true,
  };

  const { data, error } = await supabase
    .from("invoice_settings")
    .select(
      "skip_hire_sales_account_code, permit_sales_account_code, card_clearing_account_code, use_defaults_when_missing"
    )
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (error) return { ...defaults, source: "env_fallback_error" };
  if (!data) return { ...defaults, source: "env_fallback_missing_row" };

  const useDefaultsWhenMissing = data.use_defaults_when_missing === false ? false : true;

  const s1 = asText(data.skip_hire_sales_account_code);
  const s2 = asText(data.permit_sales_account_code);
  const s3 = asText(data.card_clearing_account_code);

  const resolved = {
    skipHireSalesAccountCode:
      looksLikeAccountCode(s1) ? s1 : useDefaultsWhenMissing ? ENV_SKIP_SALES_FALLBACK : "",
    permitSalesAccountCode:
      looksLikeAccountCode(s2) ? s2 : useDefaultsWhenMissing ? ENV_PERMIT_SALES_FALLBACK : "",
    cardClearingAccountCode:
      looksLikeAccountCode(s3) ? s3 : useDefaultsWhenMissing ? ENV_CARD_CLEARING_FALLBACK : "",
    useDefaultsWhenMissing,
    source: "invoice_settings",
  };

  if (!useDefaultsWhenMissing) {
    if (!looksLikeAccountCode(resolved.skipHireSalesAccountCode)) {
      throw new Error("Missing invoicing setting: skip_hire_sales_account_code");
    }
    if (!looksLikeAccountCode(resolved.permitSalesAccountCode)) {
      throw new Error("Missing invoicing setting: permit_sales_account_code");
    }
    if (!looksLikeAccountCode(resolved.cardClearingAccountCode)) {
      throw new Error("Missing invoicing setting: card_clearing_account_code");
    }
  }

  return resolved;
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

function buildContactName(customer) {
  const person = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();
  if (customer.company_name) {
    return person ? `${customer.company_name} – ${person}` : customer.company_name;
  }
  return person || "Unknown Customer";
}

function buildSkipLineDescription(job, customer) {
  const base = (job.notes || `Skip hire ${job.job_number || ""}`.trim() || "Skip hire").trim();
  const loc = job.site_postcode ? ` @ ${job.site_postcode}` : "";
  return `${base}${loc}`.trim();
}

function buildPermitLineDescription(permitName, job) {
  const loc = job.site_postcode ? ` @ ${job.site_postcode}` : "";
  return `Permit – ${permitName || "Council"}${loc}`.trim();
}

async function getTaxTypeByRateName({ accessToken, tenantId, rateName }) {
  const res = await xeroRequest({ accessToken, tenantId, path: "/TaxRates", method: "GET" });
  const taxRates = Array.isArray(res?.TaxRates) ? res.TaxRates : [];

  const match = taxRates.find((tr) => String(tr?.Name || "") === String(rateName));
  if (!match?.TaxType) {
    const names = taxRates.map((t) => t?.Name).filter(Boolean);
    throw new Error(
      `Could not find Xero TaxRate by name "${rateName}". Found: ${names.slice(0, 25).join(", ")}`
    );
  }
  return String(match.TaxType);
}

async function findOrCreateContact({ accessToken, tenantId, customer }) {
  const name = buildContactName(customer);
  const contactNumber = customer.account_code ? String(customer.account_code) : "";

  if (contactNumber) {
    const where = encodeURIComponent(`ContactNumber=="${escapeForXeroWhere(contactNumber)}"`);
    const found = await xeroRequest({ accessToken, tenantId, path: `/Contacts?where=${where}` });
    const contacts = Array.isArray(found?.Contacts) ? found.Contacts : [];
    if (contacts[0]?.ContactID) return String(contacts[0].ContactID);
  }

  {
    const where = encodeURIComponent(`Name=="${escapeForXeroWhere(name)}"`);
    const found = await xeroRequest({ accessToken, tenantId, path: `/Contacts?where=${where}` });
    const contacts = Array.isArray(found?.Contacts) ? found.Contacts : [];
    if (contacts[0]?.ContactID) return String(contacts[0].ContactID);
  }

  const payload = {
    Contacts: [
      {
        Name: name,
        EmailAddress: customer.email || undefined,
        ContactNumber: contactNumber || undefined,
      },
    ],
  };

  const created = await xeroRequest({
    accessToken,
    tenantId,
    path: "/Contacts",
    method: "POST",
    body: payload,
  });

  const contact = Array.isArray(created?.Contacts) ? created.Contacts[0] : null;
  if (!contact?.ContactID) throw new Error("Failed to create Xero contact");
  return String(contact.ContactID);
}

async function getInvoiceById({ accessToken, tenantId, invoiceId }) {
  const res = await xeroRequest({ accessToken, tenantId, path: `/Invoices/${invoiceId}`, method: "GET" });
  const inv = Array.isArray(res?.Invoices) ? res.Invoices[0] : null;
  if (!inv?.InvoiceID) throw new Error("Could not load invoice from Xero");
  return inv;
}

async function createInvoiceInXero({ accessToken, tenantId, invoicePayload }) {
  const res = await xeroRequest({
    accessToken,
    tenantId,
    path: "/Invoices",
    method: "POST",
    body: { Invoices: [invoicePayload] },
  });
  const inv = Array.isArray(res?.Invoices) ? res.Invoices[0] : null;
  if (!inv?.InvoiceID) throw new Error("No invoice returned from Xero");
  return inv;
}

async function updateInvoiceLinesInXero({ accessToken, tenantId, invoiceId, lineItems }) {
  const res = await xeroRequest({
    accessToken,
    tenantId,
    path: "/Invoices",
    method: "POST",
    body: {
      Invoices: [
        {
          InvoiceID: invoiceId,
          LineItems: lineItems,
        },
      ],
    },
  });
  const inv = Array.isArray(res?.Invoices) ? res.Invoices[0] : null;
  if (!inv?.InvoiceID) throw new Error("Failed to update invoice in Xero");
  return inv;
}

async function createPaymentInXero({ accessToken, tenantId, invoiceId, amount, cardClearingAccountCode }) {
  assert(amount > 0, "Payment amount must be > 0");
  assert(looksLikeAccountCode(cardClearingAccountCode), "Card clearing account code is missing/invalid");

  const payload = {
    Payments: [
      {
        Invoice: { InvoiceID: invoiceId },
        Account: { Code: String(cardClearingAccountCode) },
        Date: ymdTodayUTC(),
        Amount: Number(amount),
      },
    ],
  };

  await xeroRequest({
    accessToken,
    tenantId,
    path: "/Payments",
    method: "PUT",
    body: payload,
  });
}

function periodYmUTC() {
  const dt = new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ✅ Shared helper for Step B
export async function createInvoiceForJob({ subscriberId, jobId }) {
  const supabase = getSupabaseAdmin();

  const invoiceAccounts = await loadInvoiceAccountCodes({ supabase, subscriberId });
  const XERO_SKIP_SALES_ACCOUNT_CODE = invoiceAccounts.skipHireSalesAccountCode;
  const XERO_PERMIT_SALES_ACCOUNT_CODE = invoiceAccounts.permitSalesAccountCode;
  const XERO_CARD_CLEARING_ACCOUNT_CODE = invoiceAccounts.cardClearingAccountCode;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      job_number,
      subscriber_id,
      customer_id,
      payment_type,
      price_inc_vat,
      notes,
      scheduled_date,
      site_postcode,

      placement_type,
      permit_setting_id,
      permit_price_no_vat,
      permit_delay_business_days,
      permit_validity_days,
      permit_override,
      weekend_override,

      xero_invoice_id,
      xero_invoice_number,
      xero_invoice_status
    `
    )
    .eq("id", jobId)
    .eq("subscriber_id", subscriberId)
    .single();

  if (jobErr || !job) throw new Error("Job not found");

  // Basic Step B guard (full idempotency is Step C)
  if (job.xero_invoice_id) {
    return {
      ok: true,
      mode: "already",
      invoiceId: String(job.xero_invoice_id),
      invoiceNumber: job.xero_invoice_number || null,
      invoiceStatus: job.xero_invoice_status || null,
    };
  }

  const skipAmountIncVat = Number(job.price_inc_vat || 0);
  if (!Number.isFinite(skipAmountIncVat) || skipAmountIncVat <= 0) {
    throw new Error("Job has no valid price_inc_vat");
  }

  const permitApplies = String(job.placement_type || "private") === "permit";
  const permitAmountNoVat = permitApplies ? Number(job.permit_price_no_vat || 0) : 0;

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select(
      `
      id,
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

  if (custErr || !customer) throw new Error("Customer not found");

  const xc = await getValidXeroClient(subscriberId);
  if (!xc?.tenantId) throw new Error("Xero connected but no organisation selected");

  const accessToken = xc.accessToken;
  const tenantId = xc.tenantId;

  const taxTypeVatIncome = await getTaxTypeByRateName({
    accessToken,
    tenantId,
    rateName: TAX_RATE_NAME_VAT_INCOME,
  });

  const taxTypeNoVat = await getTaxTypeByRateName({
    accessToken,
    tenantId,
    rateName: TAX_RATE_NAME_NO_VAT,
  });

  const contactId = await findOrCreateContact({ accessToken, tenantId, customer });

  let permitName = "Council";
  if (permitApplies && job.permit_setting_id) {
    const { data: permitRow } = await supabase
      .from("permit_settings")
      .select("id, name")
      .eq("id", job.permit_setting_id)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();
    if (permitRow?.name) permitName = permitRow.name;
  }

  assert(looksLikeAccountCode(XERO_SKIP_SALES_ACCOUNT_CODE), "Skip hire sales account code is missing/invalid");
  assert(looksLikeAccountCode(XERO_PERMIT_SALES_ACCOUNT_CODE), "Permit sales account code is missing/invalid");

  const skipLine = {
    Description: buildSkipLineDescription(job, customer),
    Quantity: 1,
    UnitAmount: skipAmountIncVat,
    AccountCode: XERO_SKIP_SALES_ACCOUNT_CODE,
    TaxType: taxTypeVatIncome,
  };

  const permitLine =
    permitApplies && Number.isFinite(permitAmountNoVat) && permitAmountNoVat > 0
      ? {
          Description: buildPermitLineDescription(permitName, job),
          Quantity: 1,
          UnitAmount: permitAmountNoVat,
          AccountCode: XERO_PERMIT_SALES_ACCOUNT_CODE,
          TaxType: taxTypeNoVat,
        }
      : null;

  const paymentType = String(job.payment_type || "card");

  async function writeJobXeroFields(inv) {
    const update = {
      xero_invoice_id: inv?.InvoiceID ? String(inv.InvoiceID) : null,
      xero_invoice_number: inv?.InvoiceNumber ? String(inv.InvoiceNumber) : null,
      xero_invoice_status: inv?.Status ? String(inv.Status) : null,
    };

    const { error } = await supabase
      .from("jobs")
      .update(update)
      .eq("id", job.id)
      .eq("subscriber_id", subscriberId);

    if (error) throw new Error("Failed to update job with Xero invoice fields");
  }

  if (paymentType === "card" || paymentType === "cash") {
    const lineItems = permitLine ? [skipLine, permitLine] : [skipLine];

    const invoicePayload = {
      Type: "ACCREC",
      Status: "AUTHORISED",
      Contact: { ContactID: contactId },
      Date: ymdTodayUTC(),
      DueDate: ymdTodayUTC(),
      Reference: job.job_number || undefined,
      LineAmountTypes: "Inclusive",
      LineItems: lineItems,
    };

    const inv = await createInvoiceInXero({ accessToken, tenantId, invoicePayload });

    if (paymentType === "card") {
      const totalToPay = skipAmountIncVat + (permitLine ? Number(permitAmountNoVat) : 0);

      await createPaymentInXero({
        accessToken,
        tenantId,
        invoiceId: String(inv.InvoiceID),
        amount: totalToPay,
        cardClearingAccountCode: XERO_CARD_CLEARING_ACCOUNT_CODE,
      });

      const invAfter = await getInvoiceById({ accessToken, tenantId, invoiceId: String(inv.InvoiceID) });
      await writeJobXeroFields(invAfter);

      return {
        mode: "card",
        invoiceId: String(invAfter.InvoiceID),
        invoiceNumber: invAfter.InvoiceNumber || null,
        invoiceStatus: invAfter.Status || null,
      };
    }

    await writeJobXeroFields(inv);

    return {
      mode: "cash",
      invoiceId: String(inv.InvoiceID),
      invoiceNumber: inv.InvoiceNumber || null,
      invoiceStatus: inv.Status || null,
    };
  }

  if (paymentType === "account") {
    const ym = periodYmUTC();

    const { data: miRow, error: miErr } = await supabase
      .from("xero_monthly_invoices")
      .select("id, subscriber_id, customer_id, period_ym, xero_invoice_id, status")
      .eq("subscriber_id", subscriberId)
      .eq("customer_id", customer.id)
      .eq("period_ym", ym)
      .maybeSingle();

    if (miErr) throw new Error("Failed to load xero_monthly_invoices row");

    let invoiceId = miRow?.xero_invoice_id ? String(miRow.xero_invoice_id) : null;
    let inv = null;

    if (!invoiceId) {
      const invoicePayload = {
        Type: "ACCREC",
        Status: "DRAFT",
        Contact: { ContactID: contactId },
        Date: ymdTodayUTC(),
        DueDate: ymdTodayUTC(),
        Reference: `ACCOUNT-${ym}`,
        LineAmountTypes: "Inclusive",
        LineItems: [],
      };

      inv = await createInvoiceInXero({ accessToken, tenantId, invoicePayload });
      invoiceId = String(inv.InvoiceID);

      const { error: upErr } = await supabase
        .from("xero_monthly_invoices")
        .upsert(
          {
            subscriber_id: subscriberId,
            customer_id: customer.id,
            period_ym: ym,
            xero_invoice_id: invoiceId,
            status: String(inv.Status || "DRAFT"),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "subscriber_id,customer_id,period_ym" }
        );

      if (upErr) throw new Error("Failed to upsert xero_monthly_invoices");
    } else {
      inv = await getInvoiceById({ accessToken, tenantId, invoiceId });
    }

    const status = String(inv?.Status || "");
    if (status !== "DRAFT") {
      throw new Error(`Monthly account invoice is not DRAFT (it is "${status}").`);
    }

    const existingLines = Array.isArray(inv.LineItems) ? inv.LineItems : [];
    const newLines = permitLine ? [skipLine, permitLine] : [skipLine];

    const updated = await updateInvoiceLinesInXero({
      accessToken,
      tenantId,
      invoiceId,
      lineItems: [...existingLines, ...newLines],
    });

    await supabase
      .from("xero_monthly_invoices")
      .update({
        status: String(updated.Status || "DRAFT"),
        updated_at: new Date().toISOString(),
      })
      .eq("subscriber_id", subscriberId)
      .eq("customer_id", customer.id)
      .eq("period_ym", ym);

    await writeJobXeroFields(updated);

    return {
      mode: "account",
      period_ym: ym,
      invoiceId: String(updated.InvoiceID),
      invoiceNumber: updated.InvoiceNumber || null,
      invoiceStatus: updated.Status || null,
    };
  }

  throw new Error(`Unsupported payment_type: ${paymentType}`);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = auth.subscriber_id;

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobId = String(body.job_id || "");
    if (!jobId) return res.status(400).json({ ok: false, error: "job_id is required" });

    const out = await createInvoiceForJob({ subscriberId, jobId });

    // Match your previous API shape exactly
    return res.status(200).json({
      ok: true,
      ...out,
    });
  } catch (err) {
    console.error("xero_create_invoice error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
