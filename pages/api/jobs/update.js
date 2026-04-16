import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asText(v) {
  return typeof v === "string" ? v.trim() : "";
}

function asNullableText(v) {
  const t = asText(v);
  return t || null;
}

function asNullableNumber(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asBool(v) {
  return v === true;
}

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function pickCommercialChangeFlags(beforeRow, patch) {
  const commercialFields = [
    "price_inc_vat",
    "payment_type",
    "placement_type",
    "permit_setting_id",
    "permit_price_no_vat",
    "permit_delay_business_days",
    "permit_validity_days",
    "permit_override",
  ];

  return commercialFields.some((field) => {
    const beforeVal = beforeRow?.[field] ?? null;
    const afterVal = patch?.[field] ?? null;
    return String(beforeVal ?? "") !== String(afterVal ?? "");
  });
}

async function logTermHireEvent(supabase, payload) {
  try {
    await supabase.from("term_hire_events").insert(payload);
  } catch (e) {
    console.error("term_hire_events insert failed", e);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await requireOfficeUser(req, res);
    if (!auth || auth.ok === false) return;

    const supabase = getSupabaseAdmin();

    const id = asText(req.body?.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: "Missing job id" });
    }

    const { data: existingJob, error: existingError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .eq("subscriber_id", auth.subscriber_id)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existingJob) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    if (existingJob.job_status === "cancelled") {
      return res.status(400).json({ ok: false, error: "Cancelled jobs cannot be edited" });
    }

    const scheduledDateRaw = req.body?.scheduled_date;
    const collectionDateRaw = req.body?.collection_date;

    if (scheduledDateRaw != null && scheduledDateRaw !== "" && !isYmd(scheduledDateRaw)) {
      return res.status(400).json({ ok: false, error: "Invalid scheduled_date" });
    }

    if (collectionDateRaw != null && collectionDateRaw !== "" && !isYmd(collectionDateRaw)) {
      return res.status(400).json({ ok: false, error: "Invalid collection_date" });
    }

    const placementType = asNullableText(req.body?.placement_type) || "private";
    const incomingCollectionDate = collectionDateRaw ? String(collectionDateRaw) : null;
    const hadCollectionDateBefore = !!existingJob.collection_date;
    const hasCollectionDateAfter = !!incomingCollectionDate;

    const patch = {
      skip_type_id: asNullableText(req.body?.skip_type_id),
      scheduled_date: scheduledDateRaw ? String(scheduledDateRaw) : null,
      collection_date: incomingCollectionDate,
      price_inc_vat: asNullableNumber(req.body?.price_inc_vat),
      notes: asNullableText(req.body?.notes),

      site_name: asNullableText(req.body?.site_name),
      site_address_line1: asNullableText(req.body?.site_address_line1),
      site_address_line2: asNullableText(req.body?.site_address_line2),
      site_town: asNullableText(req.body?.site_town),
      site_postcode: asNullableText(req.body?.site_postcode),

      payment_type: asNullableText(req.body?.payment_type),
      placement_type: placementType,

      permit_setting_id:
        placementType === "permit" ? asNullableText(req.body?.permit_setting_id) : null,
      permit_price_no_vat:
        placementType === "permit" ? asNullableNumber(req.body?.permit_price_no_vat) : null,
      permit_delay_business_days:
        placementType === "permit"
          ? asNullableNumber(req.body?.permit_delay_business_days)
          : null,
      permit_validity_days:
        placementType === "permit" ? asNullableNumber(req.body?.permit_validity_days) : null,
      permit_override: placementType === "permit" ? asBool(req.body?.permit_override) : false,
      weekend_override: asBool(req.body?.weekend_override),

      last_edited_at: new Date().toISOString(),
      last_edited_by: auth.user_id || null,
    };

    const commercialChanged = pickCommercialChangeFlags(existingJob, patch);
    const alreadyInvoiced = !!(existingJob.xero_invoice_id || existingJob.xero_invoice_number);

    if (alreadyInvoiced && commercialChanged) {
      patch.invoice_action_required = true;
      patch.invoice_action_reason = "job_edited";
      patch.invoice_action_note =
        "Job edited after invoice creation. Review invoice manually in Xero.";
    }

    // If office books a collection date manually, suppress future term-hire reminders.
    if (hasCollectionDateAfter) {
      patch.term_hire_suppressed = true;
      patch.term_hire_suppressed_at = new Date().toISOString();
      patch.term_hire_suppressed_reason = "collection_booked_by_office";
      patch.term_hire_status = "collection_requested";
      patch.term_hire_auto_collection_due = false;
      patch.term_hire_extension_pending = false;
    } else if (hadCollectionDateBefore && !hasCollectionDateAfter) {
      // If collection date is cleared, allow term-hire workflow to resume.
      patch.term_hire_suppressed = false;
      patch.term_hire_suppressed_at = null;
      patch.term_hire_suppressed_reason = null;
      patch.term_hire_auto_collection_due = false;

      if (
        existingJob.collection_actual_date ||
        String(existingJob.job_status || "").toLowerCase() === "cancelled"
      ) {
        patch.term_hire_status = existingJob.term_hire_status || null;
      } else if (existingJob.term_hire_extended_until) {
        patch.term_hire_status = "extended";
      } else {
        patch.term_hire_status = "active";
      }
    }

    const { data: updatedJob, error: updateError } = await supabase
      .from("jobs")
      .update(patch)
      .eq("id", id)
      .eq("subscriber_id", auth.subscriber_id)
      .select("*")
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updatedJob) {
      return res.status(500).json({ ok: false, error: "Job update failed" });
    }

    if (!hadCollectionDateBefore && hasCollectionDateAfter) {
      await logTermHireEvent(supabase, {
        subscriber_id: auth.subscriber_id,
        job_id: updatedJob.id,
        customer_id: updatedJob.customer_id || null,
        channel: "system",
        event_type: "collection_booked_by_office",
        template_key: null,
        recipient: null,
        metadata: {
          collection_date: updatedJob.collection_date,
          source: "jobs_update",
          user_id: auth.user_id || null,
        },
      });
    }

    if (hadCollectionDateBefore && !hasCollectionDateAfter) {
      await logTermHireEvent(supabase, {
        subscriber_id: auth.subscriber_id,
        job_id: updatedJob.id,
        customer_id: updatedJob.customer_id || null,
        channel: "system",
        event_type: "collection_booking_cleared",
        template_key: null,
        recipient: null,
        metadata: {
          source: "jobs_update",
          user_id: auth.user_id || null,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      job: updatedJob,
      invoice_review_flagged: !!patch.invoice_action_required,
    });
  } catch (err) {
    console.error("jobs/update error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Update failed",
    });
  }
}
