import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function jobHasInvoice(job) {
  return !!(job?.xero_invoice_id || job?.xero_invoice_number);
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
    const cancellationReason = asText(body.cancellation_reason) || null;

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
      return res.status(200).json({ ok: true, job: existing, already_cancelled: true });
    }

    if (existing.job_status === "delivered" || existing.job_status === "collected" || existing.job_status === "completed") {
      return res.status(400).json({
        ok: false,
        error: "Delivered/collected/completed jobs cannot be cancelled here.",
      });
    }

    const updatePayload = {
      job_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: officeUserId,
      cancellation_reason: cancellationReason,
      last_edited_at: new Date().toISOString(),
      last_edited_by: officeUserId,
    };

    if (jobHasInvoice(existing)) {
      updatePayload.invoice_action_required = true;
      updatePayload.invoice_action_reason = "job_cancelled";
      updatePayload.invoice_action_note =
        "Manual invoice review needed after cancellation." +
        (cancellationReason ? ` Reason: ${cancellationReason}` : "");
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
        error: updateErr?.message || "Could not cancel job",
      });
    }

    return res.status(200).json({
      ok: true,
      job: updated,
      invoice_review_flagged: !!updatePayload.invoice_action_required,
    });
  } catch (err) {
    console.error("jobs/cancel unexpected error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
