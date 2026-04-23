import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isTokenExpired(expiresAt) {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t < Date.now();
}

function nextBusinessYmdFromToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);

  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();

    const jobId = asText(req.body?.job_id);
    const token = asText(req.body?.token);

    if (!jobId) {
      return res.status(400).json({ ok: false, error: "Missing job_id" });
    }

    if (!token) {
      return res.status(400).json({ ok: false, error: "Missing token" });
    }

    const { data: action, error: actionErr } = await supabase
      .from("term_hire_actions")
      .select("*")
      .eq("job_id", jobId)
      .eq("token", token)
      .eq("action_type", "book_collection")
      .maybeSingle();

    if (actionErr) throw actionErr;

    if (!action) {
      return res.status(404).json({ ok: false, error: "Invalid collection link" });
    }

    if (String(action.status || "").toLowerCase() !== "active") {
      return res.status(400).json({ ok: false, error: "This collection link has already been used" });
    }

    if (isTokenExpired(action.expires_at)) {
      return res.status(400).json({ ok: false, error: "This collection link has expired" });
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, subscriber_id, customer_id, job_number, job_status, collection_date, collection_actual_date, cancelled_at")
      .eq("id", jobId)
      .eq("subscriber_id", action.subscriber_id)
      .maybeSingle();

    if (jobErr) throw jobErr;

    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    if (job.collection_actual_date) {
      return res.status(400).json({ ok: false, error: "This skip has already been collected" });
    }

    if (job.cancelled_at || String(job.job_status || "").toLowerCase() === "cancelled") {
      return res.status(400).json({ ok: false, error: "This job has been cancelled" });
    }

    const collectionDate = job.collection_date || nextBusinessYmdFromToday();

    const { error: jobUpdateErr } = await supabase
      .from("jobs")
      .update({
        collection_date: collectionDate,
        term_hire_status: "collection_booked",
        term_hire_auto_collection_due: false,
        term_hire_extension_pending: false,
        term_hire_extension_pending_at: null,
        term_hire_suppressed: false,
        term_hire_suppressed_at: null,
        term_hire_suppressed_reason: null,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("subscriber_id", job.subscriber_id);

    if (jobUpdateErr) throw jobUpdateErr;

    const { error: actionUpdateErr } = await supabase
      .from("term_hire_actions")
      .update({
        status: "completed",
        metadata: {
          ...(action.metadata || {}),
          completed_at: new Date().toISOString(),
          collection_date: collectionDate,
        },
      })
      .eq("id", action.id);

    if (actionUpdateErr) throw actionUpdateErr;

    const { error: eventErr } = await supabase.from("term_hire_events").insert({
      subscriber_id: job.subscriber_id,
      job_id: job.id,
      customer_id: job.customer_id || null,
      channel: "link",
      event_type: "collection_booked",
      template_key: null,
      recipient: null,
      metadata: {
        collection_date: collectionDate,
        token_action_id: action.id,
      },
    });

    if (eventErr) throw eventErr;

    return res.status(200).json({
      ok: true,
      job_number: job.job_number || "",
      collection_date: collectionDate,
    });
  } catch (err) {
    console.error("book-collection error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to book collection",
    });
  }
}
