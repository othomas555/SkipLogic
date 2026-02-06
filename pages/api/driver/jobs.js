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

function asStr(x) {
  return x == null ? "" : String(x);
}

export default async function handler(req, res) {
  const auth = await getDriverFromSession(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not logged in" });

  const driver = auth.driver;
  const supabase = getSupabaseAdmin();

  const date = typeof req.query.date === "string" && req.query.date ? req.query.date : ymd(new Date());

  try {
    // Load jobs assigned to this driver for the selected date
    // Include swap_group_id + type + skip name
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(
        [
          "id",
          "subscriber_id",
          "assigned_driver_id",
          "job_number",
          "job_status",
          "type",
          "swap_group_id",
          "scheduled_date",
          "collection_date",
          "delivery_actual_date",
          "collection_actual_date",
          "payment_type",
          "price_inc_vat",
          "notes",
          "site_name",
          "site_address_line1",
          "site_address_line2",
          "site_town",
          "site_postcode",
          "skip_type_id",
          "skip_types(name)",
        ].join(",")
      )
      .eq("subscriber_id", driver.subscriber_id)
      .eq("assigned_driver_id", driver.id)
      .or(`scheduled_date.eq.${date},collection_date.eq.${date}`)
      .order("job_number", { ascending: true });

    if (error) {
      console.error("driver/jobs load error", error);
      return res.status(500).json({ ok: false, error: "Failed to load jobs" });
    }

    const rows = Array.isArray(jobs) ? jobs : [];

    // Build jobsById for the UI
    const jobsById = {};
    for (const j of rows) {
      jobsById[asStr(j.id)] = {
        ...j,
        skip_type_name: j?.skip_types?.name || j?.skip_type_name || null,
      };
    }

    // ---- Group swaps into one item ----
    // We expect: collection job (type="collection") + delivery job (type="delivery")
    // with same swap_group_id and both on this date (collection_date / scheduled_date).
    const usedJobIds = new Set();
    const swapItems = [];

    // Map swap_group_id -> { collect?: job, deliver?: job }
    const byGroup = {};
    for (const j of rows) {
      const gid = asStr(j.swap_group_id);
      if (!gid) continue;

      if (!byGroup[gid]) byGroup[gid] = {};
      if (j.type === "collection") byGroup[gid].collect = j;
      if (j.type === "delivery") byGroup[gid].deliver = j;
    }

    for (const gid of Object.keys(byGroup)) {
      const pair = byGroup[gid];
      if (!pair.collect || !pair.deliver) continue;

      // only create swap item if BOTH jobs are due today (server-side sanity)
      const collectDue = asStr(pair.collect.collection_date) === date;
      const deliverDue = asStr(pair.deliver.scheduled_date) === date;
      if (!collectDue || !deliverDue) continue;

      // also skip if either already completed (optional but helpful)
      if (pair.collect.collection_actual_date || pair.deliver.delivery_actual_date) {
        // if one side is complete, we keep them separate so driver can finish remaining
        continue;
      }

      swapItems.push({
        type: "swap",
        swap_group_id: gid,
        collect_job_id: pair.collect.id,
        deliver_job_id: pair.deliver.id,
      });

      usedJobIds.add(asStr(pair.collect.id));
      usedJobIds.add(asStr(pair.deliver.id));
    }

    // Remaining jobs become normal job items
    const jobItems = [];
    for (const j of rows) {
      if (usedJobIds.has(asStr(j.id))) continue;

      // Filter out completed items so driver only sees work to do
      // (Delivered deliveries + Collected collections should disappear)
      if (j.type === "delivery" && j.delivery_actual_date) continue;
      if (j.type === "collection" && j.collection_actual_date) continue;

      jobItems.push({ type: "job", job_id: j.id });
    }

    // Build the run list:
    // swaps first, then remaining jobs
    const items = [...swapItems, ...jobItems];

    return res.json({ ok: true, date, items, jobsById });
  } catch (e) {
    console.error("driver/jobs unexpected", e);
    return res.status(500).json({ ok: false, error: "Unexpected error" });
  }
}
