// pages/api/jobs/book-swap.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabase = getSupabaseAdmin();
  const body = req.body && typeof req.body === "object" ? req.body : {};

  try {
    const subscriberId = String(body.subscriber_id || "");
    const oldJobId = String(body.old_job_id || "");
    const newSkipTypeId = String(body.new_skip_type_id || "");
    const swapDate = String(body.swap_date || "");
    const priceIncVat = Number(body.price_inc_vat);

    assert(subscriberId, "Missing subscriber_id");
    assert(oldJobId, "Missing old_job_id");
    assert(newSkipTypeId, "Missing new_skip_type_id");
    assert(swapDate, "Missing swap_date");
    assert(Number.isFinite(priceIncVat) && priceIncVat > 0, "Invalid price_inc_vat");

    // Load old job
    const { data: oldJob, error: oldErr } = await supabase
      .from("jobs")
      .select(
        `
        id, subscriber_id, customer_id, skip_type_id,
        site_name, site_address_line1, site_address_line2, site_town, site_postcode,
        scheduled_date, delivery_actual_date, collection_date, collection_actual_date,
        notes, payment_type, job_status
      `
      )
      .eq("id", oldJobId)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (oldErr) throw new Error("Failed to load old job");
    assert(oldJob, "Old job not found");
    assert(!oldJob.collection_actual_date, "Old job already collected");
    assert(["delivered", "awaiting_collection"].includes(oldJob.job_status), "Old job must be delivered / awaiting_collection");

    const swapGroupId = crypto.randomUUID();

    // 1) Update old job -> schedule collection + link
    const { error: updErr } = await supabase
      .from("jobs")
      .update({
        collection_date: swapDate,
        job_status: "awaiting_collection",
        swap_group_id: swapGroupId,
        swap_role: "collect",
      })
      .eq("id", oldJob.id)
      .eq("subscriber_id", subscriberId);

    if (updErr) throw new Error("Failed to update old job for swap");

    // 2) Insert new delivery job -> link
    const { data: newJob, error: insErr } = await supabase
      .from("jobs")
      .insert([
        {
          subscriber_id: subscriberId,
          customer_id: oldJob.customer_id,
          skip_type_id: newSkipTypeId,

          site_name: oldJob.site_name || null,
          site_address_line1: oldJob.site_address_line1 || null,
          site_address_line2: oldJob.site_address_line2 || null,
          site_town: oldJob.site_town || null,
          site_postcode: oldJob.site_postcode || null,

          scheduled_date: swapDate,
          notes: body.notes ? String(body.notes) : "Swap delivery booked",
          payment_type: body.payment_type ? String(body.payment_type) : (oldJob.payment_type || "card"),
          price_inc_vat: priceIncVat,

          swap_group_id: swapGroupId,
          swap_role: "deliver",
        },
      ])
      .select("id, job_number, customer_id, skip_type_id, scheduled_date, price_inc_vat, swap_group_id, swap_role")
      .single();

    if (insErr) throw new Error("Failed to create new delivery job");

    // Create initial delivery event on NEW job
    const { error: evErr } = await supabase.rpc("create_job_event", {
      _subscriber_id: subscriberId,
      _job_id: newJob.id,
      _event_type: "delivery",
      _scheduled_at: null,
      _completed_at: null,
      _notes: "Swap delivery booked",
    });

    if (evErr) throw new Error("Swap created but delivery event failed");

    return res.json({ ok: true, swap_group_id: swapGroupId, new_job: newJob });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
