import { getDriverFromSession } from "../../../lib/driverAuth";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function pickJobType(job, runDate) {
  const collectionDueToday = String(job?.collection_date || "") === String(runDate);
  return collectionDueToday ? "collection" : "delivery";
}

function isJobCompleted(job, runDate) {
  const kind = pickJobType(job, runDate);
  if (kind === "collection") return !!job?.collection_actual_date;
  return !!job?.delivery_actual_date;
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
      .select("id, subscriber_id, driver_id, run_date, items, updated_at")
      .eq("subscriber_id", driver.subscriber_id)
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

    const jobIds = [
      ...new Set(
        items.flatMap((x) => {
          if (!x || typeof x !== "object") return [];
          if (x.type === "job" && x.job_id) return [String(x.job_id)];
          if (x.type === "swap") {
            return [x.collect_job_id, x.deliver_job_id].filter(Boolean).map(String);
          }
          return [];
        })
      ),
    ];

    let jobs = [];
    if (jobIds.length > 0) {
      const { data: jobsData, error: jobsErr } = await supabase
        .from("jobs")
        .select(
          [
            "id",
            "job_number",
            "customer_id",
            "site_name",
            "site_address_line1",
            "site_address_line2",
            "site_town",
            "site_postcode",
            "notes",
            "payment_type",
            "job_status",
            "skip_type_id",
            "scheduled_date",
            "collection_date",
            "delivery_actual_date",
            "collection_actual_date",
            "delivery_photo_url",
            "collection_photo_url",
            "swap_full_photo_url",
            "swap_empty_photo_url",
            "swap_group_id",
            "swap_role",
            "assigned_driver_id",
          ].join(",")
        )
        .eq("subscriber_id", driver.subscriber_id)
        .in("id", jobIds);

      if (jobsErr) {
        return res.status(500).json({ ok: false, error: jobsErr.message || "Failed to load jobs" });
      }

      jobs = Array.isArray(jobsData) ? jobsData : [];
    }

    const skipTypeIds = [...new Set(jobs.map((j) => j.skip_type_id).filter(Boolean))];
    const customerIds = [...new Set(jobs.map((j) => j.customer_id).filter(Boolean))];

    const skipTypeNameById = {};
    const customerById = {};

    if (skipTypeIds.length > 0) {
      const { data: skipTypesData } = await supabase
        .from("skip_types")
        .select("id, name")
        .eq("subscriber_id", driver.subscriber_id)
        .in("id", skipTypeIds);

      for (const st of skipTypesData || []) {
        skipTypeNameById[String(st.id)] = st.name || "";
      }
    }

    if (customerIds.length > 0) {
      const { data: customerRows } = await supabase
        .from("customers")
        .select("id, first_name, last_name, company_name, phone, email")
        .eq("subscriber_id", driver.subscriber_id)
        .in("id", customerIds);

      for (const c of customerRows || []) {
        customerById[String(c.id)] = c;
      }
    }

    const jobsById = {};
    for (const job of jobs) {
      const customer = customerById[String(job.customer_id)] || null;
      const customerName = customer
        ? [customer.company_name, `${customer.first_name || ""} ${customer.last_name || ""}`.trim()]
            .filter(Boolean)
            .join(" – ")
        : "";

      jobsById[String(job.id)] = {
        ...job,
        skip_type_name: skipTypeNameById[String(job.skip_type_id)] || "",
        customer_name: customerName || "",
        customer_phone: customer?.phone || "",
        customer_email: customer?.email || "",
        driver_job_type: pickJobType(job, date),
        driver_completed: isJobCompleted(job, date),
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
