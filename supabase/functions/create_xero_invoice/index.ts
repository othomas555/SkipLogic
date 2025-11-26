// supabase/functions/create_xero_invoice/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(JSON.stringify({ error: "Missing job_id" }), { status: 400 });
    }

    // Load secrets
    const clientId = Deno.env.get("XERO_CLIENT_ID")!;
    const clientSecret = Deno.env.get("XERO_CLIENT_SECRET")!;
    const refreshToken = Deno.env.get("XERO_REFRESH_TOKEN")!;
    const tenantId = Deno.env.get("XERO_TENANT_ID")!;

    // STEP 1 — Refresh the access token
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenResp = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResp.ok) {
      const msg = await tokenResp.text();
      throw new Error(`Failed to refresh token: ${msg}`);
    }

    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson.access_token;

    // STEP 2 — Load job + customer from Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { data: jobData, error: jobErr } = await fetch(
      `${supabaseUrl}/rest/v1/jobs?id=eq.${job_id}&select=*,customer:customer_id(*)`,
      {
        headers: {
          apikey: supabaseAnon,
          Authorization: `Bearer ${supabaseAnon}`,
        },
      }
    ).then((r) => r.json());

    if (jobErr || !jobData || jobData.length === 0) {
      throw new Error("Job not found");
    }

    const job = jobData[0];
    const customer = job.customer;

    // Build invoice description
    const description = [
      `${job.skip_type_id} Yard Skip Hire (Card Payment)`,
      `Delivery: ${job.site_postcode}`,
      `Job: ${job.job_number}`,
    ].join("\n");

    // STEP 3 — Create invoice in Xero
    const invoiceResp = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-tenant-id": tenantId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Type: "ACCREC",
        Contact: {
          Name: customer.company_name || `${customer.first_name} ${customer.last_name}`,
        },
        LineItems: [
          {
            Description: description,
            Quantity: 1,
            UnitAmount: job.price_inc_vat,
            TaxType: "OUTPUT2",
          },
        ],
        Status: "AUTHORISED",
      }),
    });

    if (!invoiceResp.ok) {
      const msg = await invoiceResp.text();
      throw new Error(`Create invoice failed: ${msg}`);
    }

    const invoiceJson = await invoiceResp.json();
    const invoice = invoiceJson.Invoices[0];

    // STEP 4 — Mark invoice PAID
    await fetch("https://api.xero.com/api.xro/2.0/Payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-tenant-id": tenantId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Invoice: { InvoiceID: invoice.InvoiceID },
        Account: { Code: "880" }, // ✔️ Card payments
        Amount: job.price_inc_vat,
        Date: new Date().toISOString().split("T")[0],
      }),
    });

    // STEP 5 — Store details in database
    await fetch(`${supabaseUrl}/rest/v1/jobs?id=eq.${job_id}`, {
      method: "PATCH",
      headers: {
        apikey: supabaseAnon,
        Authorization: `Bearer ${supabaseAnon}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        xero_invoice_id: invoice.InvoiceID,
        xero_invoice_number: invoice.InvoiceNumber,
        xero_invoice_status: "PAID",
      }),
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
