import { getSupabaseAdmin } from "./supabaseAdmin";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function ymdTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function siteAddress(job) {
  return [
    job?.site_name,
    job?.site_address_line1,
    job?.site_address_line2,
    job?.site_town,
    job?.site_postcode,
  ]
    .map(asText)
    .filter(Boolean)
    .join(", ");
}

function customerName(customer) {
  const person = `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim();
  return customer?.company_name || person || "Customer";
}

function customerAddress(customer) {
  return [
    customer?.billing_address_line1,
    customer?.billing_address_line2,
    customer?.billing_city,
    customer?.billing_region,
    customer?.billing_postcode,
    customer?.billing_country,
  ]
    .map(asText)
    .filter(Boolean)
    .join(", ");
}

function defaultSettings() {
  return {
    wtn_prefix: "WTN",
    company_name: "",
    company_address: "",
    waste_carrier_registration: "",
    environmental_permit_number: "",
    default_sic_code: "",
    default_ewc_code: "17 09 04",
    default_waste_description: "Mixed construction and demolition waste",
    default_container_type: "Skip",
    default_destination_site: "",
    declaration_text:
      "I confirm that the waste transfer described on this note is accurate and that the waste hierarchy has been considered.",
    footer_text: "",
  };
}

async function loadWtnSettings({ supabase, subscriberId }) {
  const { data, error } = await supabase
    .from("wtn_settings")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (error) throw error;
  return { ...defaultSettings(), ...(data || {}) };
}

async function getExistingWtn({ supabase, subscriberId, jobId }) {
  const { data, error } = await supabase
    .from("wtn_records")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function deriveSkipLabel(skipType) {
  if (!skipType) return "";

  return (
    asText(skipType.name) ||
    asText(skipType.label) ||
    asText(skipType.skip_name) ||
    asText(skipType.skip_size) ||
    asText(skipType.size_label) ||
    asText(skipType.description) ||
    ""
  );
}

function deriveQuantityDescription({ job, skipType }) {
  const skipLabel = deriveSkipLabel(skipType);

  if (skipLabel) return skipLabel;

  const yd =
    skipType?.yards ??
    skipType?.yard_size ??
    skipType?.size_yards ??
    skipType?.skip_yards ??
    null;

  const n = Number(yd);
  if (Number.isFinite(n) && n > 0) {
    return `${n} yard skip`;
  }

  return "One skip load";
}

export async function createWtnForJob({ subscriberId, jobId, transferDate = null }) {
  const supabase = getSupabaseAdmin();

  if (!subscriberId) throw new Error("subscriberId is required");
  if (!jobId) throw new Error("jobId is required");

  const existing = await getExistingWtn({ supabase, subscriberId, jobId });
  if (existing) {
    return {
      ok: true,
      mode: "existing",
      wtn: existing,
    };
  }

  const settings = await loadWtnSettings({ supabase, subscriberId });

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job) throw new Error("Job not found");

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("id", job.customer_id)
    .maybeSingle();

  if (customerErr) throw customerErr;

  let skipType = null;

  if (job.skip_type_id) {
    const { data: st, error: stErr } = await supabase
      .from("skip_types")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .eq("id", job.skip_type_id)
      .maybeSingle();

    if (stErr) {
      console.warn("WTN skip type lookup failed:", stErr.message);
    }

    skipType = st || null;
  }

  const { data: counter, error: counterErr } = await supabase.rpc("next_wtn_counter", {
    _subscriber_id: subscriberId,
  });

  if (counterErr) throw counterErr;

  const number = Number(counter || 1);
  const prefix = asText(settings.wtn_prefix) || "WTN";
  const wtnNumber = `${prefix}-${String(number).padStart(6, "0")}`;

  const collectionAddress = siteAddress(job);
  const quantityDescription = deriveQuantityDescription({ job, skipType });

  const payload = {
    subscriber_id: subscriberId,
    job_id: job.id,
    customer_id: job.customer_id || null,

    wtn_number: wtnNumber,
    transfer_date: transferDate || job.collection_actual_date || ymdTodayLocal(),

    waste_producer_name: customerName(customer),
    waste_producer_address: customerAddress(customer) || collectionAddress,
    collection_address: collectionAddress,

    carrier_name: asText(settings.company_name),
    carrier_address: asText(settings.company_address),
    waste_carrier_registration: asText(settings.waste_carrier_registration),
    environmental_permit_number: asText(settings.environmental_permit_number),

    sic_code: asText(settings.default_sic_code),
    ewc_code: asText(settings.default_ewc_code) || "17 09 04",
    waste_description:
      asText(settings.default_waste_description) || "Mixed construction and demolition waste",
    container_type: asText(settings.default_container_type) || "Skip",
    quantity_description: quantityDescription,
    destination_site: asText(settings.default_destination_site),

    driver_name: "",
    vehicle_registration: "",

    declaration_text: asText(settings.declaration_text),
    footer_text: asText(settings.footer_text),

    metadata: {
      job_number: job.job_number || null,
      site_postcode: job.site_postcode || null,
      skip_type_id: job.skip_type_id || null,
      skip_label: deriveSkipLabel(skipType) || null,
      payment_type: job.payment_type || null,
      price_inc_vat: job.price_inc_vat || null,
    },
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("wtn_records")
    .insert(payload)
    .select("*")
    .single();

  if (insertErr) {
    const again = await getExistingWtn({ supabase, subscriberId, jobId });
    if (again) {
      return {
        ok: true,
        mode: "existing_after_race",
        wtn: again,
      };
    }

    throw insertErr;
  }

  return {
    ok: true,
    mode: "created",
    wtn: inserted,
  };
}

export function buildWtnPublicUrl(wtnId) {
  const base = asText(process.env.NEXT_PUBLIC_APP_URL);
  if (!base) return `/api/wtn/${wtnId}`;
  return `${base.replace(/\/$/, "")}/api/wtn/${wtnId}`;
}
