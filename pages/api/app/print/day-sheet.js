import { requireOfficeUser } from "../../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function asText(v) {
  return typeof v === "string" ? v.trim() : "";
}

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function formatAddress(job) {
  const parts = [
    job.site_name,
    job.site_address_line1,
    job.site_address_line2,
    job.site_town,
    job.site_postcode,
  ]
    .map((x) => asText(x))
    .filter(Boolean);

  return parts.join(", ");
}

const COLLECTION_DATE_FIELDS = [
  "collection_scheduled_date",
  "collection_date",
  "scheduled_collection_date",
  "requested_collection_date",
  "collection_requested_date",
];

function jobHasCollectionBookedForDate(job, date) {
  return COLLECTION_DATE_FIELDS.some((field) => asText(job[field]) === date);
}

function deriveJobType(job, date) {
  if (job.swap_group_id || job.swap_parent_job_id || asText(job.swap_role)) {
    return "Swap";
  }

  if (jobHasCollectionBookedForDate(job, date)) {
    return "Collection";
  }

  if (job.job_status === "collected" || job.collection_actual_date) {
    return "Collection";
  }

  return "Delivery";
}

function deriveStatus(job) {
  return asText(job.job_status) || "booked";
}

function deriveSkipName(job, skipTypeMap) {
  if (asText(job.custom_skip_description)) return asText(job.custom_skip_description);

  const skipTypeId = job.skip_type_id;
  if (skipTypeId && skipTypeMap[skipTypeId]) return skipTypeMap[skipTypeId];

  return "";
}

function deriveCustomerLabel(customer) {
  if (!customer) return "";

  const firstName = asText(customer.first_name);
  const lastName = asText(customer.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return (
    asText(customer.company_name) ||
    asText(customer.contact_name) ||
    asText(customer.full_name) ||
    asText(customer.name) ||
    fullName ||
    asText(customer.email) ||
    ""
  );
}

function deriveCustomerPhone(customer) {
  if (!customer) return "";
  return (
    asText(customer.phone) ||
    asText(customer.mobile) ||
    asText(customer.telephone) ||
    ""
  );
}

function deriveCustomerName(job, customerMap) {
  const customerId = job.customer_id;
  if (customerId && customerMap[customerId]) {
    return deriveCustomerLabel(customerMap[customerId]);
  }
  return "";
}

function deriveDriverLabel(driver) {
  if (!driver) return "";
  return asText(driver.full_name) || asText(driver.name) || "";
}

function deriveDriverName(job, driverMap) {
  const driverId = job.assigned_driver_id;
  if (driverId && driverMap[driverId]) return driverMap[driverId];
  return "";
}

function derivePermit(job) {
  return job.permit_setting_id || job.permit_override ? "Yes" : "";
}

function deriveRoadPlacement(job) {
  return asText(job.placement_type).toLowerCase() === "road" ? "Road" : "";
}

function sortJobs(a, b) {
  const groupA = a.driver_run_group ?? 999999;
  const groupB = b.driver_run_group ?? 999999;
  if (groupA !== groupB) return groupA - groupB;

  const sortA = a.driver_sort_key ?? 999999;
  const sortB = b.driver_sort_key ?? 999999;
  if (sortA !== sortB) return sortA - sortB;

  return String(a.created_at || "").localeCompare(String(b.created_at || ""));
}

async function fetchJobsByDateField(supabase, subscriberId, fieldName, date) {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq(fieldName, date);

  if (error) {
    const msg = String(error.message || "").toLowerCase();

    if (
      msg.includes("column") ||
      msg.includes("does not exist") ||
      msg.includes("schema cache")
    ) {
      return [];
    }

    throw error;
  }

  return data || [];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await requireOfficeUser(req);

    if (!auth?.ok) {
      return res.status(401).json({
        ok: false,
        error: auth?.error || "Unauthorised",
      });
    }

    const subscriberId =
      auth.subscriberId ||
      auth.subscriber_id ||
      auth.profile?.subscriber_id ||
      null;

    if (!subscriberId) {
      return res.status(400).json({
        ok: false,
        error: "Missing subscriber id",
      });
    }

    const date = asText(req.query.date);
    const driverId = asText(req.query.driver_id);

    if (!isYmd(date)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid date. Use YYYY-MM-DD",
      });
    }

    const supabase = getSupabaseAdmin();

    const jobLists = await Promise.all([
      fetchJobsByDateField(supabase, subscriberId, "scheduled_date", date),
      ...COLLECTION_DATE_FIELDS.map((fieldName) =>
        fetchJobsByDateField(supabase, subscriberId, fieldName, date)
      ),
    ]);

    const jobMap = new Map();

    jobLists.flat().forEach((job) => {
      if (job?.id) jobMap.set(job.id, job);
    });

    const allJobsForDate = Array.from(jobMap.values()).sort(sortJobs);

    const filteredJobs = driverId
      ? allJobsForDate.filter(
          (job) => String(job.assigned_driver_id || "") === driverId
        )
      : allJobsForDate;

    const customerIds = [
      ...new Set(filteredJobs.map((j) => j.customer_id).filter(Boolean)),
    ];

    const skipTypeIds = [
      ...new Set(filteredJobs.map((j) => j.skip_type_id).filter(Boolean)),
    ];

    const driverIdsForDate = [
      ...new Set(allJobsForDate.map((j) => j.assigned_driver_id).filter(Boolean)),
    ];

    let customerMap = {};
    let skipTypeMap = {};
    let driverMap = {};

    if (customerIds.length) {
      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("*")
        .in("id", customerIds);

      if (customersError) {
        return res.status(500).json({
          ok: false,
          error: customersError.message,
        });
      }

      customerMap = Object.fromEntries(
        (customers || []).map((customer) => [customer.id, customer])
      );
    }

    if (skipTypeIds.length) {
      const { data: skipTypes, error: skipTypesError } = await supabase
        .from("skip_types")
        .select("*")
        .in("id", skipTypeIds);

      if (skipTypesError) {
        return res.status(500).json({
          ok: false,
          error: skipTypesError.message,
        });
      }

      skipTypeMap = Object.fromEntries(
        (skipTypes || []).map((s) => [
          s.id,
          asText(s.name) || asText(s.label) || "",
        ])
      );
    }

    if (driverIdsForDate.length) {
      const { data: drivers, error: driversError } = await supabase
        .from("drivers")
        .select("*")
        .in("id", driverIdsForDate);

      if (driversError) {
        return res.status(500).json({
          ok: false,
          error: driversError.message,
        });
      }

      driverMap = Object.fromEntries(
        (drivers || []).map((driver) => [driver.id, deriveDriverLabel(driver)])
      );
    }

    const rows = filteredJobs.map((job, idx) => ({
      id: job.id,
      run_order: job.driver_sort_key ?? idx + 1,
      run_group: job.driver_run_group ?? null,
      job_number: asText(job.job_number),
      job_type: deriveJobType(job, date),
      customer_name: deriveCustomerName(job, customerMap),
      customer_phone: deriveCustomerPhone(customerMap[job.customer_id]),
      address: formatAddress(job),
      skip_name: deriveSkipName(job, skipTypeMap),
      notes: asText(job.notes),
      permit: derivePermit(job),
      placement: deriveRoadPlacement(job),
      driver_name: deriveDriverName(job, driverMap),
      status: deriveStatus(job),
    }));

    const drivers = driverIdsForDate
      .map((id) => ({
        id,
        name: driverMap[id] || id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({
      ok: true,
      date,
      driver_id: driverId || "",
      total: rows.length,
      rows,
      drivers,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unexpected error",
    });
  }
}
