// pages/api/driver/run.js
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

async function loadJobsForRun(supabase, subscriberId, jobIds) {
  if (!jobIds.length) return [];

  // Try extended field set first.
  const extendedSelect = [
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

    // best-effort optional fields for driver detail
    "placement",
    "placement_location",
    "placement_notes",
    "private_ground",
    "permit_required",
    "permit_type",
    "permit_status",
  ].join(",");

  const baseSelect = [
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
  ].join(",");

  let jobsErr = null;
  let jobsData = null;

  ({ data: jobsData, error: jobsErr } = await supabase
    .from("jobs")
    .select(extendedSelect)
    .eq("subscriber_id", subscriberId)
    .in("id", jobIds));

  if (jobsErr) {
    console.warn("driver/run extended jobs select failed, falling back:", jobsErr.message);

    ({ data: jobsData, error: jobsErr } = await supabase
      .from("jobs")
      .select(baseSelect)
      .eq("subscriber_id", subscriberId)
      .in("id", jobIds));
  }

  if (jobsErr) throw jobsErr;
  return Array.isArray(jobsData) ? jobsData : [];
}

async function loadCustomersBestEffort(supabase, subscriberId, customerIds) {
  if (!customerIds.length) return {};

  const attempts = [
    "id, first_name, last_name, company_name, phone, email",
    "id, name, phone, email",
    "id, company_name, phone, email",
    "id, first_name, last_name, phone, email",
  ];

  for (const selectText of attempts) {
    const { data, error } = await supabase
      .from("customers")
      .select(selectText)
      .eq("subscriber_id", subscriberId)
      .in("id", customerIds);

    if (!error) {
      const out = {};
      for (const c of data || []) out[String(c.id)] = c;
      return out;
    }
  }

  console.warn("driver/run could not load customer detail fields; continuing without customer info");
  return {};
}

function getCustomerName(customer) {
  if (!customer) return "";
  if (customer.company_name) {
    const person = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
    return person ? `${customer.company_name} – ${person}` : customer.company_name;
  }
  if (customer.name) return customer.name;
  const person = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
  return person || "";
}

function buildPlacementSummary(job) {
  const bits = [];

  if (job?.placement_location) bits.push(job.placement_location);
  if (job?.placement_notes) bits.push(job.placement_notes);
  if (job?.placement) bits.push(job.placement);

  if (job?.private_ground === true) bits.push("Private ground");
  if (job?.private_ground === false) bits.push("Road placement");

  if (job?.permit_required === true) bits.push("Permit required");
  if (job?.permit_required === false) bits.push("No permit");

  if (job?.permit_type) bits.push(job.permit_type);
  if (job?.permit_status) bits.push(job.permit_status);

  return bits.join(" · ");
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

    const jobs = await loadJobsForRun(supabase, driver.subscriber_id, jobIds);

    const skipTypeIds = [...new Set(jobs.map((j) => j.skip_type_id).filter(Boolean).map(String))];
    const customerIds = [...new Set(jobs.map((j) => j.customer_id).filter(Boolean).map(String))];

    const skipTypeNameById = {};
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

    const customerById = await loadCustomersBestEffort(supabase, driver.subscriber_id, customerIds);

    const jobsById = {};
    for (const job of jobs) {
      const customer = customerById[String(job.customer_id)] || null;

      jobsById[String(job.id)] = {
        ...job,
        skip_type_name: skipTypeNameById[String(job.skip_type_id)] || "",
        customer_name: getCustomerName(customer),
        customer_phone: customer?.phone || "",
        customer_email: customer?.email || "",
        driver_job_type: pickJobType(job, date),
        driver_completed: isJobCompleted(job, date),

        // convenience field for UI
        placement_summary: buildPlacementSummary(job),
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
