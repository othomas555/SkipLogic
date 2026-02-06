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

function firstPhotoUrl(photos, kind) {
  if (!Array.isArray(photos)) return null;
  const p = photos.find((x) => x && x.kind === kind && (x.url || x.path));
  return p?.url || null;
}

function requirePhoto(photos, kind) {
  const url = firstPhotoUrl(photos, kind);
  return !!url;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const auth = await getDriverFromSession(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not logged in" });

  const driver = auth.driver;
  const supabase = getSupabaseAdmin();

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const kind = String(body.kind || "job"); // "job" | "swap"
  const date = typeof body.date === "string" && body.date ? body.date : ymd(new Date());
  const photos = Array.isArray(body.photos) ? body.photos : [];

  try {
    // ---------------- SWAP: TWO JOB IDS (collection + delivery) ----------------
    // We keep this for when you implement "two linked jobs rendered as SWAP"
    if (kind === "swap") {
      const collectJobId = String(body.collect_job_id || "");
      const deliverJobId = String(body.deliver_job_id || "");

      if (!collectJobId || !deliverJobId) return res.status(400).json({ ok: false, error: "Missing swap job ids" });

      if (!requirePhoto(photos, "swap_full")) {
        return res.status(400).json({ ok: false, error: "Photo required: full skip (swap_full)" });
      }
      if (!requirePhoto(photos, "swap_empty")) {
        return res.status(400).json({ ok: false, error: "Photo required: empty skip (swap_empty)" });
      }

      const { data: jobs, error: jErr } = await supabase
        .from("jobs")
        .select(
          [
            "id",
            "subscriber_id",
            "assigned_driver_id",
            "delivery_actual_date",
            "collection_actual_date",
            "delivery_photo_url",
            "collection_photo_url",
            "swap_full_photo_url",
            "swap_empty_photo_url",
          ].join(",")
        )
        .in("id", [collectJobId, deliverJobId])
        .eq("subscriber_id", driver.subscriber_id);

      if (jErr) return res.status(500).json({ ok: false, error: "Failed to load jobs" });

      const byId = {};
      for (const j of jobs || []) byId[String(j.id)] = j;

      const c = byId[collectJobId];
      const d = byId[deliverJobId];
      if (!c || !d) return res.status(404).json({ ok: false, error: "Swap jobs not found" });

      if (String(c.assigned_driver_id || "") !== String(driver.id) || String(d.assigned_driver_id || "") !== String(driver.id)) {
        return res.status(403).json({ ok: false, error: "These jobs are not assigned to you" });
      }

      // Idempotent behaviour: if already done, return ok
      const cAlready = !!c.collection_actual_date;
      const dAlready = !!d.delivery_actual_date;

      const fullUrl = firstPhotoUrl(photos, "swap_full");
      const emptyUrl = firstPhotoUrl(photos, "swap_empty");

      const updates = [];

      // Collection job: collect + store swap_full on collection job
      if (!cAlready) {
        updates.push(
          supabase
            .from("jobs")
            .update({
              collection_actual_date: date,
              job_status: "collected",
              swap_full_photo_url: fullUrl,
            })
            .eq("id", c.id)
            .eq("subscriber_id", driver.subscriber_id)
        );
      }

      // Delivery job: deliver + store swap_empty on delivery job
      if (!dAlready) {
        updates.push(
          supabase
            .from("jobs")
            .update({
              delivery_actual_date: date,
              job_status: "delivered",
              swap_empty_photo_url: emptyUrl,
            })
            .eq("id", d.id)
            .eq("subscriber_id", driver.subscriber_id)
        );
      }

      const results = await Promise.all(updates);
      const anyErr = results.find((r) => r && r.error);
      if (anyErr) {
        console.error("swap complete error", anyErr.error);
        return res.status(500).json({ ok: false, error: "Failed to update swap jobs" });
      }

      return res.json({ ok: true, already_done: cAlready && dAlready });
    }

    // ---------------- SINGLE JOB COMPLETE ----------------
    const jobId = String(body.job_id || "");
    const jobType = String(body.job_type || ""); // "delivery" | "collection" | "delivery+collection"
    if (!jobId) return res.status(400).json({ ok: false, error: "Missing job_id" });

    // Enforce photos
    if (jobType === "delivery") {
      if (!requirePhoto(photos, "delivered")) return res.status(400).json({ ok: false, error: "Photo required: delivered" });
    } else if (jobType === "collection") {
      if (!requirePhoto(photos, "collected")) return res.status(400).json({ ok: false, error: "Photo required: collected" });
    } else if (jobType === "delivery+collection") {
      if (!requirePhoto(photos, "swap_full")) return res.status(400).json({ ok: false, error: "Photo required: full skip (swap_full)" });
      if (!requirePhoto(photos, "swap_empty")) return res.status(400).json({ ok: false, error: "Photo required: empty skip (swap_empty)" });
    } else {
      return res.status(400).json({ ok: false, error: "Unknown job_type" });
    }

    // Load job (security)
    const { data: j, error: jErr } = await supabase
      .from("jobs")
      .select(
        [
          "id",
          "subscriber_id",
          "assigned_driver_id",
          "delivery_actual_date",
          "collection_actual_date",
          "delivery_photo_url",
          "collection_photo_url",
          "swap_full_photo_url",
          "swap_empty_photo_url",
        ].join(",")
      )
      .eq("id", jobId)
      .eq("subscriber_id", driver.subscriber_id)
      .maybeSingle();

    if (jErr) return res.status(500).json({ ok: false, error: "Failed to load job" });
    if (!j) return res.status(404).json({ ok: false, error: "Job not found" });

    if (String(j.assigned_driver_id || "") !== String(driver.id)) {
      return res.status(403).json({ ok: false, error: "This job is not assigned to you" });
    }

    // Idempotent: if already completed for that type, return ok
    if (jobType === "delivery" && j.delivery_actual_date) return res.json({ ok: true, already_done: true });
    if (jobType === "collection" && j.collection_actual_date) return res.json({ ok: true, already_done: true });
    if (jobType === "delivery+collection" && j.delivery_actual_date && j.collection_actual_date) return res.json({ ok: true, already_done: true });

    const patch = {};

    if (jobType === "delivery") {
      patch.delivery_actual_date = date;
      patch.job_status = "delivered";
      patch.delivery_photo_url = firstPhotoUrl(photos, "delivered");
    } else if (jobType === "collection") {
      patch.collection_actual_date = date;
      patch.job_status = "collected";
      patch.collection_photo_url = firstPhotoUrl(photos, "collected");
    } else if (jobType === "delivery+collection") {
      // Legacy "tip return on one job" mode
      patch.delivery_actual_date = date;
      patch.collection_actual_date = date;
      patch.job_status = "completed";
      patch.swap_full_photo_url = firstPhotoUrl(photos, "swap_full");
      patch.swap_empty_photo_url = firstPhotoUrl(photos, "swap_empty");
    }

    const { error: uErr } = await supabase
      .from("jobs")
      .update(patch)
      .eq("id", jobId)
      .eq("subscriber_id", driver.subscriber_id);

    if (uErr) return res.status(500).json({ ok: false, error: "Failed to update job" });

    return res.json({ ok: true });
  } catch (e) {
    console.error("complete-job unexpected", e);
    return res.status(500).json({ ok: false, error: "Unexpected error" });
  }
}
