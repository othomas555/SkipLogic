// supabase/functions/xero_create_invoice/index.ts
//
// Invoked from your app with:
// supabase.functions.invoke("xero_create_invoice", { body: { job_id } });
//
// Behaviour:
// - Uses jobs.price_inc_vat for the line amount
// - payment_type = 'card'   → create invoice + mark as PAID via Payment
// - payment_type = 'cash'   → create invoice, leave UNPAID
// - payment_type = 'account'→ append line to monthly account invoice

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Xero config – you should already have these wired from your previous setup
const XERO_ACCESS_TOKEN = Deno.env.get("XERO_ACCESS_TOKEN")!;
const XERO_TENANT_ID = Deno.env.get("XERO_TENANT_ID")!;

// Xero account codes (set these in Supabase → Project Settings → Functions → Config Vars)
const XERO_SALES_ACCOUNT_CODE = Deno.env.get("XERO_SALES_ACCOUNT_CODE") || "200";
const XERO_CARD_CLEARING_ACCOUNT_CODE =
  Deno.env.get("XERO_CARD_CLEARING_ACCOUNT_CODE") || "800"; // e.g. Stripe/Revolut clearing
const XERO_CASH_ACCOUNT_CODE =
  Deno.env.get("XERO_CASH_ACCOUNT_CODE") || "101"; // petty cash or similar

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

type JobRow = {
  id: string;
  job_number: string | null;
  subscriber_id: string;
  customer_id: string;
  payment_type: string | null;
  price_inc_vat: number | null;
  notes: string | null;
  scheduled_date: string | null;
  site_postcode: string | null;
};

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
};

async function xeroRequest(path: string, init: RequestInit = {}) {
  const url = `https://api.xero.com/api.xro/2.0${path}`;

  const headers: HeadersInit = {
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
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore JSON parse errors
  }

  if (!res.ok) {
    console.error("Xero error:", res.status, text);
    throw new Error(
      `Xero request failed: ${res.status} ${res.statusText} – ${text}`,
    );
  }

  return json;
}

function buildContactName(c: CustomerRow): string {
  const person = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  if (c.company_name) {
    return person ? `${c.company_name} – ${person}` : c.company_name;
  }
  return person || "Unknown Customer";
}

function buildLineDescription(job: JobRow, customer: CustomerRow): string {
  const base =
    job.notes ||
    `Skip hire ${job.job_number ?? ""}`.trim() ||
    "Skip hire";
  const loc = job.site_postcode ? ` @ ${job.site_postcode}` : "";
  return `${base}${loc}`;
}

// Create a one-off invoice for this job
async function createSingleInvoice(
  job: JobRow,
  customer: CustomerRow,
  markPaid: boolean,
) {
  const contactName = buildContactName(customer);
  const description = buildLineDescription(job, customer);
  const amount = job.price_inc_vat!;

  // 1) Create invoice
  const invoicePayload = {
    Invoices: [
      {
        Type: "ACCREC",
        Status: "AUTHORISED",
        Contact: {
          Name: contactName,
          // If later you store ContactID on the customer record, put it here
          // ContactID: customer.xero_contact_id
        },
        Date: new Date().toISOString().slice(0, 10),
        DueDate: new Date().toISOString().slice(0, 10),
        InvoiceNumber: job.job_number ?? undefined,
        Reference: job.job_number ?? undefined,
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
async function getOrCreateAccountInvoice(
  job: JobRow,
  customer: CustomerRow,
) {
  const contactName = buildContactName(customer);
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const reference = `ACCOUNT-${year}-${month}`;

  // Try to find an existing DRAFT invoice for this contact + month
  const where = encodeURIComponent(
    `Contact.Name=="${contactName}" AND Reference=="${reference}" AND Status=="DRAFT"`,
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
async function appendLineToAccountInvoice(
  job: JobRow,
  customer: CustomerRow,
  invoice: any,
) {
  const description = buildLineDescription(job, customer);
  const amount = job.price_inc_vat!;

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

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400 },
      );
    }

    // 1) Load job (including price_inc_vat and payment_type)
    const { data: job, error: jobError } = await supabaseAdmin
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
        site_postcode
      `,
      )
      .eq("id", job_id)
      .single<JobRow>();

    if (jobError || !job) {
      console.error("Job fetch error:", jobError);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404 },
      );
    }

    if (job.price_inc_vat == null || job.price_inc_vat <= 0) {
      return new Response(
        JSON.stringify({
          error:
            "Job has no valid price_inc_vat. Make sure price is stored before calling Xero.",
        }),
        { status: 400 },
      );
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
      `,
      )
      .eq("id", job.customer_id)
      .single<CustomerRow>();

    if (customerError || !customer) {
      console.error("Customer fetch error:", customerError);
      return new Response(
        JSON.stringify({ error: "Customer not found" }),
        { status: 404 },
      );
    }

    const paymentType = job.payment_type || "card";

    let result: any = null;

    if (paymentType === "card") {
      // Create invoice + mark as paid to card clearing account
      const inv = await createSingleInvoice(job, customer, true);
      result = {
        mode: "card",
        invoiceNumber: inv.InvoiceNumber,
        invoiceId: inv.InvoiceID,
      };
    } else if (paymentType === "cash") {
      // Crea
