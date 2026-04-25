import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { sendJobEmail } from "../../../lib/jobEmails";
import { createWtnForJob, buildWtnPublicUrl } from "../../../lib/wtn";

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
}

function normaliseStatus(v) {
  return String(v || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await requireOfficeUser(req);

    if (!auth?.ok) {
      return res.status(401).json({ ok: false, error: auth?.error || "Unauthorised" });
    }

    const subscriberId = String(auth.subscriber_id || "");
    const userId = String(auth.user?.id || "");

    if (!subscriberId) {
      return res.status(401).json({ ok: false, error: "Missing subscriber_id on profile" });
    }

    const supabase = getSupabaseAdmin();

    const jobId = String(req.body?.job_id || "").trim();
    const collectedDate = String(req.body?.collected_date || "").trim();

    if (!jobId) {
      return res.status(400).json({ ok: false, error: "Missing job_id" });
    }

    if (!isYmd(collectedDate)) {
      return res.status(400).json({ ok: false, error: "collected_date must be YYYY-MM-DD" });
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(
        [
          "id",
          "subscriber_id",
          "job_number",
          "job_status",
          "collection_actual_date",
          "cancelled_at",
        ].join(",")
      )
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (jobErr) {
      return res.status(500).json({ ok: false, error: jobErr.message || "Failed to load job" });
    }

    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    const currentStatus = normaliseStatus(job.job_status);

    if (currentStatus === "cancelled" || job.cancelled_at) {
      return res.status(400).json({ ok: false, error: "Cancelled jobs cannot be marked as collected" });
    }

    const patch = {
      collection_actual_date: collectedDate,
      job_status: "collected",
      term_hire_auto_collection_due: false,
      term_hire_extension_pending: false,
      term_hire_extension_pending_at: null,
      term_hire_status: "collected",
      last_edited_at: new Date().toISOString(),
      last_edited_by: userId || null,
    };

    const { data: updated, error: updateErr } = await supabase
      .from("jobs")
      .update(patch)
      .eq("id", job.id)
      .eq("subscriber_id", subscriberId)
      .select(
        [
          "id",
          "job_number",
          "job_status",
          "collection_actual_date",
          "term_hire_status",
        ].join(",")
      )
      .single();

    if (updateErr) {
      return res.status(500).json({ ok: false, error: updateErr.message || "Failed to update job" });
    }

    let wtnOut = null;
    let wtnUrl = "";

    try {
      wtnOut = await createWtnForJob({
        subscriberId,
        jobId: job.id,
        transferDate: collectedDate,
      });

      if (wtnOut?.wtn?.id) {
        wtnUrl = buildWtnPublicUrl(wtnOut.wtn.id);
      }
    } catch (e) {
      console.error("mark-collected WTN generation failed", e);

      return res.status(500).json({
        ok: false,
        error: "Job was marked collected, but WTN generation failed",
        details: String(e?.message || e),
        job: updated,
      });
    }

    let email = null;

    try {
      email = await sendJobEmail({
        subscriberId,
        jobId: job.id,
        templateKey: "collected_confirmation",
        extraTags: {
          wtn_url: wtnUrl,
          waste_transfer_note_url: wtnUrl,
          collection_date: collectedDate,
          collected_date: collectedDate,
        },
      });

      if (wtnOut?.wtn?.id) {
        await supabase
          .from("wtn_records")
          .update({
            emailed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", wtnOut.wtn.id)
          .eq("subscriber_id", subscriberId);
      }
    } catch (e) {
      email = {
        ok: false,
        error: String(e?.message || e),
      };
    }

    return res.status(200).json({
      ok: true,
      job: updated,
      wtn: wtnOut,
      wtn_url: wtnUrl,
      email,
    });
  } catch (err) {
    console.error("mark-collected error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unexpected error marking job as collected",
    });
  }
}
