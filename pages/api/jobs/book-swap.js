// pages/api/jobs/book-swap.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import crypto from "crypto";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function getNextDriverRunGroup(supabase, subscriberId, swapDate) {
  // We treat "what's happening on swapDate" as:
  // - deliveries: scheduled_date = swapDate
  // - collections: collection_date = swapDate
  //
  // driver_run_group should be the same for BOTH legs of a swap
  const { data, error } = await supabase
    .from("jobs")
    .select("driver_run_group")
    .eq("subscriber_id", subscriberId)
    .or(`scheduled_date.eq.${swapDate},collection_date.eq.${swapDate}`)
    .not("driver_run_group", "is", null)
    .order("driver_run_group", { ascending: false })
    .limit(1);

  if (error) {
    console.error("getNextDriverRunGroup error:", error);
    throw new Error("Failed to generate driver_run_group");
  }

  const maxGroup = data && data.length ? Number(data[0].driver_run_group) : 0;
  return (Number.isFinite(maxGroup) ? maxGroup : 0) + 1;
}

function getBaseUrlFromReq(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https");
  const host = String(req.headers["x-forwarded-host"] || req.headers["host"] || "");
  if (!host) return null;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  const body = req.body && typeof req.body === "object" ? req.body : {};

  try {
    const subscriberId = String(body.subscriber_id || "");
    const oldJobId = String(body.old_job_id || "");
    const newSkipTypeId = String(body.new_skip_type_id || "");
    const swapDate = String(body.swap_date || "");
    const priceIncVat = Number(body.price_inc_vat);

    // OPTION 2: caller controls invoicing (default true)
    const createInvoice = body.create_invoice === false ? false : true;

    assert(subscriberId, "Missing subscriber_id");
    assert(oldJobId, "Missing old_job_id");
    assert(newSkipTypeId, "Missing new_skip_type_id");
    assert(swapDate, "Missing swap_date");
    assert(Number.isFinite(priceIncVat) && priceIncVat > 0, "Invalid price_inc_vat");

    // Load old job (we copy site + customer + payment type, and also assigned driver if present)
    const { data: oldJob, error: oldErr } = await supabase
      .from("jobs")
      .select(
        `
        id, subscriber_id, customer_id, skip_type_id,
        site_name, site_address_line1, site_address_line2, site_town, site_postcode,
        scheduled_date, delivery_actual_date, collection_date, collection_actual_date,
        notes, payment_type, job_status,
        assigned_driver_id
      `
      )
      .eq("id", oldJobId)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (oldErr) throw new Error("Failed to load old job");
    assert(oldJob, "Old job not found");
    assert(!oldJob.collection_actual_date, "Old job already collected");
    assert(
      ["delivered", "awaiting_collection"].includes(oldJob.job_status),
      "Old job must be delivered / awaiting_collection"
    );

    const swapGroupId = crypto.randomUUID();

    // Create a numeric run group for this swap date,
    // so both legs can be treated as one “swap” on scheduler/driver views.
    const driverRunGroup = await getNextDriverRunGroup(supabase, subscriberId, swapDate);

    // 1) Update old job -> schedule collection + link
    const { error: updErr } = await supabase
      .from("jobs")
      .update({
        collection_date: swapDate,
        job_status: "awaiting_collection",
        swap_group_id: swapGroupId,
        swap_role: "collect",
        driver_run_group: driverRunGroup,
      })
      .eq("id", oldJob.id)
      .eq("subscriber_id", subscriberId);

    if (updErr) {
      console.error("Failed to update old job for swap:", updErr);
      throw new Error("Failed to update old job for swap");
    }

    // 2) Insert new delivery job -> link (and match driver_run_group)
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
          payment_type: body.payment_type ? String(body.payment_type) : oldJob.payment_type || "card",
          price_inc_vat: priceIncVat,

          // If old job is already assigned, keep the same driver for the new leg
          assigned_driver_id: oldJob.assigned_driver_id || null,

          swap_group_id: swapGroupId,
          swap_role: "deliver",

          // Same group number for both legs
          driver_run_group: driverRunGroup,
        },
      ])
      .select(
        "id, job_number, customer_id, skip_type_id, scheduled_date, price_inc_vat, swap_group_id, swap_role, driver_run_group, assigned_driver_id"
      )
      .single();

    if (insErr) {
      console.error("Failed to create new delivery job:", insErr);
      throw new Error("Failed to create new delivery job");
    }

    // Create initial delivery event on NEW job
    const { error: evErr } = await supabase.rpc("create_job_event", {
      _subscriber_id: subscriberId,
      _job_id: newJob.id,
      _event_type: "delivery",
      _scheduled_at: null,
      _completed_at: null,
      _notes: "Swap delivery booked",
    });

    if (evErr) {
      console.error("Swap created but delivery event failed:", evErr);
      throw new Error("Swap created but delivery event failed");
    }

    // 3) OPTIONAL: Create Xero invoice for NEW delivery job only
    // (collection leg is the original job and is assumed already invoiced / not invoiced here)
    let invoice = null;
    let invoice_warning = null;

    if (createInvoice) {
      const authHeader = String(req.headers.authorization || "");
      if (!authHeader.startsWith("Bearer ")) {
        invoice_warning =
          "create_invoice requested but no Authorization: Bearer token was provided to this endpoint, so Xero invoice creation was skipped.";
      } else {
        const baseUrl = getBaseUrlFromReq(req);
        if (!baseUrl) {
          invoice_warning =
            "create_invoice requested but could not determine base URL from request headers; Xero invoice creation was skipped.";
        } else {
          try {
            const invRes = await fetch(`${baseUrl}/api/xero/xero_create_invoice`, {
              method: "POST",
              headers: {
                Authorization: authHeader,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ job_id: newJob.id }),
            });

            const invJson = await invRes.json().catch(() => ({}));
            invoice = {
              status: invRes.status,
              json: invJson,
            };

            if (!invRes.ok || !invJson?.ok) {
              invoice_warning = invJson?.details || invJson?.error || "Xero invoice creation failed";
            }
          } catch (e) {
            invoice_warning = "Xero invoice creation failed unexpectedly";
          }
        }
      }
    }

    return res.json({
      ok: true,
      swap_group_id: swapGroupId,
      driver_run_group: driverRunGroup,
      new_job: newJob,
      create_invoice: createInvoice,
      invoice,
      invoice_warning,
    });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
