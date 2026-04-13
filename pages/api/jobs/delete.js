import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function jobHasInvoice(job) {
  return !!(job?.xero_invoice_id || job?.xero_invoice_number);
}

function isSwapLinked(job) {
  return !!(job?.swap_group_id || job?.swap_parent_job_id || asText(job?.swap_role));
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
    const supabase = getSupabaseAdmin();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobId = asText(body.job_id);

    if (!jobId) {
      return res.status(400).json({ ok: false, error: "job_id is required" });
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .eq("id", jobId)
      .single();

    if (jobErr || !job) {
      return res.status(404).json({
        ok: false,
        error: jobErr?.message || "Job not found",
      });
    }

    if (jobHasInvoice(job)) {
      return res.status(400).json({
        ok: false,
        error: "This job has an invoice linked. Use cancel instead of delete.",
      });
    }

    if (job.job_status === "delivered" || job.job_status === "collected" || job.job_status === "completed") {
      return res.status(400).json({
        ok: false,
        error: "Delivered/collected/completed jobs cannot be deleted. Use cancel instead.",
      });
    }

    if (isSwapLinked(job)) {
      return res.status(400).json({
        ok: false,
        error: "Swap-linked jobs cannot be deleted here. Use cancel instead.",
      });
    }

    const { error: deleteEventsErr } = await supabase
      .from("job_events")
      .delete()
      .eq("subscriber_id", subscriberId)
      .eq("job_id", jobId);

    if (deleteEventsErr) {
      console.warn("jobs/delete job_events delete warning:", deleteEventsErr.message);
    }

    const { error: deleteErr } = await supabase
      .from("jobs")
      .delete()
      .eq("subscriber_id", subscriberId)
      .eq("id", jobId);

    if (deleteErr) {
      return res.status(400).json({
        ok: false,
        error: deleteErr.message || "Could not delete job",
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("jobs/delete unexpected error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
