// pages/api/public/quote.js

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getSkipPricesForPostcodeAdmin } from "../../../lib/getSkipPricesForPostcode";
import { calculateEarliestBookingDate } from "../../lib/booking/bookingAvailability";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const slug = asSlug(body.slug);
    const postcode = asText(body.postcode);
    const placementType = asText(body.placement_type) || "private";
    const permitSettingId = asText(body.permit_setting_id);
    const selectedSkipTypeId = asText(body.skip_type_id);

    if (!slug) {
      return res.status(400).json({ ok: false, error: "Missing slug" });
    }

    if (!postcode) {
      return res.status(400).json({ ok: false, error: "Missing postcode" });
    }

    const supabase = getSupabaseAdmin();

    const { data: subscriber, error: subErr } = await supabase
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

    if (subErr) {
      return res.status(500).json({
        ok: false,
        error: subErr.message || "Failed to load subscriber",
      });
    }

    if (!subscriber || !subscriber.public_booking_enabled) {
      return res.status(404).json({
        ok: false,
        error: "Booking page not found",
      });
    }

    const subscriberId = subscriber.id;

    let skipOptions = [];
    try {
      skipOptions = await getSkipPricesForPostcodeAdmin(subscriberId, postcode);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err?.message || "Failed to look up skip prices for postcode",
      });
    }

    if (!skipOptions.length) {
      return res.status(200).json({
        ok: true,
        subscriber: {
          id: subscriber.id,
          slug: subscriber.public_booking_slug,
          title: subscriber.public_booking_title || subscriber.company_name || "Book a skip",
        },
        postcode,
        serviceable: false,
        message: "We don't serve this postcode or no prices are set.",
        skip_options: [],
        permit: null,
        pricing: null,
        availability: null,
      });
    }

    let permit = null;
    if (placementType === "permit" && permitSettingId) {
      const { data: permitRow, error: permitErr } = await supabase
        .from("permit_settings")
        .select("id, name, price_no_vat, delay_business_days, validity_days, is_active")
        .eq("subscriber_id", subscriberId)
        .eq("id", permitSettingId)
        .eq("is_active", true)
        .maybeSingle();

      if (permitErr) {
        return res.status(500).json({
          ok: false,
          error: permitErr.message || "Failed to load permit setting",
        });
      }

      if (!permitRow) {
        return res.status(400).json({
          ok: false,
          error: "Selected permit setting was not found",
        });
      }

      permit = permitRow;
    }

    const selectedSkip = selectedSkipTypeId
      ? skipOptions.find((s) => String(s.skip_type_id) === selectedSkipTypeId) || null
      : null;

    const skipPriceIncVat = clampMoney(selectedSkip?.price_inc_vat || 0);
    const permitPriceNoVat = clampMoney(permit?.price_no_vat || 0);

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

    const total = clampMoney(skipPriceIncVat + permitPriceNoVat);

    return res.status(200).json({
      ok: true,
      subscriber: {
        id: subscriber.id,
        slug: subscriber.public_booking_slug,
        title: subscriber.public_booking_title || subscriber.company_name || "Book a skip",
      },
      postcode,
      serviceable: true,
      message: `Found ${skipOptions.length} skip type(s) for this postcode.`,
      skip_options: skipOptions.map((s) => ({
        skip_type_id: s.skip_type_id,
        skip_type_name: s.skip_type_name,
        price_inc_vat: clampMoney(s.price_inc_vat),
      })),
      selected_skip: selectedSkip
        ? {
            skip_type_id: selectedSkip.skip_type_id,
            skip_type_name: selectedSkip.skip_type_name,
            price_inc_vat: skipPriceIncVat,
          }
        : null,
      permit: permit
        ? {
            id: permit.id,
            name: permit.name,
            price_no_vat: permitPriceNoVat,
            delay_business_days: Number(permit.delay_business_days || 0),
            validity_days: Number(permit.validity_days || 0),
          }
        : null,
      pricing: selectedSkip
        ? {
            skip_price_inc_vat: skipPriceIncVat,
            permit_price_no_vat: permitPriceNoVat,
            total_to_charge: total,
          }
        : null,
      availability: {
        earliest_date: availability.earliestDate,
        max_days_ahead:
          subscriber.public_booking_max_days_ahead == null
            ? null
            : Number(subscriber.public_booking_max_days_ahead),
        debug: availability.debug,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unexpected error",
    });
  }
}
