import { requireOfficeUser } from "../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";
import { sendJobEmail } from "../../lib/jobEmails";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

async function resolveJobId({ supabase, subscriberId, body }) {
  const direct =
    asText(body.job_id) ||
    asText(body.jobId) ||
    asText(body.id) ||
    asText(body.booking_id) ||
    "";

  if (direct) return direct;

  const jobNumber = asText(body.job_number) || asText(body.booking_number);
  if (!jobNumber) return "";

  const { data, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("subscriber_id", subscriberId)
    .eq("job_number", jobNumber)
    .maybeSingle();

  if (error) throw error;
  return data?.id || "";
}

function chooseTemplateKey(body) {
  const explicit = asText(body.template_key);
  if (explicit) return explicit;

  const jobType = asText(body.job_type).toLowerCase();

  if (jobType === "swap") return "swap_confirmed";
  if (jobType === "custom" || jobType === "custom_skip" || jobType === "custom-skip") {
    return "custom_skip_confirmed";
  }

  return "booking_confirmed";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed",
      });
    }

    const auth = await requireOfficeUser(req);
    if (!auth?.ok) {
      return res.status(401).json({
        ok: false,
        error: auth?.error || "Unauthorised",
      });
    }

    const subscriberId = auth.subscriber_id;
    const supabase = getSupabaseAdmin();
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const jobId = await resolveJobId({ supabase, subscriberId, body });

    if (!jobId) {
      return res.status(400).json({
        ok: false,
        error: "job_id is required",
      });
    }

    const templateKey = chooseTemplateKey(body);

    const out = await sendJobEmail({
      subscriberId,
      jobId,
      templateKey,
      extraTags: {
        to_email: asText(body.to_email) || undefined,
      },
    });

    return res.status(200).json({
      ok: true,
      template_key: templateKey,
      job_id: jobId,
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
