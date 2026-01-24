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

export default async function handler(req, res) {
  const auth = await getDriverFromSession(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not logged in" });

  const driver = auth.driver;
  const supabase = getSupabaseAdmin();

  const date = typeof req.query.date === "string" && req.query.date ? req.query.date : ymd(new Date());

  // 1) Try to load the run from driver_runs (scheduler source of truth)
  const { data: runRow, error: runErr } = await supabase
    .from("driver_runs")
    .select("id, subscriber_id, driver_id, run_date, items, updated_at")
    .eq("subscriber_id", driver.subscriber_id)
    .eq("driver_id", driver.id)
    .eq("run_date", date)
    .maybeSingle();

  if (runErr) {
    return res.status(500).json({ ok: false, error: "Failed to load run" });
  }

  // Helper: load jobs + skip_types for a set of job ids
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
        ].join(",")
      )
      .in("id", ids)
      .eq("subscriber_id", driver.subscriber_id);

    if (jobsErr) {
      return { jobsById: {}, skipTypesById: {}, jobsErr };
    }

    const skipTypeIds = uniq((jobs || []).map((j) => j.skip_type_id).filter(Boolean));

    let skipTypesById = {};
    if (skipTypeIds.length) {
      const { data: sts, error: stErr } = await supabase
        .from("skip_types")
        .select("id, name")
        .in("id", skipTypeIds);

      if (!stErr) {
        for (const st of sts || []) skipTypesById[String(st.id)] = st;
      }
    }

    const jobsById = {};
    for (const j of jobs || []) {
      const isDelivery = j.scheduled_date === date;
      const isCollection = j.collection_date === date;

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

  // 2) If run exists, return items in exact JSON order + job details
  if (runRow && Array.isArray(runRow.items)) {
    const jobIds = [];
    for (const it of runRow.items) {
      if (it && typeof it === "object" && it.type === "job" && it.job_id) jobIds.push(it.job_id);
    }

    const { jobsById, jobsErr } = await loadJobsAndSkipTypes(jobIds);
    if (jobsErr) return res.status(500).json({ ok: false, error: "Failed to load jobs" });

    return res.json({
      ok: true,
      date,
      source: "driver_runs",
      run: { id: runRow.id, run_date: runRow.run_date, updated_at: runRow.updated_at },
      items: runRow.items, // MUST stay in exact JSON order
      jobsById,
    });
  }

  // 3) Fallback (no run row yet): old behaviour using driver_sort_key etc
  const { data, error } = await supabase
    .from("jobs")
    .select(
      [
        "id",
        "job_number",
        "scheduled_date",
        "collection_date",
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
      ].join(",")
    )
    .eq("subscriber_id", driver.subscriber_id)
    .eq("assigned_driver_id", driver.id)
    .or(`scheduled_date.eq.${date},collection_date.eq.${date}`)
    .order("driver_run_group", { ascending: true, nullsFirst: true })
    .order("driver_sort_key", { ascending: true, nullsFirst: true })
    .order("job_number", { ascending: true });

  if (error) return res.status(500).json({ ok: false, error: "Failed to load jobs" });

  const jobIds = (data || []).map((j) => j.id);
  const { jobsById, jobsErr } = await loadJobsAndSkipTypes(jobIds);
  if (jobsErr) return res.status(500).json({ ok: false, error: "Failed to load jobs" });

  // Build items array matching the fallback order
  const items = (data || []).map((j) => ({ type: "job", job_id: j.id }));

  return res.json({
    ok: true,
    date,
    source: "jobs_fallback",
    run: null,
    items,
    jobsById,
  });
}
