// pages/api/public/create-checkout-session.js

import Stripe from "stripe";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getSkipPricesForPostcodeAdmin } from "../../../lib/getSkipPricesForPostcode";
import { calculateEarliestBookingDate } from "../../../lib/booking/bookingAvailability";

function asSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function toPence(value) {
  return Math.round(clampMoney(value) * 100);
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
  if (!data || !data.public_booking_enabled) {
    throw new Error("Booking page not found");
  }
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

  if (!scheduledDate) {
    throw new Error("Delivery date is required.");
  }

  if (availability.earliestDate && scheduledDate < availability.earliestDate) {
    throw new Error(`Earliest available delivery date is ${availability.earliestDate}.`);
  }

  if (subscriber.public_booking_max_days_ahead != null) {
    const days = Number(subscriber.public_booking_max_days_ahead);
    if (Number.isFinite(days) && days > 0) {
      const dt = new Date();
      dt.setDate(dt.getDate() + days);
      const lastAllowed = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      if (scheduledDate > lastAllowed) {
        throw new Error(`Bookings can only be made up to ${days} day(s) ahead.`);
      }
    }
  }

  const skipPriceIncVat = clampMoney(selectedSkip.price_inc_vat);
  const permitPriceNoVat = clampMoney(permit?.price_no_vat || 0);
  const totalToCharge = clampMoney(skipPriceIncVat + permitPriceNoVat);

  return {
    subscriber,
    selectedSkip,
    permit,
    availability,
    pricing: {
      skipPriceIncVat,
      permitPriceNoVat,
      totalToCharge,
    },
  };
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

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const slug = asSlug(body.slug);
    const postcode = asText(body.postcode);
    const placementType = asText(body.placement_type) || "private";
    const permitSettingId = asText(body.permit_setting_id);
    const skipTypeId = asText(body.skip_type_id);
    const scheduledDate = asText(body.scheduled_date);

    const customer = body.customer && typeof body.customer === "object" ? body.customer : {};
    const site = body.site && typeof body.site === "object" ? body.site : {};

    const customerFirstName = asText(customer.first_name);
    const customerLastName = asText(customer.last_name);
    const customerCompanyName = asText(customer.company_name);
    const customerEmail = asText(customer.email);
    const customerPhone = asText(customer.phone);

    const siteName = asText(site.site_name);
    const siteAddress1 = asText(site.address_line1);
    const siteAddress2 = asText(site.address_line2);
    const siteTown = asText(site.town);
    const notes = asText(body.notes);

    if (!slug) return res.status(400).json({ ok: false, error: "Missing slug" });
    if (!postcode) return res.status(400).json({ ok: false, error: "Missing postcode" });
    if (!skipTypeId) return res.status(400).json({ ok: false, error: "Missing skip type" });
    if (placementType === "permit" && !permitSettingId) {
      return res.status(400).json({ ok: false, error: "Missing permit setting" });
    }
    if (!customerFirstName || !customerLastName || !customerEmail || !customerPhone) {
      return res.status(400).json({ ok: false, error: "Missing customer details" });
    }
    if (!siteAddress1 || !siteTown) {
      return res.status(400).json({ ok: false, error: "Missing site address" });
    }

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

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    });

    const baseUrl = getBaseUrl(req);
    const title =
      quote.subscriber.public_booking_title ||
      quote.subscriber.company_name ||
      "Book a skip";

    const lineItems = [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          product_data: {
            name: `${title} – ${quote.selectedSkip.skip_type_name}`,
            description: `Skip hire for ${postcode}`,
          },
          unit_amount: toPence(quote.pricing.skipPriceIncVat),
        },
      },
    ];

    if (quote.pricing.permitPriceNoVat > 0 && quote.permit) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "gbp",
          product_data: {
            name: `Permit – ${quote.permit.name}`,
            description: `Road permit fee`,
          },
          unit_amount: toPence(quote.pricing.permitPriceNoVat),
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      line_items: lineItems,
      success_url: `${baseUrl}/book/${encodeURIComponent(slug)}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/book/${encodeURIComponent(slug)}`,
      metadata: {
        booking_slug: slug,
        subscriber_id: String(quote.subscriber.id),
        postcode,
        placement_type: placementType,
        permit_setting_id: quote.permit?.id || "",
        skip_type_id: String(quote.selectedSkip.skip_type_id),
        scheduled_date: scheduledDate,

        customer_first_name: customerFirstName,
        customer_last_name: customerLastName,
        customer_company_name: customerCompanyName || "",
        customer_email: customerEmail,
        customer_phone: customerPhone,

        site_name: siteName || "",
        site_address_line1: siteAddress1,
        site_address_line2: siteAddress2 || "",
        site_town: siteTown,
        notes: notes || "",

        skip_price_inc_vat: String(quote.pricing.skipPriceIncVat),
        permit_price_no_vat: String(quote.pricing.permitPriceNoVat),
        total_to_charge: String(quote.pricing.totalToCharge),
      },
    });

    return res.status(200).json({
      ok: true,
      id: session.id,
      url: session.url,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err?.message || "Could not start checkout"),
    });
  }
}
