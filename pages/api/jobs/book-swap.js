import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { createInvoiceForJob } from "../xero/xero_create_invoice";
import crypto from "crypto";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isWeekendDate(ymd) {
  const dt = new Date(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(dt.getTime())) return false;
  const day = dt.getUTCDay();
  return day === 0 || day === 6;
}

function clampMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.round(x * 100) / 100);
}

async function getNextDriverRunGroup(supabase, subscriberId, swapDate) {
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
    const priceIncVat = clampMoney(body.price_inc_vat);

    const createInvoice = body.create_invoice === false ? false : true;
    const weekendOverride = !!body.weekend_override;

    const creditOverrideToken = body.credit_override_token ? String(body.credit_override_token) : "";
    const creditOverrideReason = body.credit_override_reason ? String(body.credit_override_reason) : "";
    const creditOverride = !!creditOverrideToken;

    assert(subscriberId, "Missing subscriber_id");
    assert(oldJobId, "Missing old_job_id");
    assert(newSkipTypeId, "Missing new_skip_type_id");
    assert(swapDate, "Missing swap_date");
    assert(Number.isFinite(priceIncVat) && priceIncVat > 0, "Invalid price_inc_vat");

    if (creditOverride) {
      assert(creditOverrideToken.length >= 8, "Invalid credit_override_token");
      if (creditOverrideReason && creditOverrideReason.length > 800) {
        throw new Error("credit_override_reason too long");
      }
    }

    if (isWeekendDate(swapDate) && !weekendOverride) {
      return res.status(400).json({
        ok: false,
        error: "Weekend booking is blocked unless weekend_override is true",
        details: { swap_date: swapDate, weekend_override: weekendOverride },
      });
    }

    const { data: oldJob, error: oldErr } = await supabase
      .from("jobs")
      .select(`
        id,
        subscriber_id,
        customer_id,
        skip_type_id,
        site_name,
        site_address_line1,
        site_address_line2,
        site_town,
        site_postcode,
        site_lat,
        site_lng,
        scheduled_date,
        delivery_actual_date,
        collection_date,
        collection_actual_date,
        notes,
        payment_type,
        job_status,
        assigned_driver_id
      `)
      .eq("id", oldJobId)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (oldErr) {
      console.error("Failed to load old job:", oldErr);
      throw new Error("Failed to load old job");
    }

    assert(oldJob, "Old job not found");
    assert(!oldJob.collection_actual_date, "Old job already collected");
    assert(
      ["delivered", "awaiting_collection"].includes(oldJob.job_status),
      "Old job must be delivered / awaiting_collection"
    );

    const swapGroupId = crypto.randomUUID();
    const driverRunGroup = await getNextDriverRunGroup(supabase, subscriberId, swapDate);

    const { error: updErr } = await supabase
      .from("jobs")
      .update({
        collection_date: swapDate,
        job_status: "awaiting_collection",
        swap_group_id: swapGroupId,
        swap_role: "collect",
        driver_run_group: driverRunGroup,
        weekend_override: weekendOverride,
      })
      .eq("id", oldJob.id)
      .eq("subscriber_id", subscriberId);

    if (updErr) {
      console.error("Failed to update old job for swap:", updErr);
      throw new Error("Failed to update old job for swap");
    }

    const newJobInsertPayload = {
      subscriber_id: subscriberId,
      customer_id: oldJob.customer_id,
      skip_type_id: newSkipTypeId,

      site_name: oldJob.site_name || null,
      site_address_line1: oldJob.site_address_line1 || null,
      site_address_line2: oldJob.site_address_line2 || null,
      site_town: oldJob.site_town || null,
      site_postcode: oldJob.site_postcode || null,
      site_lat: oldJob.site_lat || null,
      site_lng: oldJob.site_lng || null,

      scheduled_date: swapDate,
      notes: body.notes ? String(body.notes) : "Swap delivery booked",
      payment_type: body.payment_type ? String(body.payment_type) : oldJob.payment_type || "card",
      price_inc_vat: priceIncVat,

      assigned_driver_id: oldJob.assigned_driver_id || null,

      swap_group_id: swapGroupId,
      swap_role: "deliver",
      driver_run_group: driverRunGroup,
      weekend_override: weekendOverride,
    };

    let newJob = null;

    if (!creditOverride) {
      const { data, error: insErr } = await supabase
        .from("jobs")
        .insert([newJobInsertPayload])
        .select(`
          id,
          job_number,
          customer_id,
          skip_type_id,
          scheduled_date,
          price_inc_vat,
          payment_type,
          swap_group_id,
          swap_role,
          driver_run_group,
          assigned_driver_id,
          weekend_override,
          site_lat,
          site_lng,
          xero_invoice_id,
          xero_invoice_number,
          xero_invoice_status
        `)
        .single();

      if (insErr) {
        console.error("Failed to create new delivery job:", insErr);
        throw new Error(insErr?.message || "Failed to create new delivery job");
      }

      newJob = data;
    } else {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("insert_job_bypass_credit_limit", {
        _payload: newJobInsertPayload,
      });

      if (rpcErr) {
        console.error("insert_job_bypass_credit_limit error:", rpcErr);
        throw new Error(rpcErr?.message || "Failed to create new delivery job (override)");
      }

      newJob = Array.isArray(rpcData) ? rpcData[0] : rpcData;

      if (!newJob?.id) {
        throw new Error("Failed to create new delivery job (override) — no job returned");
      }
    }

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

    let invoice = null;
    let invoice_warning = null;

    if (createInvoice) {
      try {
        const inv = await createInvoiceForJob({
          subscriberId,
          jobId: newJob.id,
        });

        invoice = {
          status: 200,
          json: {
            ok: true,
            ...inv,
            mode: inv?.mode || "auto",
          },
        };

        newJob.xero_invoice_id = inv?.invoiceId || newJob.xero_invoice_id || null;
        newJob.xero_invoice_number = inv?.invoiceNumber || newJob.xero_invoice_number || null;
        newJob.xero_invoice_status = inv?.status || newJob.xero_invoice_status || null;
      } catch (e) {
        console.error("Swap invoice creation failed:", e);
        invoice = {
          status: 500,
          json: {
            ok: false,
            error: "Invoice failed",
            details: String(e?.message || e),
          },
        };
        invoice_warning = String(e?.message || "Xero invoice creation failed");
      }
    }

    return res.json({
      ok: true,
      swap_group_id: swapGroupId,
      driver_run_group: driverRunGroup,
      new_job: newJob,
      create_invoice: createInvoice,
      weekend_override: weekendOverride,
      credit_override: creditOverride,
      credit_override_token: creditOverride ? creditOverrideToken : null,
      invoice,
      invoice_warning,
    });
  } catch (e) {
    console.error("book-swap unexpected error:", e);
    return res.status(400).json({
      ok: false,
      error: e?.message || "Unknown error",
    });
  }
}
