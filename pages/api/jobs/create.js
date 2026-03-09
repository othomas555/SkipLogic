import { randomUUID } from "crypto";
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

function isUuidString(x) {
  const t = String(x || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t);
}

function uuidOrNull(x) {
  const t = asText(x);
  if (!t) return null;
  return isUuidString(t) ? t : null;
}

function isWithinGrace(subscription_status, grace_ends_at) {
  if (subscription_status !== "past_due") return false;
  if (!grace_ends_at) return false;
  const ms = new Date(grace_ends_at).getTime();
  if (!Number.isFinite(ms)) return false;
  return Date.now() < ms;
}

function isBillingAllowedRow(subRow) {
  if (!subRow) return false;
  if (subRow.locked_at) return false;

  const s = subRow.subscription_status;

  if (!s) return true;
  if (s === "active" || s === "trialing") return true;
  if (isWithinGrace(s, subRow.grace_ends_at)) return true;

  return false;
}

function buildAddress(jobLike) {
  return [
    jobLike?.site_address_line1,
    jobLike?.site_address_line2,
    jobLike?.site_town,
    jobLike?.site_postcode,
  ]
    .filter(Boolean)
    .join(", ");
}

async function geocodeAddress(address) {
  if (!address) return null;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("jobs/create geocode skipped: GOOGLE_MAPS_API_KEY missing");
    return null;
  }

  try {
    const url =
      "https://maps.googleapis.com/maps/api/geocode/json?address=" +
      encodeURIComponent(address) +
      "&key=" +
      encodeURIComponent(apiKey);

    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok) {
      console.warn("jobs/create geocode http failed:", resp.status);
      return null;
    }

    if (data.status !== "OK" || !Array.isArray(data.results) || !data.results.length) {
      console.warn("jobs/create geocode failed:", data.status || "UNKNOWN");
      return null;
    }

    const loc = data.results[0]?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") {
      console.warn("jobs/create geocode missing geometry.location");
      return null;
    }

    return {
      lat: loc.lat,
      lng: loc.lng,
      formatted_address: data.results[0]?.formatted_address || "",
    };
  } catch (err) {
    console.warn("jobs/create geocode unexpected:", err?.message || err);
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = await requireOfficeUser(req);
    if (!auth.ok) {
      return res.status(401).json({ ok: false, error: auth.error });
    }

    const subscriberId = auth.subscriber_id;
    const supabase = getSupabaseAdmin();
    const body = req.body && typeof req.body === "object" ? req.body : {};

    // -------------------------------------------------------------------------
    // SaaS enforcement: billing gate + active job limit gate (server-side)
    // -------------------------------------------------------------------------
    const { data: subRow, error: subErr } = await supabase
      .from("subscribers")
      .select("id, plan_variant_id, subscription_status, trial_ends_at, grace_ends_at, locked_at")
      .eq("id", subscriberId)
      .single();

    if (subErr || !subRow) {
      return res.status(500).json({
        ok: false,
        error: "Could not load subscriber",
        details: subErr?.message || null,
      });
    }

    if (!isBillingAllowedRow(subRow)) {
      const status = subRow.subscription_status || "unknown";
      return res.status(402).json({
        ok: false,
        error: "SUBSCRIPTION_INACTIVE",
        message:
          status === "past_due"
            ? "Payment failed and your grace period has ended. Please update billing to continue."
            : "Your subscription is not active. Please update billing to continue.",
        subscription_status: subRow.subscription_status,
        grace_ends_at: subRow.grace_ends_at,
        locked_at: subRow.locked_at,
      });
    }

    // Active jobs limit (based on plan_variants.active_jobs_limit)
    let activeJobsLimit = null;

    if (subRow.plan_variant_id) {
      const { data: pv, error: pvErr } = await supabase
        .from("plan_variants")
        .select("id, active_jobs_limit")
        .eq("id", subRow.plan_variant_id)
        .single();

      if (pvErr) {
        return res.status(500).json({
          ok: false,
          error: "Could not load plan variant",
          details: pvErr?.message || null,
        });
      }

      if (pv && pv.active_jobs_limit != null) {
        const n = Number(pv.active_jobs_limit);
        if (Number.isFinite(n) && n > 0) activeJobsLimit = Math.trunc(n);
      }
    }

    if (activeJobsLimit != null) {
      const { count, error: cntErr } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("subscriber_id", subscriberId)
        .in("job_status", ["booked", "delivered"]);

      if (cntErr) {
        return res.status(500).json({
          ok: false,
          error: "Could not count active jobs",
          details: cntErr?.message || null,
        });
      }

      const activeJobs = Number(count || 0);

      if (activeJobs >= activeJobsLimit) {
        return res.status(409).json({
          ok: false,
          error: "PLAN_LIMIT_EXCEEDED",
          message: `You are at your active job limit (${activeJobsLimit}). Upgrade to continue.`,
          limit: activeJobsLimit,
          active_jobs: activeJobs,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Existing job creation logic
    // -------------------------------------------------------------------------
    const customer_id = asText(body.customer_id);
    const skip_type_id = asText(body.skip_type_id);
    const payment_type = asText(body.payment_type);
    const price_inc_vat = clampMoney(body.price_inc_vat);

    const create_invoice = body.create_invoice === false ? false : true;

    if (!customer_id) return res.status(400).json({ ok: false, error: "customer_id is required" });
    if (!skip_type_id) return res.status(400).json({ ok: false, error: "skip_type_id is required" });
    if (!payment_type) return res.status(400).json({ ok: false, error: "payment_type is required" });
    if (!(price_inc_vat > 0)) return res.status(400).json({ ok: false, error: "price_inc_vat must be > 0" });

    const credit_override_reason = asText(body.credit_override_reason) || null;
    let credit_override_token = uuidOrNull(body.credit_override_token);

    if (!credit_override_token && credit_override_reason) {
      credit_override_token = randomUUID();
    }

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
      permit_setting_id: uuidOrNull(body.permit_setting_id),
      permit_price_no_vat: body.permit_price_no_vat == null ? null : clampMoney(body.permit_price_no_vat),
      permit_delay_business_days: body.permit_delay_business_days == null ? null : Number(body.permit_delay_business_days || 0),
      permit_validity_days: body.permit_validity_days == null ? null : Number(body.permit_validity_days || 0),
      permit_override: !!body.permit_override,
      weekend_override: !!body.weekend_override,

      credit_override_token,
      credit_override_reason,
    };

    const { data: job, error: insertError } = await supabase
      .from("jobs")
      .insert([insertPayload])
      .select("*")
      .single();

    if (insertError || !job) {
      console.error("jobs/create insert error:", insertError);
      return res.status(400).json({
        ok: false,
        error: insertError?.message || "Could not create job",
        code: insertError?.code || null,
        details: insertError?.details || null,
        hint: insertError?.hint || null,
      });
    }

    // -------------------------------------------------------------------------
    // NEW: geocode newly created jobs
    // -------------------------------------------------------------------------
    let geocode = null;
    try {
      const address = buildAddress(job);
      geocode = await geocodeAddress(address);

      if (geocode) {
        const { error: geoUpdateErr } = await supabase
          .from("jobs")
          .update({
            site_lat: geocode.lat,
            site_lng: geocode.lng,
          })
          .eq("id", job.id)
          .eq("subscriber_id", subscriberId);

        if (geoUpdateErr) {
          console.warn("jobs/create geocode update failed:", geoUpdateErr.message);
        } else {
          job.site_lat = geocode.lat;
          job.site_lng = geocode.lng;
        }
      }
    } catch (e) {
      console.warn("jobs/create geocode block failed:", e?.message || e);
    }

    // Initial delivery event
    const { error: eventError } = await supabase.rpc("create_job_event", {
      _subscriber_id: subscriberId,
      _job_id: job.id,
      _event_type: "delivery",
      _scheduled_at: null,
      _completed_at: null,
      _notes: "Initial delivery booked",
    });

    if (eventError) {
      return res.status(500).json({
        ok: false,
        error: "Job created but delivery event failed",
        details: eventError.message,
        job,
      });
    }

    // Auto-invoice for cash/card ONLY if create_invoice true
    let invoice = null;
    if (create_invoice && (payment_type === "card" || payment_type === "cash")) {
      try {
        const inv = await createInvoiceForJob({ subscriberId, jobId: job.id });
        invoice = { ok: true, ...inv, mode: inv?.mode || "auto" };
      } catch (e) {
        invoice = { ok: false, error: "Invoice failed", details: String(e?.message || e) };
      }
    }

    return res.status(200).json({
      ok: true,
      job,
      invoice,
      geocode: geocode
        ? {
            ok: true,
            lat: geocode.lat,
            lng: geocode.lng,
            formatted_address: geocode.formatted_address || "",
          }
        : {
            ok: false,
          },
    });
  } catch (err) {
    console.error("jobs/create unexpected error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
