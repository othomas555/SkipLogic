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

function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const auth = await getDriverFromSession(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not logged in" });

  const driver = auth.driver;
  const supabase = getSupabaseAdmin();

  const { job_id, date, job_type, photos } = req.body || {};
  const jobId = String(job_id || "").trim();
  const runDate = typeof date === "string" && date ? date : ymd(new Date());
  let t = String(job_type || "").trim(); // delivery | collection | delivery+collection

  if (!jobId) return bad(res, "Missing job_id");

  // Validate photos payload (optional but if provided must be sane)
  const photoArr = Array.isArray(photos) ? photos : [];
  for (const p of photoArr) {
    if (!p || typeof p !== "object") return bad(res, "Invalid photos payload");
    if (!p.kind || !p.url) return bad(res, "Invalid photos payload");
    if (!isHttpUrl(p.url)) return bad(res, "Invalid photo url");
  }

  // Load job (lock to this driver + subscriber)
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, subscriber_id, assigned_driver_id, scheduled_date, collection_date")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) return bad(res, "Failed to load job", 500);
  if (!job) return bad(res, "Job not found", 404);

  if (String(job.subscriber_id) !== String(driver.subscriber_id)) return bad(res, "Forbidden", 403);
  if (String(job.assigned_driver_id || "") !== String(driver.id)) return bad(res, "Forbidden", 403);

  // Infer type if missing
  if (!t) {
    const isDelivery = String(job.scheduled_date || "").slice(0, 10) === runDate;
    const isCollection = String(job.collection_date || "").slice(0, 10) === runDate;
    if (isDelivery && isCollection) t = "delivery+collection";
    else if (isDelivery) t = "delivery";
    else if (isCollection) t = "collection";
    else t = "other";
  }

  // Enforce photo rules
  // delivery: 1 (delivered)
  // collection: 1 (collected)
  // swap: 2 (swap_full + swap_empty)
  const kinds = photoArr.map((p) => String(p.kind));
  const has = (k) => kinds.includes(k);

  if (t === "delivery") {
    if (!has("delivered")) return bad(res, "Photo required: delivered");
  } else if (t === "collection") {
    if (!has("collected")) return bad(res, "Photo required: collected");
  } else if (t === "delivery+collection") {
    if (!has("swap_full") || !has("swap_empty")) return bad(res, "Photos required: swap_full and swap_empty");
  } else {
    return bad(res, "Cannot mark complete: job not due for this date");
  }

  const patch = {};
  if (t === "delivery") {
    patch.delivery_actual_date = runDate;
    patch.job_status = "delivered";
  } else if (t === "collection") {
    patch.collection_actual_date = runDate;
    patch.job_status = "collected";
  } else if (t === "delivery+collection") {
    patch.collection_actual_date = runDate;
    patch.delivery_actual_date = runDate;
    patch.job_status = "collected";
  }

  const { error: upErr } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", jobId)
    .eq("subscriber_id", driver.subscriber_id);

  if (upErr) return bad(res, upErr.message || "Failed to mark complete", 500);

  // Best-effort job_events insert (won’t break completion if table doesn’t exist yet)
  try {
    // Expected table (if/when you add it): job_events(subscriber_id, job_id, event_type, created_at, driver_id, meta)
    await supabase.from("job_events").insert({
      subscriber_id: driver.subscriber_id,
      job_id: jobId,
      event_type: t === "delivery+collection" ? "swap_completed" : t === "delivery" ? "delivered" : "collected",
      driver_id: driver.id,
      meta: { date: runDate, photos: photoArr },
    });
  } catch (e) {
    // ignore
  }

  return res.json({ ok: true, job_id: jobId, date: runDate, job_type: t });
}
