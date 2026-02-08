// pages/api/jobs/create.js
//
// POST
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Creates a job + creates initial delivery event + sends booking email
// Then triggers Xero invoice automatically for cash/card.
// For account payment_type: no immediate invoice (monthly DRAFT is handled later).
//
// Returns:
// { ok: true, job, invoice: { ok: true, ... } | { ok:false, ... } | null }

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { createInvoiceForJob } from "../xero/xero_create_invoice";

function clampMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.round(x * 100) / 100);
}

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function buildBaseUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || "http").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = auth.subscriber_id;
    const supabase = getSupabaseAdmin();

    const body = req.body && typeof req.body === "object" ? req.body : {};

    // Required fields (server-side)
    const customer_id = asText(body.customer_id);
    const skip_type_id = asText(body.skip_type_id);
    const payment_type = asText(body.payment_type);
    const price_inc_vat = clampMoney(body.price_inc_vat);

    if (!customer_id) return res.status(400).json({ ok: false, error: "customer_id is required" });
    if (!skip_type_id) return res.status(400).json({ ok: false, error: "skip_type_id is required" });
    if (!payment_type) return res.status(400).json({ ok: false, error: "payment_type is required" });
    if (!(price_inc_vat > 0)) return res.status(400).json({ ok: false, error: "price_inc_vat must be > 0" });

    // Optional fields / snapshot fields
    const insertPayload = {
      subscriber_id: subscriberId,
      customer_id,
      skip_type_id,

      site_name: asText(body.site_name) || null,
      site_address_line1: asText(body.site_address_line1) || null,
      site_address_line2: asText(body.site_address_line2) || null,
      site_town: asText(body.site_town) || null,
      site_postcode: asText(body.site_postcode) || null,

      scheduled_date: asText(body.scheduled_date) || null,
      notes: asText(body.notes) || null,

      payment_type,
      price_inc_vat,

      placement_type: asText(body.placement_type) || "private",
      permit_setting_id: asText(body.permit_setting_id) || null,
      permit_price_no_vat: body.permit_price_no_vat == null ? null : clampMoney(body.permit_price_no_vat),
      permit_delay_business_days:
        body.permit_delay_business_days == null ? null : Number(body.permit_delay_business_days || 0),
      permit_validity_days: body.permit_validity_days == null ? null : Number(body.permit_validity_days || 0),
      permit_override: !!body.permit_override,
      weekend_override: !!body.weekend_override,
    };

    const { data: job, error: insertError } = await supabase
      .from("jobs")
      .insert([insertPayload])
      .select(
        `
        id,
        job_number,
        subscriber_id,
        customer_id,
        skip_type_id,
        job_status,
        scheduled_date,
        notes,
        site_name,
        site_address_line1,
        site_address_line2,
        site_town,
        site_postcode,
        payment_type,
        price_inc_vat,
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
      .single();

    if (insertError || !job) {
      console.error("jobs/create insert error:", insertError);
      return res.status(400).json({ ok: false, error: "Could not create job" });
    }

    // Create initial delivery event
    const { error: eventError } = await supabase.rpc("create_job_event", {
      _subscriber_id: subscriberId,
      _job_id: job.id,
      _event_type: "delivery",
      _scheduled_at: null,
      _completed_at: null,
      _notes: "Initial delivery booked",
    });

    if (eventError) {
      console.error("jobs/create create_job_event error:", eventError);
      return res.status(500).json({
        ok: false,
        error: "Job created but delivery event failed",
        details: eventError.message || String(eventError),
        job,
      });
    }

    // Fire-and-forget email (server-side)
    try {
      const baseUrl = buildBaseUrl(req);
      await fetch(`${baseUrl}/api/send_booking_email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job,
          customerName: asText(body.customer_name) || null,
          customerEmail: asText(body.customer_email) || null,
          jobPrice: String(price_inc_vat),
        }),
      });
    } catch (e) {
      console.error("jobs/create send_booking_email failed:", e);
      // Do not fail booking
    }

    // STEP B: auto-invoice for cash/card only
    let invoice = null;

    if (payment_type === "card" || payment_type === "cash") {
      try {
        const inv = await createInvoiceForJob({ subscriberId, jobId: job.id });
        invoice = { ok: true, ...inv };
      } catch (e) {
        invoice = { ok: false, error: "Invoice failed", details: String(e?.message || e) };
      }
    }

    return res.status(200).json({ ok: true, job, invoice });
  } catch (err) {
    console.error("jobs/create unexpected error:", err);
    return res.status(500).json({ ok: false, error: "Unexpected error", details: String(err?.message || err) });
  }
}
