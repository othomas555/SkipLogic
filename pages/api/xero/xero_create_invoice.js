// pages/api/xero_create_invoice.js
//
// Called from the app with:
// fetch("/api/xero_create_invoice", { method: "POST", body: JSON.stringify({ job_id }) })
//
// Behaviour:
// - Uses jobs.price_inc_vat for the line amount
// - payment_type = 'card'   → create invoice + mark as PAID via Payment
// - payment_type = 'cash'   → create invoice, leave UNPAID
// - payment_type = 'account'→ append line to monthly account invoice

import { createClient } from "@supabase/supabase-js";

// IMPORTANT: this key MUST NOT be exposed to the browser.
// Do NOT prefix it with NEXT_PUBLIC_ in Vercel.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const XERO_ACCESS_TOKEN = process.env.XERO_ACCESS_TOKEN;
const XERO_TENANT_ID = process.env.XERO_TENANT_ID;

const XERO_SALES_ACCOUNT_CODE =
  process.env.XERO_SALES_ACCOUNT_CODE || "200";
const XERO_CARD_CLEARING_ACCOUNT_CODE =
  process.env.XERO_CARD_CLEARING_ACCOUNT_CODE || "800";
const XERO_CASH_ACCOUNT_CODE =
  process.env.XERO_CASH_ACCOUNT_CODE || "101";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper to call Xero API
async function xeroRequest(path, init = {}) {
  const url = `https://api.xero.com/api.xro/2.0${path}`;

  const headers = {
    Authorization: `Bearer ${XERO_ACCESS_TOKEN}`,
    "Xero-tenant-id": XERO_TENANT_ID,
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers || {}),
  };

  const res = await fetch(url, {
    ...init,
    headers,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore JSON parse errors
  }

  if (!res.ok) {
    console.error("Xero error:", res.status, text);
    throw new Error(
      `Xero request failed: ${res.status} ${res.statusText} – ${text}`
    );
  }

  return json;
}

function buildContactName(customer) {
  const person = `${customer.first_name ?? ""} ${
    customer.last_name ?? ""
  }`.trim();
  if (customer.company_name) {
    return person
      ? `${customer.company_name} – ${person}`
      : customer.company_name;
  }
  return person || "Unknown Customer";
}

function buildLineDescription(job, customer) {
  const base =
    job.notes ||
    `Skip hire ${job.job_number ?? ""}`.trim() ||
    "Skip hire";
  const loc = job.site_postcode ? ` @ ${job.site_postcode}` : "";
  return `${base}${loc}`;
}

// Create a one-off invoice for this job
async function createSingleInvoice(job, customer, markPaid) {
  const contactName = buildContactName(customer);
  const description = buildLineDescription(job, customer);
  const amount = job.price_inc_vat;

  // 1) Create invoice
  const invoicePayload = {
    Invoices: [
      {
        Type: "ACCREC",
        Status: "AUTHORISED",
        Contact: {
          Name: contactName,
        },
        Date: new Date().toISOString().slice(0, 10),
        DueDate: new Date().toISOString().slice(0, 10),
        InvoiceNumber: job.job_number || undefined,
        Reference: job.job_number || undefined,
        LineAmountTypes: "Inclusive", // price_inc_vat already includes VAT
        LineItems: [
          {
            Description: description,
            Quantity: 1,
            UnitAmount: amount,
            AccountCode: XERO_SALES_ACCOUNT_CODE,
          },
        ],
      },
    ],
  };

  const invoiceRes = await xeroRequest("/Invoices", {
    method: "POST",
    body: JSON.stringify(invoicePayload),
  });

  const createdInvoice =
    invoiceRes?.Invoices && invoiceRes.Invoices.length > 0
      ? invoiceRes.Invoices[0]
      : null;

  if (!createdInvoice) {
    throw new Error("No invoice returned from Xero");
  }

  // 2) Optionally mark as paid
  if (markPaid) {
    const accountCode = XERO_CARD_CLEARING_ACCOUNT_CODE;

    const paymentPayload = {
      Payments: [
        {
          Invoice: {
            InvoiceID: createdInvoice.InvoiceID,
          },
          Account: {
            Code: accountCode,
          },
          Date: new Date().toISOString().slice(0, 10),
          Amount: amount,
        },
      ],
    };

    await xeroRequest("/Payments", {
      method: "PUT",
      body: JSON.stringify(paymentPayload),
    });
  }

  return createdInvoice;
}

// Get or create the monthly account invoice for this customer
async function getOrCreateAccountInvoice(job, customer) {
  const contactName = buildContactName(customer);
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const reference = `ACCOUNT-${year}-${month}`;

  // Try to find an existing DRAFT invoice for this contact + month
  const where = encodeURIComponent(
    `Contact.Name=="${contactName}" AND Reference=="${reference}" AND Status=="DRAFT"`
  );

  const existingRes = await xeroRequest(`/Invoices?where=${where}`);
  const existing =
    existingRes?.Invoices && existingRes.Invoices.length > 0
      ? existingRes.Invoices[0]
      : null;

  if (existing) {
    return existing;
  }

  // Otherwise create a new DRAFT invoice
  const payload = {
    Invoices: [
      {
        Type: "ACCREC",
        Status: "DRAFT",
        Contact: {
          Name: contactName,
        },
        Date: now.toISOString().slice(0, 10),
        DueDate: now.toISOString().slice(0, 10),
        Reference: reference,
        LineAmountTypes: "Inclusive",
        LineItems: [],
      },
    ],
  };

  const createdRes = await xeroRequest("/Invoices", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const created =
    createdRes?.Invoices && createdRes.Invoices.length > 0
      ? createdRes.Invoices[0]
      : null;

  if (!created) {
    throw new Error("Failed to create account invoice in Xero");
  }

  return created;
}

// Append a line to the account invoice
async function appendLineToAccountInvoice(job, customer, invoice) {
  const description = buildLineDescription(job, customer);
  const amount = job.price_inc_vat;

  const updatedLines = [
    ...(invoice.LineItems || []),
    {
      Description: description,
      Quantity: 1,
      UnitAmount: amount,
      AccountCode: XERO_SALES_ACCOUNT_CODE,
    },
  ];

  const payload = {
    Invoices: [
      {
        InvoiceID: invoice.InvoiceID,
        LineItems: updatedLines,
      },
    ],
  };

  const res = await xeroRequest("/Invoices", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const updated =
    res?.Invoices && res.Invoices.length > 0 ? res.Invoices[0] : null;

  if (!updated) {
    throw new Error("Failed to update account invoice in Xero");
  }

  return updated;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { job_id } = req.body || {};

    if (!job_id) {
      return res.status(400).json({ error: "job_id is required" });
    }

    // 1) Load job (including price_inc_vat and payment_type)
    const { data: job, error: jobError } = await supabaseAdmin
  .from("jobs")
  .select(`
    id,
    job_number,
    subscriber_id,
    customer_id,
    payment_type,
    price_inc_vat,
    notes,
    scheduled_date,
    site_postcode
  `)
  .eq("id", job_id)
  .single();

if (jobError) {
  console.error("Supabase jobError:", jobError);
  return res.status(500).json({
    error: "Supabase error when loading job",
    details: jobError.message || jobError,
  });
}

if (!job) {
  return res.status(404).json({
    error: "Job not found with that id",
    id: job_id,
  });
}
    if (!job.price_inc_vat || job.price_inc_vat <= 0) {
      return res.status(400).json({
        error:
          "Job has no valid price_inc_vat. Make sure price is stored before calling Xero.",
      });
    }

    // 2) Load customer
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select(
        `
        id,
        first_name,
        last_name,
        company_name,
        email
      `
      )
      .eq("id", job.customer_id)
      .single();

    if (customerError || !customer) {
      console.error("Customer fetch error:", customerError);
      return res.status(404).json({ error: "Customer not found" });
    }

    const paymentType = job.payment_type || "card";

    let result = null;

    if (paymentType === "card") {
      // Create invoice + mark as paid to card clearing account
      const inv = await createSingleInvoice(job, customer, true);
      result = {
        mode: "card",
        invoiceNumber: inv.InvoiceNumber,
        invoiceId: inv.InvoiceID,
      };
    } else if (paymentType === "cash") {
      // Create invoice, leave unpaid
      const inv = await createSingleInvoice(job, customer, false);
      result = {
        mode: "cash",
        invoiceNumber: inv.InvoiceNumber,
        invoiceId: inv.InvoiceID,
      };
    } else if (paymentType === "account") {
      // Find or create monthly account invoice and append a line
      const accInvoice = await getOrCreateAccountInvoice(job, customer);
      const updated = await appendLineToAccountInvoice(
        job,
        customer,
        accInvoice
      );

      result = {
        mode: "account",
        invoiceNumber: updated.InvoiceNumber,
        invoiceId: updated.InvoiceID,
      };
    } else {
      return res
        .status(400)
        .json({ error: `Unsupported payment_type: ${paymentType}` });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("Unexpected error in /api/xero_create_invoice:", err);
    return res.status(500).json({
      error: "Unexpected error",
      details: String(err),
    });
  }
}
