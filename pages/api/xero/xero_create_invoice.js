// pages/api/xero/xero_create_invoice.js
//
// POST { job_id }
// Auth: Office user via Authorization: Bearer <supabase access token>

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getValidXeroClient } from "../../../lib/xeroOAuth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

const ENV_SKIP_SALES_FALLBACK = process.env.XERO_SALES_ACCOUNT_CODE || "200";
const ENV_PERMIT_SALES_FALLBACK = process.env.XERO_PERMIT_SALES_ACCOUNT_CODE || "215";
const ENV_CARD_CLEARING_FALLBACK = process.env.XERO_CARD_CLEARING_ACCOUNT_CODE || "800";

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

function looksLikeUuid(x) {
  const v = asText(x);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function looksLikeAccountCode(x) {
  const v = asText(x);
  if (!v) return false;
  if (v.length > 80) return false;
  return /^[A-Za-z0-9_-]+$/.test(v);
}

function buildXeroPaymentAccount(accountKey) {
  const v = asText(accountKey);
  assert(v, "Payment account is missing");
  assert(looksLikeAccountCode(v), "Payment account is invalid");

  if (looksLikeUuid(v)) {
    return { AccountID: v };
  }

  return { Code: v };
}

async function loadInvoiceAccountCodes({ supabase, subscriberId }) {
  const defaults = {
    skipHireSalesAccountCode: ENV_SKIP_SALES_FALLBACK,
    termHireExtensionSalesAccountCode: ENV_SKIP_SALES_FALLBACK,
    permitSalesAccountCode: ENV_PERMIT_SALES_FALLBACK,
    cardClearingAccountCode: ENV_CARD_CLEARING_FALLBACK,
    useDefaultsWhenMissing: true,
  };

  const { data, error } = await supabase
    .from("invoice_settings")
    .select(
      `
      skip_hire_sales_account_code,
      term_hire_extension_sales_account_code,
      permit_sales_account_code,
      card_clearing_account_code,
      use_defaults_when_missing
      `
    )
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (error) return { ...defaults, source: "env_fallback_error" };
  if (!data) return { ...defaults, source: "env_fallback_missing_row" };

  const useDefaultsWhenMissing = data.use_defaults_when_missing === false ? false : true;

  const skipHire = asText(data.skip_hire_sales_account_code);
  const termHireExtension = asText(data.term_hire_extension_sales_account_code);
  const permit = asText(data.permit_sales_account_code);
  const cardClearing = asText(data.card_clearing_account_code);

  const resolvedSkipHire = looksLikeAccountCode(skipHire)
    ? skipHire
    : useDefaultsWhenMissing
      ? ENV_SKIP_SALES_FALLBACK
      : "";

  const resolved = {
    skipHireSalesAccountCode: resolvedSkipHire,
    termHireExtensionSalesAccountCode: looksLikeAccountCode(termHireExtension)
      ? termHireExtension
      : resolvedSkipHire || (useDefaultsWhenMissing ? ENV_SKIP_SALES_FALLBACK : ""),
    permitSalesAccountCode: looksLikeAccountCode(permit)
      ? permit
      : useDefaultsWhenMissing
        ? ENV_PERMIT_SALES_FALLBACK
        : "",
    cardClearingAccountCode: looksLikeAccountCode(cardClearing)
      ? cardClearing
      : useDefaultsWhenMissing
        ? ENV_CARD_CLEARING_FALLBACK
        : "",
    useDefaultsWhenMissing,
    source: "invoice_settings",
  };

  if (!useDefaultsWhenMissing) {
    if (!looksLikeAccountCode(resolved.skipHireSalesAccountCode)) {
      throw new Error("Missing invoicing setting: skip_hire_sales_account_code");
    }
    if (!looksLikeAccountCode(resolved.termHireExtensionSalesAccountCode)) {
      throw new Error("Missing invoicing setting: term_hire_extension_sales_account_code");
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

function buildSkipLineDescription(job) {
  const base = (job.notes || `Skip hire ${job.job_number || ""}`.trim() || "Skip hire").trim();
  const loc = job.site_postcode ? ` @ ${job.site_postcode}` : "";
  return `${base}${loc}`.trim();
}

function buildPermitLineDescription(permitName, job) {
  const loc = job.site_postcode ? ` @ ${job.site_postcode}` : "";
  return `Permit – ${permitName || "Council"}${loc}`.trim();
}

function buildExtensionLineDescription({ job, extension }) {
  const weeks = Number(extension?.weeks || 1);
  const parts = [
    `Term hire extension${weeks === 1 ? "" : ` (${weeks} weeks)`}`,
    job.job_number ? `Job ${job.job_number}` : "",
    extension?.old_hire_end_date && extension?.new_hire_end_date
      ? `${extension.old_hire_end_date} to ${extension.new_hire_end_date}`
      : "",
    job.site_postcode ? `@ ${job.site_postcode}` : "",
  ].filter(Boolean);

  return parts.join(" – ");
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

function buildXeroPostalAddressFromCustomer(customer) {
  const line1 = asText(customer.billing_address_line1);
  const line2 = asText(customer.billing_address_line2);
  const city = asText(customer.billing_city);
  const region = asText(customer.billing_region);
  const postcode = asText(customer.billing_postcode);
  const country = asText(customer.billing_country) || "United Kingdom";

  const hasAnything = !!(line1 || line2 || city || region || postcode || country);
  if (!hasAnything) return null;

  const hasUseful =
    !!line1 || (!!postcode && (!!city || !!region)) || (!!city && !!postcode);
  if (!hasUseful) return null;

  return {
    AddressType: "POBOX",
    AddressLine1: line1 || undefined,
    AddressLine2: line2 || undefined,
    City: city || undefined,
    Region: region || undefined,
    PostalCode: postcode || undefined,
    Country: country || undefined,
  };
}

async function upsertContactPostalAddress({ accessToken, tenantId, contactId, postalAddress }) {
  if (!postalAddress) return;

  await xeroRequest({
    accessToken,
    tenantId,
    path: "/Contacts",
    method: "POST",
    body: {
      Contacts: [
        {
          ContactID: String(contactId),
          Addresses: [postalAddress],
        },
      ],
    },
  });
}

async function findOrCreateContact({ accessToken, tenantId, customer }) {
  const name = buildContactName(customer);
  const contactNumber = customer.account_code ? String(customer.account_code) : "";
  const postalAddress = buildXeroPostalAddressFromCustomer(customer);

  if (contactNumber) {
    const where = encodeURIComponent(`ContactNumber=="${escapeForXeroWhere(contactNumber)}"`);
    const found = await xeroRequest({ accessToken, tenantId, path: `/Contacts?where=${where}` });
    const contacts = Array.isArray(found?.Contacts) ? found.Contacts : [];
    if (contacts[0]?.ContactID) {
      const id = String(contacts[0].ContactID);
      await upsertContactPostalAddress({ accessToken, tenantId, contactId: id, postalAddress });
      return id;
    }
  }

  {
    const where = encodeURIComponent(`Name=="${escapeForXeroWhere(name)}"`);
    const found = await xeroRequest({ accessToken, tenantId, path: `/Contacts?where=${where}` });
    const contacts = Array.isArray(found?.Contacts) ? found.Contacts : [];
    if (contacts[0]?.ContactID) {
      const id = String(contacts[0].ContactID);
      await upsertContactPostalAddress({ accessToken, tenantId, contactId: id, postalAddress });
      return id;
    }
  }

  const created = await xeroRequest({
    accessToken,
    tenantId,
    path: "/Contacts",
    method: "POST",
    body: {
      Contacts: [
        {
          Name: name,
          EmailAddress: customer.email || undefined,
          ContactNumber: contactNumber || undefined,
          Addresses: postalAddress ? [postalAddress] : undefined,
        },
      ],
    },
  });

  const contact = Array.isArray(created?.Contacts) ? created.Contacts[0] : null;
  if (!contact?.ContactID) throw new Error("Failed to create Xero contact");

  const id = String(contact.ContactID);
  await upsertContactPostalAddress({ accessToken, tenantId, contactId: id, postalAddress });
  return id;
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

async function createPaymentInXero({ accessToken, tenantId, invoiceId, amount, paymentAccountKey }) {
  assert(amount > 0, "Payment amount must be > 0");

  await xeroRequest({
    accessToken,
    tenantId,
    path: "/Payments",
    method: "PUT",
    body: {
      Payments: [
        {
          Invoice: { InvoiceID: invoiceId },
          Account: buildXeroPaymentAccount(paymentAccountKey),
          Date: ymdTodayUTC(),
          Amount: Number(amount),
        },
      ],
    },
  });
}

function periodYmUTC() {
  const dt = new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function insertXeroTermHireEvent(supabase, payload) {
  try {
    await supabase.from("term_hire_events").insert(payload);
  } catch (e) {
    console.error("term_hire_events insert failed", e);
  }
}

export async function createTermHireExtensionInvoice({
  subscriberId,
  jobId,
  stripeSessionId,
}) {
  const supabase = getSupabaseAdmin();

  if (!subscriberId) throw new Error("subscriberId is required");
  if (!jobId) throw new Error("jobId is required");
  if (!stripeSessionId) throw new Error("stripeSessionId is required");

  const { data: existingEvents, error: existingEventErr } = await supabase
    .from("term_hire_events")
    .select("id, metadata")
    .eq("subscriber_id", subscriberId)
    .eq("job_id", jobId)
    .eq("event_type", "extension_xero_invoice_created")
    .contains("metadata", { stripe_session_id: stripeSessionId })
    .limit(1);

  if (existingEventErr) throw existingEventErr;

  if (Array.isArray(existingEvents) && existingEvents.length > 0) {
    return {
      ok: true,
      mode: "already",
      invoiceId: existingEvents[0]?.metadata?.xero_invoice_id || null,
      invoiceNumber: existingEvents[0]?.metadata?.xero_invoice_number || null,
    };
  }

  const { data: extension, error: extensionErr } = await supabase
    .from("term_hire_extensions")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("job_id", jobId)
    .eq("stripe_session_id", stripeSessionId)
    .eq("status", "paid")
    .maybeSingle();

  if (extensionErr) throw extensionErr;
  if (!extension) throw new Error("Paid term hire extension not found");

  const amountPaid = Number(extension.amount || 0);
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    throw new Error("Paid term hire extension has no valid amount");
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      `
      id,
      job_number,
      subscriber_id,
      customer_id,
      notes,
      scheduled_date,
      site_postcode
    `
    )
    .eq("id", jobId)
    .eq("subscriber_id", subscriberId)
    .single();

  if (jobErr || !job) throw new Error("Job not found for extension invoice");

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
      account_code,

      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_region,
      billing_postcode,
      billing_country
    `
    )
    .eq("id", job.customer_id)
    .eq("subscriber_id", subscriberId)
    .single();

  if (custErr || !customer) throw new Error("Customer not found for extension invoice");

  const invoiceAccounts = await loadInvoiceAccountCodes({ supabase, subscriberId });
  const XERO_EXTENSION_SALES_ACCOUNT_CODE = invoiceAccounts.termHireExtensionSalesAccountCode;
  const XERO_CARD_CLEARING_ACCOUNT_KEY = invoiceAccounts.cardClearingAccountCode;

  assert(
    looksLikeAccountCode(XERO_EXTENSION_SALES_ACCOUNT_CODE),
    "Term hire extension sales account code is missing/invalid"
  );
  assert(
    looksLikeAccountCode(XERO_CARD_CLEARING_ACCOUNT_KEY),
    "Card clearing account is missing/invalid"
  );

  const xc = await getValidXeroClient(subscriberId);
  if (!xc?.tenantId) throw new Error("Xero connected but no organisation selected");

  const accessToken = xc.accessToken;
  const tenantId = xc.tenantId;

  const taxTypeVatIncome = await getTaxTypeByRateName({
    accessToken,
    tenantId,
    rateName: TAX_RATE_NAME_VAT_INCOME,
  });

  const contactId = await findOrCreateContact({ accessToken, tenantId, customer });

  const lineItem = {
    Description: buildExtensionLineDescription({ job, extension }),
    Quantity: 1,
    UnitAmount: amountPaid,
    AccountCode: XERO_EXTENSION_SALES_ACCOUNT_CODE,
    TaxType: taxTypeVatIncome,
  };

  const invoicePayload = {
    Type: "ACCREC",
    Status: "AUTHORISED",
    Contact: { ContactID: contactId },
    Date: ymdTodayUTC(),
    DueDate: ymdTodayUTC(),
    Reference: job.job_number
      ? `TERM-HIRE-EXTENSION-${job.job_number}`
      : `TERM-HIRE-EXTENSION-${job.id}`,
    LineAmountTypes: "Inclusive",
    LineItems: [lineItem],
  };

  const inv = await createInvoiceInXero({ accessToken, tenantId, invoicePayload });

  await createPaymentInXero({
    accessToken,
    tenantId,
    invoiceId: String(inv.InvoiceID),
    amount: amountPaid,
    paymentAccountKey: XERO_CARD_CLEARING_ACCOUNT_KEY,
  });

  const invAfter = await getInvoiceById({
    accessToken,
    tenantId,
    invoiceId: String(inv.InvoiceID),
  });

  await insertXeroTermHireEvent(supabase, {
    subscriber_id: subscriberId,
    job_id: job.id,
    customer_id: customer.id,
    channel: "xero",
    event_type: "extension_xero_invoice_created",
    template_key: null,
    recipient: customer.email || null,
    metadata: {
      stripe_session_id: stripeSessionId,
      extension_id: extension.id || null,
      xero_invoice_id: invAfter.InvoiceID || inv.InvoiceID || null,
      xero_invoice_number: invAfter.InvoiceNumber || inv.InvoiceNumber || null,
      xero_invoice_status: invAfter.Status || inv.Status || null,
      xero_payment_account_key: XERO_CARD_CLEARING_ACCOUNT_KEY,
      xero_sales_account_code: XERO_EXTENSION_SALES_ACCOUNT_CODE,
      amount: amountPaid,
      old_hire_end_date: extension.old_hire_end_date || null,
      new_hire_end_date: extension.new_hire_end_date || null,
      weeks: extension.weeks || null,
    },
  });

  return {
    ok: true,
    mode: "extension",
    invoiceId: String(invAfter.InvoiceID || inv.InvoiceID),
    invoiceNumber: invAfter.InvoiceNumber || inv.InvoiceNumber || null,
    invoiceStatus: invAfter.Status || inv.Status || null,
  };
}

export async function createInvoiceForJob({ subscriberId, jobId }) {
  const supabase = getSupabaseAdmin();

  const invoiceAccounts = await loadInvoiceAccountCodes({ supabase, subscriberId });
  const XERO_SKIP_SALES_ACCOUNT_CODE = invoiceAccounts.skipHireSalesAccountCode;
  const XERO_PERMIT_SALES_ACCOUNT_CODE = invoiceAccounts.permitSalesAccountCode;
  const XERO_CARD_CLEARING_ACCOUNT_KEY = invoiceAccounts.cardClearingAccountCode;

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
      xero_invoice_status,

      paid_at
    `
    )
    .eq("id", jobId)
    .eq("subscriber_id", subscriberId)
    .single();

  if (jobErr || !job) throw new Error("Job not found");

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
      account_code,

      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_region,
      billing_postcode,
      billing_country
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
    Description: buildSkipLineDescription(job),
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
    await writeJobXeroFields(inv);

    if (paymentType === "card" && job.paid_at) {
      const totalToPay = skipAmountIncVat + (permitLine ? Number(permitAmountNoVat) : 0);

      await createPaymentInXero({
        accessToken,
        tenantId,
        invoiceId: String(inv.InvoiceID),
        amount: totalToPay,
        paymentAccountKey: XERO_CARD_CLEARING_ACCOUNT_KEY,
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

    return {
      mode: paymentType === "card" ? "card" : "cash",
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
