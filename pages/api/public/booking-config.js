// pages/api/public/booking-config.js

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { buildAllowedWeekdays } from "../../lib/booking/bookingAvailability";

function asSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanColor(value, fallback = "#0f172a") {
  const v = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return v;
  return fallback;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const slug = asSlug(req.query.slug);
    if (!slug) {
      return res.status(400).json({
        ok: false,
        error: "Missing slug",
      });
    }

    const supabase = getSupabaseAdmin();

    const { data: subscriber, error } = await supabase
      .from("subscribers")
      .select(`
        id,
        company_name,
        public_booking_enabled,
        public_booking_slug,
        public_booking_title,
        public_booking_logo_url,
        public_booking_primary_color,
        public_booking_phone,
        public_booking_terms_url,
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

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message || "Failed to load booking config",
      });
    }

    if (!subscriber) {
      return res.status(404).json({
        ok: false,
        error: "Booking page not found",
      });
    }

    if (!subscriber.public_booking_enabled) {
      return res.status(404).json({
        ok: false,
        error: "Online booking is not enabled",
      });
    }

    const { data: permitRows, error: permitError } = await supabase
      .from("permit_settings")
      .select("id, name, price_no_vat, delay_business_days, validity_days, is_active")
      .eq("subscriber_id", subscriber.id)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (permitError) {
      return res.status(500).json({
        ok: false,
        error: permitError.message || "Failed to load permit settings",
      });
    }

    const title =
      subscriber.public_booking_title ||
      subscriber.company_name ||
      "Book a skip";

    const allowSaturday = !!subscriber.public_booking_allow_saturday;
    const allowSunday = !!subscriber.public_booking_allow_sunday;

    return res.status(200).json({
      ok: true,
      subscriber: {
        id: subscriber.id,
        slug: subscriber.public_booking_slug,
        title,
        logo_url: subscriber.public_booking_logo_url || null,
        primary_color: cleanColor(subscriber.public_booking_primary_color),
        phone: subscriber.public_booking_phone || null,
        terms_url: subscriber.public_booking_terms_url || null,
      },
      booking_rules: {
        notice_days: Number(subscriber.public_booking_notice_days || 0),
        notice_working_days: !!subscriber.public_booking_notice_working_days,
        allow_saturday: allowSaturday,
        allow_sunday: allowSunday,
        max_days_ahead:
          subscriber.public_booking_max_days_ahead == null
            ? null
            : Number(subscriber.public_booking_max_days_ahead),
        cutoff_time: subscriber.public_booking_cutoff_time || null,
        use_permit_lead_times: !!subscriber.public_booking_use_permit_lead_times,
        allowed_weekdays: buildAllowedWeekdays({
          allowSaturday,
          allowSunday,
        }),
      },
      permit_options: (permitRows || []).map((p) => ({
        id: p.id,
        name: p.name,
        price_no_vat: Number(p.price_no_vat || 0),
        delay_business_days: Number(p.delay_business_days || 0),
        validity_days: Number(p.validity_days || 0),
      })),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unexpected error",
    });
  }
}
