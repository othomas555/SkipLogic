import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getDriverFromSession } from "../../../lib/driverAuth";

function ymd(d) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = await getDriverFromSession(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not logged in" });

  const driver = auth.driver;
  const supabase = getSupabaseAdmin();

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const jobId = String(body.job_id || "");
  const issueType = String(body.issue_type || "").trim();
  const notes = String(body.notes || "").trim();
  const unableToComplete = !!body.unable_to_complete;
  const date = typeof body.date === "string" && body.date ? body.date : ymd(new Date());

  if (!jobId) return res.status(400).json({ ok: false, error: "Missing job_id" });
  if (!issueType) return res.status(400).json({ ok: false, error: "Missing issue_type" });

  try {
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, subscriber_id, assigned_driver_id")
      .eq("id", jobId)
      .eq("subscriber_id", driver.subscriber_id)
      .maybeSingle();

    if (jobErr) return res.status(500).json({ ok: false, error: "Failed to load job" });
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });

    if (String(job.assigned_driver_id || "") !== String(driver.id)) {
      return res.status(403).json({ ok: false, error: "This job is not assigned to you" });
    }

    try {
      await supabase.from("job_issues").insert({
        job_id: jobId,
        driver_id: driver.id,
        issue_type: issueType,
        notes,
        created_at: new Date().toISOString(),
        resolved: false,
      });
    } catch (e) {
      console.warn("job_issues insert skipped/failed", e?.message || e);
    }

    if (unableToComplete) {
      await supabase
        .from("jobs")
        .update({
          job_status: "problem",
        })
        .eq("id", jobId)
        .eq("subscriber_id", driver.subscriber_id);
    }

    return res.json({
      ok: true,
      date,
      unable_to_complete: unableToComplete,
    });
  } catch (e) {
    console.error("report-issue unexpected", e);
    return res.status(500).json({ ok: false, error: "Unexpected error" });
  }
}
