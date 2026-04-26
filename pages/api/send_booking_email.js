import { getSupabaseAdmin } from "../../lib/supabaseAdmin";
import { sendJobEmail } from "../../lib/jobEmails";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function chooseTemplateKey(body) {
  const explicit = asText(body.template_key);
  if (
    explicit === "booking_confirmed" ||
    explicit === "swap_confirmed" ||
    explicit === "custom_skip_confirmed"
  ) {
    return explicit;
  }

  const jobType = asText(body.job_type).toLowerCase();

  if (jobType === "swap") return "swap_confirmed";
  if (jobType === "custom" || jobType === "custom_skip" || jobType === "custom-skip") {
    return "custom_skip_confirmed";
  }

  return "booking_confirmed";
}

async function resolveJob({ supabase, body }) {
  const jobId =
    asText(body.job_id) ||
    asText(body.jobId) ||
    asText(body.id) ||
    asText(body.booking_id) ||
    "";

  const jobNumber = asText(body.job_number) || asText(body.booking_number);

  let query = supabase
    .from("jobs")
    .select("id, subscriber_id, job_number, customer_id")
    .limit(1);

  if (jobId) {
    query = query.eq("id", jobId);
  } else if (jobNumber) {
    query = query.eq("job_number", jobNumber);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data || null;
}

async function hasRecentSentBookingEmail({ supabase, jobId, templateKey }) {
  const { data, error } = await supabase
    .from("email_outbox")
    .select("id, created_at, status")
    .eq("job_id", jobId)
    .eq("template_key", templateKey)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return false;

  return Array.isArray(data) && data.length > 0;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed",
      });
    }

    const supabase = getSupabaseAdmin();
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const job = await resolveJob({ supabase, body });

    if (!job?.id || !job?.subscriber_id) {
      return res.status(400).json({
        ok: false,
        error: "job_id or job_number is required",
      });
    }

    const templateKey = chooseTemplateKey(body);

    const alreadySent = await hasRecentSentBookingEmail({
      supabase,
      jobId: job.id,
      templateKey,
    });

    if (alreadySent) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "Booking email already sent for this job",
        job_id: job.id,
        template_key: templateKey,
      });
    }

    const out = await sendJobEmail({
      subscriberId: job.subscriber_id,
      jobId: job.id,
      templateKey,
    });

    return res.status(200).json({
      ok: true,
      job_id: job.id,
      template_key: templateKey,
      ...out,
    });
  } catch (err) {
    console.error("send_booking_email error", err);
    return res.status(500).json({
      ok: false,
      error: "Failed to send booking email",
      details: String(err?.message || err),
    });
  }
}
