import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isWeekend(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return false;
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

async function getBankHolidaySet() {
  const r = await fetch("https://www.gov.uk/bank-holidays.json");
  if (!r.ok) throw new Error(`Bank holiday fetch failed (${r.status})`);
  const json = await r.json();
  const events = Array.isArray(json?.["england-and-wales"]?.events)
    ? json["england-and-wales"].events
    : [];
  return new Set(
    events
      .map((e) => asText(e?.date))
      .filter((d) => isYmd(d))
  );
}

async function nextAvailableBusinessDay(fromYmd, bankHolidaySet) {
  let candidate = fromYmd;
  for (let i = 0; i < 40; i += 1) {
    candidate = addDays(candidate, 1);
    if (!candidate) break;
    if (isWeekend(candidate)) continue;
    if (bankHolidaySet.has(candidate)) continue;
    return candidate;
  }
  throw new Error("Could not find next available collection day");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const token = asText(req.query?.token);

    if (!token) {
      return res.status(400).json({ ok: false, error: "Missing token" });
    }

    const { data: action, error: actionErr } = await supabase
      .from("term_hire_actions")
      .select("*")
      .eq("token", token)
      .eq("status", "active")
      .maybeSingle();

    if (actionErr) throw actionErr;
    if (!action || action.action_type !== "book_collection") {
      return res.status(400).json({ ok: false, error: "Invalid or expired link" });
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", action.job_id)
      .eq("subscriber_id", action.subscriber_id)
      .maybeSingle();

    if (jobErr) throw jobErr;
    if (!job) throw new Error("Job not found");

    const { data: customer, error: customerErr } = await supabase
      .from("customers")
      .select("term_hire_days_override")
      .eq("id", job.customer_id)
      .eq("subscriber_id", job.subscriber_id)
      .maybeSingle();

    if (customerErr) throw customerErr;

    const { data: settings, error: settingsErr } = await supabase
      .from("email_settings")
      .select("term_hire_default_days")
      .eq("subscriber_id", job.subscriber_id)
      .maybeSingle();

    if (settingsErr) throw settingsErr;

    const deliveryDate = job.delivery_actual_date || job.scheduled_date;
    const overrideDays =
      customer?.term_hire_days_override == null
        ? null
        : Number(customer.term_hire_days_override);
    const baseDays =
      Number.isFinite(overrideDays) && overrideDays > 0
        ? overrideDays
        : Number(settings?.term_hire_default_days || 14);

    const hireEndDate =
      job.term_hire_extended_until ||
      (isYmd(deliveryDate) ? addDays(deliveryDate, baseDays) : null);

    if (!isYmd(hireEndDate)) {
      return res.status(400).json({ ok: false, error: "Could not work out the current hire end date" });
    }

    const bankHolidaySet = await getBankHolidaySet();
    const nextAvailable = await nextAvailableBusinessDay(todayYmd(), bankHolidaySet);

    return res.status(200).json({
      ok: true,
      job_id: job.id,
      job_number: job.job_number,
      hire_end_date: hireEndDate,
      next_available: nextAvailable,
      already_booked_collection_date: job.collection_date || null,
    });
  } catch (err) {
    console.error("term-hire/collection-options error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to load collection options",
    });
  }
}
