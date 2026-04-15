// pages/api/jobs/move-incomplete.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
}

function asText(v) {
  return typeof v === "string" ? v.trim() : "";
}

function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function shouldMoveScheduled(job, sourceDate) {
  const status = asText(job.job_status).toLowerCase();

  if (String(job.scheduled_date || "") !== String(sourceDate)) return false;
  if (job.delivery_actual_date) return false;
  if (status === "delivered" || status === "collected" || status === "completed" || status === "cancelled") {
    return false;
  }

  return true;
}

function shouldMoveCollection(job, sourceDate) {
  const status = asText(job.job_status).toLowerCase();

  if (String(job.collection_date || "") !== String(sourceDate)) return false;
  if (job.collection_actual_date) return false;
  if (status === "collected" || status === "completed" || status === "cancelled") {
    return false;
  }

  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const officeUser = await requireOfficeUser(req, res);
    if (!officeUser) return;

    const subscriberId = String(req.body?.subscriber_id || "").trim();
    const sourceDate = String(req.body?.source_date || "").trim();
    const targetDate = String(req.body?.target_date || "").trim();

    if (!subscriberId) {
      return res.status(400).json({ error: "Missing subscriber" });
    }

    if (!isYmd(sourceDate)) {
      return res.status(400).json({ error: "Invalid source_date" });
    }

    if (!isYmd(targetDate)) {
      return res.status(400).json({ error: "Invalid target_date" });
    }

    if (sourceDate === targetDate) {
      return res.status(400).json({ error: "Target date must be different from source date" });
    }

    const supabase = getSupabaseAdmin();

    const { data: rows, error: loadErr } = await supabase
      .from("jobs")
      .select(
        [
          "id",
          "job_number",
          "job_status",
          "scheduled_date",
          "collection_date",
          "delivery_actual_date",
          "collection_actual_date",
          "assigned_driver_id",
          "driver_run_group",
          "swap_group_id",
          "swap_role",
          "delivery_rollover_count",
          "collection_rollover_count",
        ].join(",")
      )
      .eq("subscriber_id", subscriberId)
      .or(`scheduled_date.eq.${sourceDate},collection_date.eq.${sourceDate}`);

    if (loadErr) {
      throw new Error(loadErr.message || "Failed to load jobs");
    }

    const moveResults = [];

    for (const job of rows || []) {
      const moveScheduled = shouldMoveScheduled(job, sourceDate);
      const moveCollection = shouldMoveCollection(job, sourceDate);

      if (!moveScheduled && !moveCollection) continue;

      const patch = {
        assigned_driver_id: null,
        driver_run_group: null,
      };

      if (moveScheduled) {
        patch.scheduled_date = targetDate;
        patch.delivery_rollover_count = numOrZero(job.delivery_rollover_count) + 1;
      }

      if (moveCollection) {
        patch.collection_date = targetDate;
        patch.collection_rollover_count = numOrZero(job.collection_rollover_count) + 1;
      }

      const { error: updateErr } = await supabase
        .from("jobs")
        .update(patch)
        .eq("subscriber_id", subscriberId)
        .eq("id", job.id);

      if (updateErr) {
        throw new Error(updateErr.message || `Failed to move job ${job.job_number || job.id}`);
      }

      moveResults.push({
        id: job.id,
        job_number: job.job_number || "",
        moved_scheduled_date: !!moveScheduled,
        moved_collection_date: !!moveCollection,
        delivery_rollover_count: moveScheduled
          ? patch.delivery_rollover_count
          : numOrZero(job.delivery_rollover_count),
        collection_rollover_count: moveCollection
          ? patch.collection_rollover_count
          : numOrZero(job.collection_rollover_count),
      });
    }

    return res.status(200).json({
      ok: true,
      source_date: sourceDate,
      target_date: targetDate,
      moved_count: moveResults.length,
      moved: moveResults,
    });
  } catch (e) {
    console.error("move-incomplete error:", e);
    return res.status(500).json({
      error: e?.message || "Failed to move incomplete jobs",
    });
  }
}
