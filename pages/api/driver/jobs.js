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

export default async function handler(req, res) {
  const auth = await getDriverFromSession(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not logged in" });

  const driver = auth.driver;
  const supabase = getSupabaseAdmin();

  const date = typeof req.query.date === "string" && req.query.date ? req.query.date : ymd(new Date());

  // "Work items" for the day: deliveries or collections (tip returns later)
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

  // Add a lightweight "type" so the UI can render a single ordered list
  const jobs = (data || []).map((j) => {
    const isDelivery = j.scheduled_date === date;
    const isCollection = j.collection_date === date;
    let type = "other";
    if (isDelivery && isCollection) type = "delivery+collection";
    else if (isDelivery) type = "delivery";
    else if (isCollection) type = "collection";
    return { ...j, type };
  });

  return res.json({ ok: true, date, jobs });
}
