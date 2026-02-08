// lib/xeroApi.js
//
// Server-side helpers for Xero API calls (multi-tenant).
// Includes better error surfacing for Xero validation messages.

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function todayYmdUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeForXeroWhere(str) {
  return String(str || "").replace(/"/g, '\\"');
}

function pickXeroValidationMessages(json) {
  // Xero errors often come as:
  // { ErrorNumber, Type, Message, Elements: [{ ValidationErrors: [{ Message }]}]}
  try {
    const elements = Array.isArray(json?.Elements) ? json.Elements : [];
    const msgs = [];
    for (const el of elements) {
      const ves = Array.isArray(el?.ValidationErrors) ? el.ValidationErrors : [];
      for (const ve of ves) {
        if (ve?.Message) msgs.push(String(ve.Message));
      }
    }
    if (msgs.length) return msgs;
  } catch {}
  return [];
}

export async function xeroRequest({ accessToken, tenantId, path, method = "GET", body = null }) {
  assert(accessToken, "Missing Xero access token");
  assert(tenantId, "Missing Xero tenant id (select tenant in Settings)");

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
    const msgs = pickXeroValidationMessages(json);
    const msgPart = msgs.length ? ` Validation: ${msgs.join(" | ")}` : "";
    const detail = text || res.statusText || "Unknown Xero error";
    const err = new Error(`Xero request failed: ${res.status} ${res.statusText} – ${detail}${msgPart}`);
    err.xero = json;
    err.xero_validation_messages = msgs;
    throw err;
  }

  return json;
}

export function buildContactName(customer) {
  const first = (customer?.first_name || "").trim();
  const last = (customer?.last_name || "").trim();
  const person = `${first} ${last}`.trim();

  const company = (customer?.company_name || "").trim();
  if (company) return person ? `${company} – ${person}` : company;

  return person || "Unknown Customer";
}

export function buildJobLineDescription(job, skipTypeName) {
  const jobNum = job?.job_number ? `Job ${job.job_number}` : "Job";
  const skip = skipTypeName ? `Skip hire – ${skipTypeName}` : "Skip hire";
  const date = job?.scheduled_date ? ` – ${job.scheduled_date}` : "";
  const pc = job?.site_postcode ? ` – ${job.site_postcode}` : "";
  return `${skip} – ${jobNum}${date}${pc}`;
}

export function periodYmFromJob(job) {
  const base = job?.scheduled_date ? new Date(`${job.scheduled_date}T00:00:00Z`) : new Date();
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function resolveXeroContactIdByAccountNumber({ accessToken, tenantId, customer }) {
  const accountNumber = (customer?.account_code || "").trim();
  assert(accountNumber, "Customer is missing account_code (required for deterministic Xero contact matching)");

  // 1) Try to find by AccountNumber
  const where = `AccountNumber=="${escapeForXeroWhere(accountNumber)}"`;
  const found = await xeroRequest({
    accessToken,
    tenantId,
    path: `/Contacts?where=${encodeURIComponent(where)}`,
    method: "GET",
  });

  const contacts = Array.isArray(found?.Contacts) ? found.Contacts : [];
  if (contacts.length === 1 && contacts[0]?.ContactID) return contacts[0].ContactID;
  if (contacts.length > 1) {
    throw new Error(`Multiple Xero contacts found with AccountNumber=${accountNumber}. Fix duplicates in Xero.`);
  }

  // 2) Not found → create contact
  const name = buildContactName(customer);
  const email = (customer?.email || "").trim();

  // If your Xero org requires email, this must be present.
  // We'll fail fast with a clear message rather than sending an invalid payload.
  if (!email) {
    throw new Error(
      `Customer ${customer?.id || ""} has no email. Your Xero setup appears to require EmailAddress for contacts. Add customer email and retry.`
    );
  }

  const payload = {
    Contacts: [
      {
        Name: name,
        AccountNumber: accountNumber,
        EmailAddress: email,
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

  const c = Array.isArray(created?.Contacts) && created.Contacts[0] ? created.Contacts[0] : null;
  if (!c?.ContactID) throw new Error("Failed to create Xero contact (no ContactID returned)");
  return c.ContactID;
}

export async function createAuthorisedInvoiceForJob({
  accessToken,
  tenantId,
  contactId,
  job,
  skipTypeName,
  salesAccountCode,
}) {
  const amount = Number(job?.price_inc_vat);
  assert(Number.isFinite(amount) && amount > 0, "Job has invalid price_inc_vat");

  const invoicePayload = {
    Invoices: [
      {
        Type: "ACCREC",
        Status: "AUTHORISED",
        Contact: { ContactID: contactId },
        Date: todayYmdUTC(),
        DueDate: todayYmdUTC(),
        InvoiceNumber: job?.job_number || undefined,
        Reference: job?.job_number || undefined,
        LineAmountTypes: "Inclusive",
        LineItems: [
          {
            Description: buildJobLineDescription(job, skipTypeName),
            Quantity: 1,
            UnitAmount: amount,
            AccountCode: salesAccountCode,
          },
        ],
      },
    ],
  };

  const invoiceRes = await xeroRequest({
    accessToken,
    tenantId,
    path: "/Invoices",
    method: "POST",
    body: invoicePayload,
  });

  const inv = Array.isArray(invoiceRes?.Invoices) && invoiceRes.Invoices[0] ? invoiceRes.Invoices[0] : null;
  if (!inv?.InvoiceID) throw new Error("No invoice returned from Xero");
  return inv;
}

export async function createPaymentForInvoice({ accessToken, tenantId, invoiceId, amount, clearingAccountCode }) {
  assert(invoiceId, "Missing invoiceId");
  assert(Number.isFinite(amount) && amount > 0, "Invalid payment amount");
  assert(clearingAccountCode, "Missing clearing account code");

  const paymentPayload = {
    Payments: [
      {
        Invoice: { InvoiceID: invoiceId },
        Account: { Code: clearingAccountCode },
        Date: todayYmdUTC(),
        Amount: amount,
      },
    ],
  };

  await xeroRequest({
    accessToken,
    tenantId,
    path: "/Payments",
    method: "PUT",
    body: paymentPayload,
  });
}

export async function createOrUpdateDraftMonthlyInvoice({ accessToken, tenantId, contactId, reference, lineItems, salesAccountCode }) {
  assert(contactId, "Missing contactId");
  assert(reference, "Missing reference");
  assert(Array.isArray(lineItems), "lineItems must be an array");

  const payload = {
    Invoices: [
      {
        Type: "ACCREC",
        Status: "DRAFT",
        Contact: { ContactID: contactId },
        Date: todayYmdUTC(),
        DueDate: todayYmdUTC(),
        Reference: reference,
        LineAmountTypes: "Inclusive",
        LineItems: lineItems.map((li) => ({
          Description: li.Description,
          Quantity: li.Quantity ?? 1,
          UnitAmount: li.UnitAmount,
          AccountCode: li.AccountCode || salesAccountCode,
        })),
      },
    ],
  };

  const res = await xeroRequest({
    accessToken,
    tenantId,
    path: "/Invoices",
    method: "POST",
    body: payload,
  });

  const inv = Array.isArray(res?.Invoices) && res.Invoices[0] ? res.Invoices[0] : null;
  if (!inv?.InvoiceID) throw new Error("Failed to create draft monthly invoice in Xero");
  return inv;
}

export async function updateExistingInvoiceLines({ accessToken, tenantId, invoiceId, contactId, reference, lineItems, salesAccountCode }) {
  assert(invoiceId, "Missing invoiceId");
  assert(contactId, "Missing contactId");
  assert(Array.isArray(lineItems), "lineItems must be an array");

  const payload = {
    Invoices: [
      {
        InvoiceID: invoiceId,
        Type: "ACCREC",
        Status: "DRAFT",
        Contact: { ContactID: contactId },
        Reference: reference || undefined,
        LineAmountTypes: "Inclusive",
        LineItems: lineItems.map((li) => ({
          Description: li.Description,
          Quantity: li.Quantity ?? 1,
          UnitAmount: li.UnitAmount,
          AccountCode: li.AccountCode || salesAccountCode,
        })),
      },
    ],
  };

  const res = await xeroRequest({
    accessToken,
    tenantId,
    path: "/Invoices",
    method: "POST",
    body: payload,
  });

  const inv = Array.isArray(res?.Invoices) && res.Invoices[0] ? res.Invoices[0] : null;
  if (!inv?.InvoiceID) throw new Error("Failed to update draft invoice lines in Xero");
  return inv;
}
