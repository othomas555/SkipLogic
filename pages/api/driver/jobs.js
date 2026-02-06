// pages/api/driver/jobs.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getDriverFromSession } from "../../../lib/driverAuth";

function ymd(d) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function isOutstandingForDate(job, date) {
  if (!job) return false;
  const isDeliveryDue = String(job.scheduled_date || "").slice(0, 10) === date;
  const isCollectionDue = String(job.collection_date || "").slice(0, 10) === date;

  const delivered = !!job.delivery_actual_date;
  const collected = !!job.collection_actual_date;

  if (isDeliveryDue && !delivered) return true;
  if (isCollectionDue && !collected) return true;

  return false;
}

function supaErrPayload(err) {
  if (!err) return null;
  return {
    message: err.message || String(err),
    details: err.details || null,
    hint: err.hint || null,
    code: err.code || null,
  };
}

export default async function handler(req, res) {
  const auth = await getDriverFromSession(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not logged in" });

  const driver = auth.driver;

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    console.error("getSupabaseAdmin failed:", e);
    return res.status(500).json({
      ok: false,
      error: "Supabase admin client init failed",
      debug: { message: e?.message || String(e) },
    });
  }

  const date =
    typeof req.query.date === "string" && req.query.date ? req.query.date : ymd(new Date());

  async function loadJobsAndSkipTypes(jobIds) {
    const ids = uniq(jobIds);
    if (!ids.length) return { jobsById: {}, skipTypesById: {} };

    const { data: jobs, error: jobsErr } = await supabase
      .from("jobs")
      .select(
        [
          "id",
          "job_number",
          "scheduled_date",
          "collection_date",
          "delivery_actual_date",
          "collection_actual_date",
          "site_name",
          "site_address_line1",
          "site_address_line2",
          "site_town",
          "site_postcode",
          "notes",
          "job_status",
          "price_inc_vat",
          "payment_type",
          "skip_type_id",
          "assigned_driver_id",
        ].join(",")
      )
      .in("id", ids)
      .eq("subscriber_id", driver.subscriber_id);

    if (jobsErr) return { jobsById: {}, skipTypesById: {}, jobsErr };

    const skipTypeIds = uniq((jobs || []).map((j) => j.skip_type_id).filter(Boolean));

    let skipTypesById = {};
    if (skipTypeIds.length) {
      const { data: sts, error: stErr } = await supabase
        .from("skip_types")
        .select("id, name")
        .in("id", skipTypeIds);

      if (stErr) {
        // don’t fail the whole page if skip types fail; just omit names
        console.error("skip_types load error:", stErr);
      } else {
        for (const st of sts || []) skipTypesById[String(st.id)] = st;
      }
    }

    const jobsById = {};
    for (const j of jobs || []) {
      const isDelivery = String(j.scheduled_date || "").slice(0, 10) === date;
      const isCollection = String(j.collection_date || "").slice(0, 10) === date;

      let type = "other";
      if (isDelivery && isCollection) type = "delivery+collection";
      else if (isDelivery) type = "delivery";
      else if (isCollection) type = "collection";

      const st = j.skip_type_id ? skipTypesById[String(j.skip_type_id)] : null;

      jobsById[String(j.id)] = {
        ...j,
        type,
        skip_type_name: st?.name || null,
      };
    }

    return { jobsById, skipTypesById };
  }

  // 1) driver_runs first (source of truth order)
  const { data: runRow, error: runErr } = await supabase
    .from("driver_runs")
    .select("id, subscriber_id, driver_id, run_date, items, updated_at")
    .eq("subscriber_id", driver.subscriber_id)
    .eq("driver_id", driver.id)
    .eq("run_date", date)
    .maybeSingle();

  if (runErr) {
    console.error("driver_runs load error:", runErr);
    return res.status(500).json({
      ok: false,
      error: "Failed to load run",
      debug: supaErrPayload(runErr),
    });
  }

  if (runRow && Array.isArray(runRow.items)) {
    const jobIds = [];
    for (const it of runRow.items) {
      if (it && typeof it === "object" && it.type === "job" && it.job_id) jobIds.push(it.job_id);
    }

    const { jobsById, jobsErr } = await loadJobsAndSkipTypes(jobIds);
    if (jobsErr) {
      console.error("jobs load error (driver_runs mode):", jobsErr);
      return res.status(500).json({
        ok: false,
        error: "Failed to load jobs",
        debug: supaErrPayload(jobsErr),
        mode: "driver_runs",
      });
    }

    // Filter items: hide completed jobs for this date
    const filteredItems = [];
    for (const it of runRow.items) {
      if (!it || typeof it !== "object") continue;

      if (it.type !== "job") {
        filteredItems.push(it); // keep yard_break / driver_break
        continue;
      }

      const j = it.job_id ? jobsById[String(it.job_id)] : null;
      if (!j) continue;

      if (isOutstandingForDate(j, date)) filteredItems.push(it);
    }

    return res.json({
      ok: true,
      date,
      source: "driver_runs",
      run: { id: runRow.id, run_date: runRow.run_date, updated_at: runRow.updated_at },
      items: filteredItems,
      jobsById,
    });
  }

  // 2) fallback if no run row yet: select outstanding jobs only
  const { data, error } = await supabase
    .from("jobs")
    .select(
      [
        "id",
        "job_number",
        "scheduled_date",
        "collection_date",
        "delivery_actual_date",
        "collection_actual_date",
        "site_name",
        "site_address_line1",
        "site_address_line2",
        "site_town",
        "site_postcode",
        "notes",
        "job_status",
        "price_inc_vat",
        "payment_type",
        "skip_type_id",
        "driver_sort_key",
        "driver_run_group",
        "assigned_driver_id",
      ].join(",")
    )
    .eq("subscriber_id", driver.subscriber_id)
    .eq("assigned_driver_id", driver.id)
    .or(`scheduled_date.eq.${date},collection_date.eq.${date}`)
    .order("driver_run_group", { ascending: true, nullsFirst: true })
    .order("driver_sort_key", { ascending: true, nullsFirst: true })
    .order("job_number", { ascending: true });

  if (error) {
    console.error("jobs fallback load error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to load jobs",
      debug: supaErrPayload(error),
      mode: "jobs_fallback",
    });
  }

  const outstanding = (data || []).filter((j) => isOutstandingForDate(j, date));
  const jobIds = outstanding.map((j) => j.id);

  const { jobsById, jobsErr } = await loadJobsAndSkipTypes(jobIds);
  if (jobsErr) {
    console.error("jobs load error (fallback mode):", jobsErr);
    return res.status(500).json({
      ok: false,
      error: "Failed to load jobs",
      debug: supaErrPayload(jobsErr),
      mode: "jobs_fallback_load_jobsAndSkipTypes",
    });
  }

  const items = outstanding.map((j) => ({ type: "job", job_id: j.id }));

  return res.json({
    ok: true,
    date,
    source: "jobs_fallback",
    run: null,
    items,
    jobsById,
  });
}
