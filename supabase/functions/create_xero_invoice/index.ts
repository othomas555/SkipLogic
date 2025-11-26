// supabase/functions/xero_create_invoice/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json().catch(() => null);
    const job_id = body?.job_id as string | undefined;

    if (!job_id) {
      return new Response(JSON.stringify({ error: "Missing job_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Setup Supabase client (service role) ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // --- Load job + related customer + subscriber + skip type ---
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(
        `
        id,
        job_number,
        customer_id,
        skip_type_id,
        payment_type,
        site_postcode,
        scheduled_date,
        price_inc_vat,
        subscriber:subscriber_id (
          id,
          xero_refresh_token,
          xero_tenant_id
        ),
        customer:customer_id (
          company_name,
          first_name,
          last_name
        ),
        skip_type:skip_type_id (
          name
        )
      `
      )
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      console.error("Error loading job:", jobError);
      throw new Error("Job not found");
    }

    const subscriber = job.subscriber;
    const customer = job.customer;
    const skipType = job.skip_type;

    if (!subscriber?.xero_refresh_token || !subscriber?.xero_tenant_id) {
      throw new Error("Subscriber does not have Xero connected");
    }

    const xeroRefreshToken = subscriber.xero_refresh_token as string;
    const xeroTenantId = subscriber.xero_tenant_id as string;

    const paymentType = (job.payment_type || "").toLowerCase(); // "card" | "cash" | "account"

    // --- Decide the amount ---
    let amount: number | null = job.price_inc_vat ?? null;

    // If no job.price_inc_vat stored yet, you could fallback to postcode pricing in future
    if (amount == null) {
      throw new Error(
        "No price_inc_vat stored on job. Please store job price before invoicing."
      );
    }

    // --- Build contact name & description ---
    const contactName =
      customer?.company_name ||
      `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim() ||
      "Skip Hire Customer";

    const paymentLabel =
      paymentType === "card"
        ? "Card Payment"
        : paymentType === "cash"
        ? "Cash"
        : "Account";

    const skipName = skipType?.name || "Skip";

    const descriptionLines = [
      `${skipName} Skip Hire (${paymentLabel})`,
      `Delivery: ${job.site_postcode ?? ""}`,
      `Job: ${job.job_number ?? job.id}`,
    ];
    const description = descriptionLines.join("\n");

    // --- Refresh Xero access token using subscriber's refresh token ---
    const clientId = Deno.env.get("XERO_CLIENT_ID");
    const clientSecret = Deno.env.get("XERO_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      throw new Error("XERO_CLIENT_ID or XERO_CLIENT_SECRET not set");
    }

    const basicAuth = btoa(`${clientId}:${clientSecret}`);

    const tokenResp = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: xeroRefreshToken,
      }),
    });

    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok) {
      console.error("Xero token error:", tokenJson);
      throw new Error("Failed to refresh Xero token");
    }

    const accessToken = tokenJson.access_token as string;
    const newRefreshToken = tokenJson.refresh_token as string;

    // --- Store updated refresh token back on subscriber ---
    const { error: updateSubError } = await supabase
      .from("subscribers")
      .update({ xero_refresh_token: newRefreshToken })
      .eq("id", subscriber.id);

    if (updateSubError) {
      console.error("Failed to update subscriber refresh token:", updateSubError);
    }

    // --- Build the invoice body ---
    const today = new Date();
    const isoDate = today.toISOString().split("T")[0];

    // For now: 
    //  - CARD    → new invoice, then Payment
    //  - CASH    → new invoice, unpaid
    //  - ACCOUNT → new invoice, unpaid (monthly grouping can be added later)
    const invoiceBody: any = {
      Type: "ACCREC",
      Contact: {
        Name: contactName,
      },
      Date: isoDate,
      LineItems: [
        {
          Description: description,
          Quantity: 1,
          UnitAmount: amount,
          TaxType: "OUTPUT2", // 20% VAT in many UK Xero setups; adjust if needed
        },
      ],
      Status: "AUTHORISED", // creates an "Awaiting Payment" invoice
    };

    const invoiceResp = await fetch(
      "https://api.xero.com/api.xro/2.0/Invoices",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-tenant-id": xeroTenantId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ Invoices: [invoiceBody] }),
      }
    );

    const invoiceJson = await invoiceResp.json();
    if (!invoiceResp.ok) {
      console.error("Xero invoice error:", invoiceJson);
      throw new Error("Failed to create invoice in Xero");
    }

    const createdInvoice = invoiceJson.Invoices?.[0];
    if (!createdInvoice) {
      throw new Error("Xero returned no invoice");
    }

    let invoiceStatus = createdInvoice.Status as string;

    // --- For CARD: create a Payment to mark the invoice as PAID ---
    if (paymentType === "card") {
      const paymentResp = await fetch(
        "https://api.xero.com/api.xro/2.0/Payments",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Xero-tenant-id": xeroTenantId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Payments: [
              {
                Invoice: { InvoiceID: createdInvoice.InvoiceID },
                Account: { Code: "880" }, // your card account code
                Date: isoDate,
                Amount: amount,
              },
            ],
          }),
        }
      );

      const paymentJson = await paymentResp.json();
      if (!paymentResp.ok) {
        console.error("Xero payment error:", paymentJson);
        // Don't fail the whole function; invoice still exists as AUTHORIZED
      } else {
        // After payment, Xero usually sets status to "PAID"
        invoiceStatus = "PAID";
      }
    }

    // --- Store invoice details on job ---
    const { error: updateJobError } = await supabase
      .from("jobs")
      .update({
        xero_invoice_id: createdInvoice.InvoiceID,
        xero_invoice_number: createdInvoice.InvoiceNumber,
        xero_invoice_status: invoiceStatus,
      })
      .eq("id", job.id);

    if (updateJobError) {
      console.error("Failed to update job with invoice info:", updateJobError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        invoice_id: createdInvoice.InvoiceID,
        invoice_number: createdInvoice.InvoiceNumber,
        invoice_status: invoiceStatus,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("xero_create_invoice error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
