// pages/api/public/confirm-booking.js

import Stripe from "stripe";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { createInvoiceForJob } from "../xero/xero_create_invoice";
import { getSkipPricesForPostcodeAdmin } from "../../../lib/getSkipPricesForPostcode";
import { calculateEarliestBookingDate } from "../../../lib/booking/bookingAvailability";

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

async function loadSubscriberBySlug(supabase, slug) {
  const { data, error } = await supabase
    .from("subscribers")
    .select(`
      id,
      company_name,
      public_booking_enabled,
      public_booking_slug,
      public_booking_title,
      public_booking_notice_days,
      public_booking_notice_working_days,
      public_booking_allow_saturday,
      public_booking_allow_sunday,
      public_booking_max_days_ahead,
      public_booking_cutoff_time,
      public_booking_use_permit_lead_times
    `)
    .ilike("public_booking_slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to load subscriber");
  if (!data || !data.public_booking_enabled) throw new Error("Booking page not found");
  return data;
}

async function loadPermit(supabase, subscriberId, permitSettingId) {
  if (!permitSettingId) return null;

  const { data, error } = await supabase
    .from("permit_settings")
    .select("id, name, price_no_vat, delay_business_days, validity_days, is_active")
    .eq("subscriber_id", subscriberId)
    .eq("id", permitSettingId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to load permit setting");
  if (!data) throw new Error("Selected permit setting was not found");
  return data;
}

async function buildValidatedQuote({
  supabase,
  slug,
  postcode,
  placementType,
  permitSettingId,
  skipTypeId,
  scheduledDate,
}) {
  const subscriber = await loadSubscriberBySlug(supabase, slug);
  const skipOptions = await getSkipPricesForPostcodeAdmin(subscriber.id, postcode);

  if (!Array.isArray(skipOptions) || !skipOptions.length) {
    throw new Error("We don't serve this postcode or no prices are set.");
  }

  const selectedSkip =
    skipOptions.find((s) => String(s.skip_type_id) === String(skipTypeId || "")) || null;

  if (!selectedSkip) {
    throw new Error("Selected skip type is not valid for this postcode.");
  }

  const permit =
    placementType === "permit"
      ? await loadPermit(supabase, subscriber.id, permitSettingId)
      : null;

  const usePermitLeadTimes = !!subscriber.public_booking_use_permit_lead_times;
  const permitRequired = placementType === "permit" && !!permit && usePermitLeadTimes;

  const availability = calculateEarliestBookingDate({
    now: new Date(),
    subscriberNoticeDays: Number(subscriber.public_booking_notice_days || 0),
    subscriberNoticeBusinessDays: !!subscriber.public_booking_notice_working_days,
    allowSaturday: !!subscriber.public_booking_allow_saturday,
    allowSunday: !!subscriber.public_booking_allow_sunday,
    cutoffTime: subscriber.public_booking_cutoff_time || null,
    permitRequired,
    permitDelayBusinessDays: Number(permit?.delay_business_days || 0),
  });

  if (!scheduledDate) throw new Error("Delivery date is required.");
  if (availability.earliestDate && scheduledDate < availability.earliestDate) {
    throw new Error(`Earliest available delivery date is ${availability.earliestDate}.`);
  }

  const skipPriceIncVat = clampMoney(selectedSkip.price_inc_vat);
  const permitPriceNoVat = clampMoney(permit?.price_no_vat || 0);
  const totalToCharge = clampMoney(skipPriceIncVat + permitPriceNoVat);

  return {
    subscriber,
    selectedSkip,
    permit,
    pricing: {
      skipPriceIncVat,
      permitPriceNoVat,
      totalToCharge,
    },
  };
}

async function findExistingJobBySession(supabase, subscriberId, sessionId) {
  const token = `[stripe_session:${sessionId}]`;

  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number")
    .eq("subscriber_id", subscriberId)
    .ilike("notes", `%${token}%`)
    .limit(1);

  if (error) throw new Error(error.message || "Failed to check existing booking");
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function findOrCreateCustomer(supabase, subscriberId, md) {
  const email = asText(md.customer_email).toLowerCase();

  const { data: existing, error: findErr } = await supabase
    .from("customers")
    .select("id")
    .eq("subscriber_id", subscriberId)
    .ilike("email", email)
    .limit(1);

  if (findErr) throw new Error(findErr.message || "Failed to look up customer");

  if (Array.isArray(existing) && existing.length) {
    return existing[0].id;
  }

  const insertPayload = {
    subscriber_id: subscriberId,
    first_name: asText(md.customer_first_name),
    last_name: asText(md.customer_last_name),
    company_name: asText(md.customer_company_name) || null,
    email,
    phone: asText(md.customer_phone),
    address_line1: asText(md.site_address_line1),
    address_line2: asText(md.site_address_line2),
    address_line3: asText(md.site_town),
    postcode: asText(md.postcode),
    is_credit_account: false,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("customers")
    .insert([insertPayload])
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || "Could not create customer");
  }

  return inserted.id;
}

async function sendBookingEmail(req, job, md, totalToCharge) {
  try {
    const baseUrl = getBaseUrl(req);
    await fetch(`${baseUrl}/api/send_booking_email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job,
        customerName: `${asText(md.customer_first_name)} ${asText(md.customer_last_name)}`.trim(),
        customerEmail: asText(md.customer_email),
        jobPrice: String(totalToCharge),
      }),
    });
  } catch (err) {
    console.warn("public confirm send_booking_email failed:", err?.message || err);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ ok: false, error: "STRIPE_SECRET_KEY is missing" });
    }

    const sessionId = asText(req.body?.session_id);
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "session_id is required" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    if (!session) {
      return res.status(404).json({ ok: false, error: "Checkout session not found" });
    }

    if (session.payment_status !== "paid") {
      return res.status(400).json({ ok: false, error: "Checkout session is not paid" });
    }

    const md = session.metadata || {};
    const slug = asText(md.booking_slug);
    const postcode = asText(md.postcode);
    const placementType = asText(md.placement_type) || "private";
    const permitSettingId = asText(md.permit_setting_id);
    const skipTypeId = asText(md.skip_type_id);
    const scheduledDate = asText(md.scheduled_date);

    const supabase = getSupabaseAdmin();

    const quote = await buildValidatedQuote({
      supabase,
      slug,
      postcode,
      placementType,
      permitSettingId,
      skipTypeId,
      scheduledDate,
    });

    const existing = await findExistingJobBySession(supabase, quote.subscriber.id, session.id);
    if (existing) {
      return res.status(200).json({
        ok: true,
        already_confirmed: true,
        job_id: existing.id,
        job_number: existing.job_number,
      });
    }

    const customerId = await findOrCreateCustomer(supabase, quote.subscriber.id, md);

    const { data: allocatedJobNumber, error: allocErr } = await supabase.rpc("alloc_job_number", {
      p_subscriber_id: quote.subscriber.id,
    });

    if (allocErr || !allocatedJobNumber) {
      throw new Error("Could not allocate a job number");
    }

    const sessionToken = `[stripe_session:${session.id}]`;
    const notes = [asText(md.notes), sessionToken].filter(Boolean).join("\n");

    const insertPayload = {
      subscriber_id: quote.subscriber.id,
      customer_id: customerId,
      skip_type_id: String(quote.selectedSkip.skip_type_id),

      site_name: asText(md.site_name) || null,
      site_address_line1: asText(md.site_address_line1) || null,
      site_address_line2: asText(md.site_address_line2) || null,
      site_town: asText(md.site_town) || null,
      site_postcode: postcode || null,

      scheduled_date: scheduledDate || null,
      notes: notes || null,

      payment_type: "card",
      price_inc_vat: clampMoney(quote.pricing.skipPriceIncVat),

      placement_type: placementType || "private",
      permit_setting_id: quote.permit?.id || null,
      permit_price_no_vat: quote.permit ? clampMoney(quote.pricing.permitPriceNoVat) : null,
      permit_delay_business_days: quote.permit ? Number(quote.permit.delay_business_days || 0) : null,
      permit_validity_days: quote.permit ? Number(quote.permit.validity_days || 0) : null,
      permit_override: false,
      weekend_override: false,

      job_number: allocatedJobNumber,
    };

    const { data: job, error: insertErr } = await supabase
      .from("jobs")
      .insert([insertPayload])
      .select("*")
      .single();

    if (insertErr || !job) {
      throw new Error(insertErr?.message || "Could not create job");
    }

    const { error: eventError } = await supabase.rpc("create_job_event", {
      _subscriber_id: quote.subscriber.id,
      _job_id: job.id,
      _event_type: "delivery",
      _scheduled_at: null,
      _completed_at: null,
      _notes: "Initial delivery booked",
    });

    if (eventError) {
      throw new Error(`Job created but delivery event failed: ${eventError.message}`);
    }

    let invoice = null;
    try {
      const inv = await createInvoiceForJob({
        subscriberId: quote.subscriber.id,
        jobId: job.id,
      });
      invoice = { ok: true, ...inv };
    } catch (err) {
      invoice = {
        ok: false,
        error: "Invoice failed",
        details: String(err?.message || err),
      };
    }

    await sendBookingEmail(req, job, md, quote.pricing.totalToCharge);

    return res.status(200).json({
      ok: true,
      already_confirmed: false,
      job_id: job.id,
      job_number: job.job_number,
      invoice,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err?.message || "Could not confirm booking"),
    });
  }
}
