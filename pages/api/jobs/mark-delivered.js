// pages/api/jobs/mark-delivered.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
}

function addDaysToYmd(ymd, days) {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function normaliseStatus(v) {
  return String(v || "").trim().toLowerCase();
}

async function getTermHireDays(supabase, job) {
  const customerId = String(job?.customer_id || "");
  const subscriberId = String(job?.subscriber_id || "");

  let customerOverride = null;
  let subscriberDefault = null;
  let emailSettingsDefault = null;

  if (customerId) {
    const { data: customerRow, error: customerErr } = await supabase
      .from("customers")
      .select("term_hire_days_override")
      .eq("id", customerId)
      .maybeSingle();

    if (customerErr) {
      throw new Error(`Failed to load customer term hire settings: ${customerErr.message}`);
    }

    customerOverride = customerRow?.term_hire_days_override ?? null;
  }

  if (subscriberId) {
    const { data: subscriberRow, error: subscriberErr } = await supabase
      .from("subscribers")
      .select("term_hire_days")
      .eq("id", subscriberId)
      .maybeSingle();

    if (subscriberErr) {
      throw new Error(`Failed to load subscriber term hire settings: ${subscriberErr.message}`);
    }

    subscriberDefault = subscriberRow?.term_hire_days ?? null;

    const { data: emailSettingsRow, error: emailSettingsErr } = await supabase
      .from("email_settings")
      .select("term_hire_default_days")
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (emailSettingsErr) {
      throw new Error(`Failed to load email settings term hire defaults: ${emailSettingsErr.message}`);
    }

    emailSettingsDefault = emailSettingsRow?.term_hire_default_days ?? null;
  }

  const days = Number(
    customerOverride ??
      subscriberDefault ??
      emailSettingsDefault ??
      14
  );

  if (!Number.isFinite(days) || days < 0) return 14;
  return Math.trunc(days);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const auth = await requireOfficeUser(req);

    if (!auth?.ok) {
      return res.status(401).json({ error: auth?.error || "Unauthorised" });
    }

    const subscriberId = String(auth.subscriber_id || "");
    const userId = String(auth.user?.id || "");

    if (!subscriberId) {
      return res.status(401).json({ error: "Missing subscriber_id on profile" });
    }

    const supabase = getSupabaseAdmin();

    const jobId = String(req.body?.job_id || "").trim();
    const deliveredDate = String(req.body?.delivered_date || "").trim();

    if (!jobId) {
      return res.status(400).json({ error: "Missing job_id" });
    }

    if (!isYmd(deliveredDate)) {
      return res.status(400).json({ error: "delivered_date must be YYYY-MM-DD" });
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select([
        "id",
        "subscriber_id",
        "customer_id",
        "job_number",
        "job_status",
        "delivery_actual_date",
        "collection_date",
        "collection_actual_date",
        "term_hire_suppressed",
        "term_hire_suppressed_at",
        "term_hire_suppressed_reason",
      ].join(","))
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (jobErr) {
      return res.status(500).json({ error: jobErr.message || "Failed to load job" });
    }

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const currentStatus = normaliseStatus(job.job_status);

    if (currentStatus === "cancelled") {
      return res.status(400).json({ error: "Cancelled jobs cannot be marked as delivered" });
    }

    if (job.collection_actual_date || currentStatus === "collected" || currentStatus === "completed") {
      return res.status(400).json({ error: "Collected/completed jobs cannot be marked as delivered" });
    }

    const termHireDays = await getTermHireDays(supabase, job);
    const termHireEndDate = addDaysToYmd(deliveredDate, termHireDays);

    const patch = {
      delivery_actual_date: deliveredDate,
      job_status: "delivered",
      term_hire_end_date: termHireEndDate,
      term_hire_extended_until: null,
      hire_extension_days: 0,
      term_hire_extension_pending: false,
      term_hire_extension_pending_at: null,
      term_hire_auto_collection_due: false,
      term_hire_auto_collection_booked_at: null,
      term_hire_status: "active",
      last_edited_at: new Date().toISOString(),
      last_edited_by: userId || null,
    };

    const { data: updated, error: updateErr } = await supabase
      .from("jobs")
      .update(patch)
      .eq("id", job.id)
      .eq("subscriber_id", subscriberId)
      .select([
        "id",
        "job_number",
        "job_status",
        "delivery_actual_date",
        "term_hire_end_date",
        "term_hire_extended_until",
        "hire_extension_days",
        "term_hire_extension_pending",
        "term_hire_auto_collection_due",
      ].join(","))
      .single();

    if (updateErr) {
      return res.status(500).json({ error: updateErr.message || "Failed to update job" });
    }

    return res.status(200).json({
      ok: true,
      job: updated,
      term_hire_days: termHireDays,
    });
  } catch (err) {
    console.error("mark-delivered error", err);
    return res.status(500).json({
      error: err?.message || "Unexpected error marking job as delivered",
    });
  }
}
