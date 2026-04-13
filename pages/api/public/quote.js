// pages/api/public/quote.js

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getSkipPricesForPostcodeAdmin } from "../../../lib/getSkipPricesForPostcode";

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

function toDateOnly(value) {
  const d = value ? new Date(value) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseCutoffTime(value) {
  const t = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function isAllowedWeekday(date, allowSaturday, allowSunday) {
  const day = date.getDay();
  if (day === 6 && !allowSaturday) return false;
  if (day === 0 && !allowSunday) return false;
  return true;
}

function addCalendarDays(startDate, days) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function addBusinessDays(startDate, days, allowSaturday, allowSunday) {
  let remaining = Number(days || 0);
  const d = new Date(startDate);

  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isAllowedWeekday(d, allowSaturday, allowSunday)) {
      remaining -= 1;
    }
  }

  return d;
}

function moveToNextAllowedDate(date, allowSaturday, allowSunday) {
  const d = new Date(date);
  while (!isAllowedWeekday(d, allowSaturday, allowSunday)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function calculateEarliestBookingDate({
  now = new Date(),
  subscriberNoticeDays = 0,
  subscriberNoticeBusinessDays = true,
  allowSaturday = false,
  allowSunday = false,
  cutoffTime = null,
  permitRequired = false,
  permitDelayBusinessDays = 0,
}) {
  const nowDt = new Date(now);
  let baseDate = toDateOnly(nowDt);

  const cutoff = parseCutoffTime(cutoffTime);
  if (cutoff) {
    const afterCutoff =
      nowDt.getHours() > cutoff.hh ||
      (nowDt.getHours() === cutoff.hh && nowDt.getMinutes() >= cutoff.mm);

    if (afterCutoff) {
      baseDate = addCalendarDays(baseDate, 1);
    }
  }

  let subscriberDate = new Date(baseDate);
  if (subscriberNoticeBusinessDays) {
    subscriberDate = addBusinessDays(
      subscriberDate,
      subscriberNoticeDays,
      allowSaturday,
      allowSunday
    );
  } else {
    subscriberDate = addCalendarDays(subscriberDate, subscriberNoticeDays);
    subscriberDate = moveToNextAllowedDate(
      subscriberDate,
      allowSaturday,
      allowSunday
    );
  }

  let permitDate = new Date(baseDate);
  if (permitRequired) {
    permitDate = addBusinessDays(
      permitDate,
      permitDelayBusinessDays,
      allowSaturday,
      allowSunday
    );
  }

  let earliest = subscriberDate > permitDate ? subscriberDate : permitDate;
  earliest = moveToNextAllowedDate(earliest, allowSaturday, allowSunday);

  return {
    earliestDate: ymd(earliest),
    debug: {
      subscriberDate: ymd(subscriberDate),
      permitDate: ymd(permitDate),
      finalDate: ymd(earliest),
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const safeBody = req.body && typeof req.body === "object" ? req.body : {};

    const slug = asSlug(safeBody.slug);
    const postcode = asText(safeBody.postcode);
    const placementType = asText(safeBody.placement_type) || "private";
    const permitSettingId = asText(safeBody.permit_setting_id);
    const selectedSkipTypeId = asText(safeBody.skip_type_id);

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
