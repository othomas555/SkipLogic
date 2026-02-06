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
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const auth = await getDriverFromSession(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not logged in" });

  const driver = auth.driver;
  const supabase = getSupabaseAdmin();

  const date = typeof req.query?.date === "string" && req.query.date ? req.query.date : ymd(new Date());

  try {
    // Pull assigned jobs for that day:
    // - deliveries due today (scheduled_date)
    // - collections due today (collection_date)
    //
    // IMPORTANT: include swap_group_id + swap_role so the driver UI can collapse swaps.
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(
        [
          "id",
          "subscriber_id",
          "assigned_driver_id",
          "job_number",
          "job_status",
          "customer_id",
          "skip_type_id",
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
          "payment_type",
          "price_inc_vat",
          // swap fields (CRITICAL)
          "swap_group_id",
          "swap_role",
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

    // Filter to "work to be done" (hide already completed legs)
    const due = rows.filter((j) => {
      // delivery due today
      const deliverDue = String(j.scheduled_date || "") === String(date) && !j.delivery_actual_date;
      // collection due today
      const collectDue = String(j.collection_date || "") === String(date) && !j.collection_actual_date;

      return deliverDue || collectDue;
    });

    // Optional: add skip type names (best effort, no crash if table differs)
    let skipNameById = {};
    try {
      const ids = [...new Set(due.map((j) => j.skip_type_id).filter(Boolean))];
      if (ids.length) {
        const { data: st, error: stErr } = await supabase
          .from("skip_types")
          .select("id,name")
          .eq("subscriber_id", driver.subscriber_id)
          .in("id", ids);

        if (!stErr && Array.isArray(st)) {
          for (const s of st) skipNameById[String(s.id)] = s.name;
        }
      }
    } catch (e) {
      // ignore
    }

    const jobsById = {};
    for (const j of due) {
      jobsById[String(j.id)] = {
        ...j,
        skip_type_name: skipNameById[String(j.skip_type_id)] || j.skip_type_name || null,
      };
    }

    // items list (simple). The driver/work UI will collapse swap pairs into one card.
    const items = due.map((j) => ({ type: "job", job_id: j.id }));

    return res.json({ ok: true, date, items, jobsById });
  } catch (e) {
    console.error("driver/jobs unexpected", e);
    return res.status(500).json({ ok: false, error: "Failed to load jobs" });
  }
}
