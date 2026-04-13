import { requireOfficeUser } from "../../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function asText(v) {
  return typeof v === "string" ? v.trim() : "";
}

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function safeLower(v) {
  return String(v || "").trim().toLowerCase();
}

function formatAddress(job) {
  const parts = [
    job.site_name,
    job.site_address_line1,
    job.site_address_line2,
    job.site_town,
    job.site_county,
    job.site_postcode,
  ]
    .map((x) => asText(x))
    .filter(Boolean);

  return parts.join(", ");
}

function deriveJobType(job) {
  const raw =
    safeLower(job.job_type) ||
    safeLower(job.type) ||
    safeLower(job.service_type) ||
    safeLower(job.booking_type);

  if (raw.includes("swap")) return "Swap";
  if (raw.includes("collect")) return "Collection";
  if (raw.includes("delivery")) return "Delivery";

  if (job.swap_for_job_id) return "Swap";
  if (job.linked_delivered_job_id) return "Swap";
  if (job.collection_of_job_id) return "Collection";

  return "Delivery";
}

function deriveStatus(job) {
  return (
    asText(job.status) ||
    asText(job.job_status) ||
    asText(job.lifecycle_status) ||
    "Planned"
  );
}

function deriveSkipName(job, skipTypeMap) {
  if (asText(job.custom_skip_description)) return asText(job.custom_skip_description);
  if (asText(job.custom_description)) return asText(job.custom_description);
  if (asText(job.skip_description)) return asText(job.skip_description);

  const skipTypeId = job.skip_type_id;
  if (skipTypeId && skipTypeMap[skipTypeId]) return skipTypeMap[skipTypeId];

  return asText(job.skip_type_name) || asText(job.skip_size) || "";
}

function deriveCustomerName(job, customerMap) {
  const customerId = job.customer_id;
  if (customerId && customerMap[customerId]) return customerMap[customerId];

  return (
    asText(job.customer_name) ||
    asText(job.account_name) ||
    asText(job.contact_name) ||
    ""
  );
}

function deriveDriverName(job, driverMap) {
  const driverId = job.driver_id;
  if (driverId && driverMap[driverId]) return driverMap[driverId];

  return asText(job.driver_name) || "";
}

function derivePermit(job) {
  const yes =
    job.requires_permit ||
    job.permit_required ||
    job.has_permit ||
    false;

  return yes ? "Yes" : "";
}

function deriveRoadPlacement(job) {
  const yes =
    job.on_road ||
    job.road_placement ||
    job.highway_placement ||
    false;

  return yes ? "Road" : "";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await requireOfficeUser(req, res);
    if (!auth || auth.ok === false) return;

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

    let jobsQuery = supabase
      .from("jobs")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .eq("scheduled_date", date)
      .order("run_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (driverId) {
      jobsQuery = jobsQuery.eq("driver_id", driverId);
    }

    const { data: jobs, error: jobsError } = await jobsQuery;

    if (jobsError) {
      return res.status(500).json({
        ok: false,
        error: jobsError.message,
      });
    }

    const customerIds = [...new Set((jobs || []).map((j) => j.customer_id).filter(Boolean))];
    const skipTypeIds = [...new Set((jobs || []).map((j) => j.skip_type_id).filter(Boolean))];
    const driverIds = [...new Set((jobs || []).map((j) => j.driver_id).filter(Boolean))];

    let customerMap = {};
    let skipTypeMap = {};
    let driverMap = {};

    if (customerIds.length) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id,name,company_name,contact_name")
        .in("id", customerIds);

      customerMap = Object.fromEntries(
        (customers || []).map((c) => [
          c.id,
          asText(c.name) || asText(c.company_name) || asText(c.contact_name) || "",
        ])
      );
    }

    if (skipTypeIds.length) {
      const { data: skipTypes } = await supabase
        .from("skip_types")
        .select("id,name")
        .in("id", skipTypeIds);

      skipTypeMap = Object.fromEntries(
        (skipTypes || []).map((s) => [s.id, asText(s.name)])
      );
    }

    if (driverIds.length) {
      const { data: drivers } = await supabase
        .from("drivers")
        .select("id,name,full_name")
        .in("id", driverIds);

      driverMap = Object.fromEntries(
        (drivers || []).map((d) => [
          d.id,
          asText(d.name) || asText(d.full_name) || "",
        ])
      );
    }

    const rows = (jobs || []).map((job, idx) => ({
      id: job.id,
      run_order: job.run_order ?? idx + 1,
      job_number: asText(job.job_number),
      job_type: deriveJobType(job),
      customer_name: deriveCustomerName(job, customerMap),
      address: formatAddress(job),
      skip_name: deriveSkipName(job, skipTypeMap),
      notes: asText(job.notes),
      permit: derivePermit(job),
      placement: deriveRoadPlacement(job),
      driver_name: deriveDriverName(job, driverMap),
      status: deriveStatus(job),
    }));

    return res.status(200).json({
      ok: true,
      date,
      driver_id: driverId || null,
      total: rows.length,
      rows,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unexpected error",
    });
  }
}
