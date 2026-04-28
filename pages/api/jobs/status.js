// pages/api/jobs/status.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await requireOfficeUser(req, res);
    if (!auth?.ok) return;

    const subscriberId = auth.subscriber_id || auth.subscriberId;
    const supabase = getSupabaseAdmin();

    const { job_id, action } = req.body || {};

    if (!job_id) {
      return res.status(400).json({ ok: false, error: "Missing job_id" });
    }

    if (!action) {
      return res.status(400).json({ ok: false, error: "Missing action" });
    }

    const { data: job, error: loadError } = await supabase
      .from("jobs")
      .select("id, subscriber_id, job_status, delivery_actual_date, collection_actual_date")
      .eq("id", job_id)
      .eq("subscriber_id", subscriberId)
      .single();

    if (loadError || !job) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    if (job.job_status === "cancelled") {
      return res.status(400).json({
        ok: false,
        error: "Cancelled jobs cannot be marked delivered or collected.",
      });
    }

    const patch = {};

    if (action === "mark_delivered") {
      patch.job_status = "delivered";
      patch.delivery_actual_date = job.delivery_actual_date || todayYmd();
    } else if (action === "undo_delivered") {
      if (job.collection_actual_date || job.job_status === "collected") {
        return res.status(400).json({
          ok: false,
          error: "Undo collection before undoing delivery.",
        });
      }

      patch.job_status = "booked";
      patch.delivery_actual_date = null;
    } else if (action === "mark_collected") {
      if (!job.delivery_actual_date && job.job_status !== "delivered") {
        return res.status(400).json({
          ok: false,
          error: "Mark the job as delivered before marking it collected.",
        });
      }

      patch.job_status = "collected";
      patch.collection_actual_date = job.collection_actual_date || todayYmd();
    } else if (action === "undo_collected") {
      patch.job_status = "delivered";
      patch.collection_actual_date = null;

      if (!job.delivery_actual_date) {
        patch.delivery_actual_date = todayYmd();
      }
    } else {
      return res.status(400).json({ ok: false, error: "Unknown action" });
    }

    const { data: updatedJob, error: updateError } = await supabase
      .from("jobs")
      .update(patch)
      .eq("id", job_id)
      .eq("subscriber_id", subscriberId)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    return res.status(200).json({
      ok: true,
      job: updatedJob,
      message: "Job status updated. No emails were sent.",
    });
  } catch (err) {
    console.error("jobs/status error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Status update failed",
    });
  }
}
