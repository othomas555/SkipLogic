import { getDriverFromSession } from "../../../lib/driverAuth";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await getDriverFromSession(req);
    if (!auth?.ok || !auth?.driver) {
      return res.status(401).json({
        ok: false,
        signed_in: false,
        error: "Not signed in",
      });
    }

    const driver = auth.driver;
    const date = String(req.query?.date || "");

    if (!isYmd(date)) {
      return res.status(400).json({ ok: false, error: "Invalid or missing date" });
    }

    const supabase = getSupabaseAdmin();

    const { data: run, error: runErr } = await supabase
      .from("driver_runs")
      .select("id, driver_id, run_date, items, updated_at")
      .eq("driver_id", driver.id)
      .eq("run_date", date)
      .maybeSingle();

    if (runErr) {
      return res.status(500).json({ ok: false, error: runErr.message || "Failed to load run" });
    }

    if (!run) {
      return res.status(200).json({
        ok: true,
        signed_in: true,
        driver: {
          id: driver.id,
          subscriber_id: driver.subscriber_id,
          name: driver.name,
          email: driver.email || "",
        },
        run: null,
        jobs: {},
      });
    }

    const items = Array.isArray(run.items) ? run.items : [];
    const jobIds = [...new Set(items.filter((x) => x?.type === "job" && x?.job_id).map((x) => x.job_id))];

    let jobs = [];
    if (jobIds.length > 0) {
      const { data: jobsData, error: jobsErr } = await supabase
        .from("jobs")
        .select(
          "id, job_number, site_name, site_address_line1, site_address_line2, site_town, site_postcode, notes, payment_type, job_status, skip_type_id"
        )
        .eq("subscriber_id", driver.subscriber_id)
        .in("id", jobIds);

      if (jobsErr) {
        return res.status(500).json({ ok: false, error: jobsErr.message || "Failed to load jobs" });
      }

      jobs = Array.isArray(jobsData) ? jobsData : [];
    }

    const skipTypeIds = [...new Set(jobs.map((j) => j.skip_type_id).filter(Boolean))];
    const skipTypeNameById = {};

    if (skipTypeIds.length > 0) {
      const { data: skipTypesData } = await supabase
        .from("skip_types")
        .select("id, name")
        .eq("subscriber_id", driver.subscriber_id)
        .in("id", skipTypeIds);

      for (const st of skipTypesData || []) {
        skipTypeNameById[st.id] = st.name || "";
      }
    }

    const jobsById = {};
    for (const job of jobs) {
      jobsById[job.id] = {
        ...job,
        skip_type_name: skipTypeNameById[job.skip_type_id] || "",
      };
    }

    return res.status(200).json({
      ok: true,
      signed_in: true,
      driver: {
        id: driver.id,
        subscriber_id: driver.subscriber_id,
        name: driver.name,
        email: driver.email || "",
      },
      run,
      jobs: jobsById,
    });
  } catch (err) {
    console.error("driver run api error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unexpected server error",
    });
  }
}
