import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const { token } = req.body || {};

    if (!token) {
      return res.status(400).json({ ok: false, error: "Missing token" });
    }

    // 1. Validate token
    const { data: action, error } = await supabase
      .from("term_hire_actions")
      .select("*")
      .eq("token", token)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw error;
    if (!action) {
      return res.status(400).json({ ok: false, error: "Invalid or expired link" });
    }

    if (action.action_type !== "book_collection") {
      return res.status(400).json({ ok: false, error: "Invalid action type" });
    }

    // 2. Get job
    const { data: job } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", action.job_id)
      .maybeSingle();

    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    // Already collected or booked → stop
    if (job.collection_actual_date || job.collection_date) {
      return res.status(200).json({ ok: true, message: "Already booked" });
    }

    const collectionDate = addDays(todayYmd(), 1); // next day (simple logic for now)

    // 3. Update job
    const { error: updateErr } = await supabase
      .from("jobs")
      .update({
        collection_date: collectionDate,
        term_hire_suppressed: true,
        term_hire_suppressed_at: new Date().toISOString(),
        term_hire_suppressed_reason: "customer_booked_collection",
        term_hire_status: "collection_booked",
      })
      .eq("id", job.id);

    if (updateErr) throw updateErr;

    // 4. Mark token used
    await supabase
      .from("term_hire_actions")
      .update({
        status: "used",
        used_at: new Date().toISOString(),
      })
      .eq("id", action.id);

    // 5. Log event
    await supabase.from("term_hire_events").insert({
      subscriber_id: job.subscriber_id,
      job_id: job.id,
      customer_id: job.customer_id,
      channel: "web",
      event_type: "collection_booked",
      metadata: {
        collection_date: collectionDate,
      },
    });

    return res.status(200).json({
      ok: true,
      collection_date: collectionDate,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed",
    });
  }
}
