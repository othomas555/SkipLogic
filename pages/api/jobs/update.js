import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function clampMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.round(x * 100) / 100);
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
    console.warn("jobs/update geocode skipped: GOOGLE_MAPS_API_KEY missing");
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

    if (!resp.ok) return null;
    if (data.status !== "OK" || !Array.isArray(data.results) || !data.results.length) return null;

    const loc = data.results[0]?.geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;

    return {
      lat: loc.lat,
      lng: loc.lng,
      formatted_address: data.results[0]?.formatted_address || "",
    };
  } catch (err) {
    console.warn("jobs/update geocode unexpected:", err?.message || err);
    return null;
  }
}

function jobHasInvoice(job) {
  return !!(job?.xero_invoice_id || job?.xero_invoice_number);
}

function changed(a, b) {
  return String(a ?? "") !== String(b ?? "");
}

function getChangedFields(existing, next) {
  const fields = [];

  if (changed(existing.customer_id, next.customer_id)) fields.push("customer");
  if (changed(existing.skip_type_id, next.skip_type_id)) fields.push("skip type");
  if (changed(existing.scheduled_date, next.scheduled_date)) fields.push("scheduled date");
  if (changed(existing.payment_type, next.payment_type)) fields.push("payment type");
  if (Number(existing.price_inc_vat || 0) !== Number(next.price_inc_vat || 0)) fields.push("price");
  if (changed(existing.site_name, next.site_name)) fields.push("site name");
  if (changed(existing.site_address_line1, next.site_address_line1)) fields.push("site address line 1");
  if (changed(existing.site_address_line2, next.site_address_line2)) fields.push("site address line 2");
  if (changed(existing.site_town, next.site_town)) fields.push("site town");
  if (changed(existing.site_postcode, next.site_postcode)) fields.push("site postcode");
  if (changed(existing.placement_type, next.placement_type)) fields.push("placement type");
  if (changed(existing.permit_setting_id, next.permit_setting_id)) fields.push("permit type");
  if (Number(existing.permit_price_no_vat || 0) !== Number(next.permit_price_no_vat || 0)) fields.push("permit price");
  if (Number(existing.permit_delay_business_days || 0) !== Number(next.permit_delay_business_days || 0)) fields.push("permit delay");
  if (Number(existing.permit_validity_days || 0) !== Number(next.permit_validity_days || 0)) fields.push("permit validity");
  if (!!existing.permit_override !== !!next.permit_override) fields.push("permit override");
  if (!!existing.weekend_override !== !!next.weekend_override) fields.push("weekend override");

  return fields;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = await requireOfficeUser(req);
    if (!auth?.ok) {
      return res.status(401).json({ ok: false, error: auth?.error || "Unauthorised" });
    }

    const subscriberId = auth.subscriber_id;
    const officeUserId = auth?.user?.id || auth?.user_id || null;
    const supabase = getSupabaseAdmin();
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const jobId = asText(body.job_id);
    if (!jobId) {
      return res.status(400).json({ ok: false, error: "job_id is required" });
    }

    const { data: existing, error: existingErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .eq("id", jobId)
      .single();

    if (existingErr || !existing) {
      return res.status(404).json({
        ok: false,
        error: existingErr?.message || "Job not found",
      });
    }

    if (existing.job_status === "cancelled") {
      return res.status(400).json({
        ok: false,
        error: "Cancelled jobs cannot be edited. Rebook or uncancel manually.",
      });
    }

    if (existing.job_status === "collected" || existing.job_status === "completed") {
      return res.status(400).json({
        ok: false,
        error: "Collected/completed jobs cannot be edited here.",
      });
    }

    const next = {
      customer_id: asText(body.customer_id),
      skip_type_id: asText(body.skip_type_id),

      site_name: asText(body.site_name) || null,
      site_address_line1: asText(body.site_address_line1) || null,
      site_address_line2: asText(body.site_address_line2) || null,
      site_town: asText(body.site_town) || null,
      site_postcode: asText(body.site_postcode) || null,

      scheduled_date: asText(body.scheduled_date) || null,
      notes: asText(body.notes) || null,

      payment_type: asText(body.payment_type) || null,
      price_inc_vat: clampMoney(body.price_inc_vat),

      placement_type: asText(body.placement_type) || "private",
      permit_setting_id: uuidOrNull(body.permit_setting_id),
      permit_price_no_vat: body.permit_price_no_vat == null ? null : clampMoney(body.permit_price_no_vat),
      permit_delay_business_days:
        body.permit_delay_business_days == null ? null : Number(body.permit_delay_business_days || 0),
      permit_validity_days:
        body.permit_validity_days == null ? null : Number(body.permit_validity_days || 0),
      permit_override: !!body.permit_override,
      weekend_override: !!body.weekend_override,
    };

    if (!next.customer_id) {
      return res.status(400).json({ ok: false, error: "customer_id is required" });
    }

    if (!next.skip_type_id) {
      return res.status(400).json({ ok: false, error: "skip_type_id is required" });
    }

    if (!next.payment_type) {
      return res.status(400).json({ ok: false, error: "payment_type is required" });
    }

    if (!(next.price_inc_vat > 0)) {
      return res.status(400).json({ ok: false, error: "price_inc_vat must be > 0" });
    }

    const changedFields = getChangedFields(existing, next);
    const hasInvoice = jobHasInvoice(existing);

    const updatePayload = {
      ...next,
      last_edited_at: new Date().toISOString(),
      last_edited_by: officeUserId,
    };

    if (hasInvoice && changedFields.length > 0) {
      updatePayload.invoice_action_required = true;
      updatePayload.invoice_action_reason = "job_edited";
      updatePayload.invoice_action_note =
        "Manual invoice review needed. Changed: " + changedFields.join(", ");
    }

    const addressChanged =
      changed(existing.site_address_line1, next.site_address_line1) ||
      changed(existing.site_address_line2, next.site_address_line2) ||
      changed(existing.site_town, next.site_town) ||
      changed(existing.site_postcode, next.site_postcode);

    if (addressChanged) {
      const geocode = await geocodeAddress(buildAddress(next));
      if (geocode) {
        updatePayload.site_lat = geocode.lat;
        updatePayload.site_lng = geocode.lng;
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("subscriber_id", subscriberId)
      .eq("id", jobId)
      .select("*")
      .single();

    if (updateErr || !updated) {
      return res.status(400).json({
        ok: false,
        error: updateErr?.message || "Could not update job",
      });
    }

    return res.status(200).json({
      ok: true,
      job: updated,
      invoice_review_flagged: !!updatePayload.invoice_action_required,
      changed_fields: changedFields,
    });
  } catch (err) {
    console.error("jobs/update unexpected error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
