// pages/api/driver/complete-job.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getDriverFromSession } from "../../../lib/driverAuth";

function ymd(d) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function bad(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const auth = await getDriverFromSession(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not logged in" });

  const driver = auth.driver;
  const supabase = getSupabaseAdmin();

  const { job_id, date, job_type } = req.body || {};
  const jobId = String(job_id || "").trim();
  const runDate = typeof date === "string" && date ? date : ymd(new Date());
  const type = String(job_type || "").trim(); // "delivery" | "collection" | "delivery+collection"

  if (!jobId) return bad(res, "Missing job_id");

  // Load job (lock to this driver + subscriber)
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, subscriber_id, assigned_driver_id, scheduled_date, collection_date, job_status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) return bad(res, "Failed to load job", 500);
  if (!job) return bad(res, "Job not found", 404);

  if (String(job.subscriber_id) !== String(driver.subscriber_id)) return bad(res, "Forbidden", 403);
  if (String(job.assigned_driver_id || "") !== String(driver.id)) return bad(res, "Forbidden", 403);

  // Decide what to update
  const patch = { updated_at: new Date().toISOString() };

  // If UI sent a type, trust it. Otherwise infer from dates (backup safety).
  let t = type;
  if (!t) {
    const isDelivery = String(job.scheduled_date || "").slice(0, 10) === runDate;
    const isCollection = String(job.collection_date || "").slice(0, 10) === runDate;
    if (isDelivery && isCollection) t = "delivery+collection";
    else if (isDelivery) t = "delivery";
    else if (isCollection) t = "collection";
    else t = "other";
  }

  if (t === "delivery") {
    patch.delivery_actual_date = runDate;
    patch.job_status = "delivered";
  } else if (t === "collection") {
    patch.collection_actual_date = runDate;
    patch.job_status = "collected";
  } else if (t === "delivery+collection") {
    // tip return swap: full skip collected + empty delivered
    patch.collection_actual_date = runDate;
    patch.delivery_actual_date = runDate;
    patch.job_status = "collected"; // terminal
  } else {
    return bad(res, "Cannot mark complete: job not due for this date");
  }

  const { error: upErr } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("subscriber_id", driver.subscriber_id);

  if (upErr) return bad(res, upErr.message || "Failed to mark complete", 500);

  return res.json({ ok: true, job_id: jobId, date: runDate, job_type: t });
}
