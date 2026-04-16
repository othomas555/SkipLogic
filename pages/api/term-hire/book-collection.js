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

async function getCollectionContext(supabase, action) {
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
    .select("id, first_name, last_name, company_name, email, term_hire_exempt, term_hire_days_override")
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

  return { job, customer, settings, hireEndDate };
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
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const token = asText(req.body?.token);
    const requestedDate = asText(req.body?.requested_date);
    const mode = asText(req.body?.mode) || "next_available";

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
    if (!action) {
      return res.status(400).json({ ok: false, error: "Invalid or expired link" });
    }

    if (action.action_type !== "book_collection") {
      return res.status(400).json({ ok: false, error: "Invalid action type" });
    }

    const { job, customer, hireEndDate } = await getCollectionContext(supabase, action);

    if (job.collection_actual_date) {
      return res.status(400).json({ ok: false, error: "This skip has already been collected" });
    }

    if (String(job.job_status || "").toLowerCase() === "cancelled" || job.cancelled_at) {
      return res.status(400).json({ ok: false, error: "This job is cancelled" });
    }

    if (job.collection_date) {
      return res.status(200).json({
        ok: true,
        already_booked: true,
        collection_date: job.collection_date,
      });
    }

    if (!isYmd(hireEndDate)) {
      return res.status(400).json({ ok: false, error: "Could not work out the current hire end date" });
    }

    const bankHolidaySet = await getBankHolidaySet();
    const today = todayYmd();
    const nextAvailable = await nextAvailableBusinessDay(today, bankHolidaySet);

    let collectionDate = null;

    if (mode === "choose_date") {
      if (!isYmd(requestedDate)) {
        return res.status(400).json({ ok: false, error: "Please choose a valid date" });
      }
      if (requestedDate < nextAvailable) {
        return res.status(400).json({
          ok: false,
          error: `Chosen date must be on or after ${nextAvailable}`,
        });
      }
      if (isWeekend(requestedDate)) {
        return res.status(400).json({ ok: false, error: "Weekends cannot be chosen" });
      }
      if (bankHolidaySet.has(requestedDate)) {
        return res.status(400).json({ ok: false, error: "Bank holidays cannot be chosen" });
      }
      if (requestedDate > hireEndDate) {
        return res.status(400).json({
          ok: false,
          error: "That date is beyond the current hire period. Extend the hire first to choose a later collection date.",
        });
      }
      collectionDate = requestedDate;
    } else {
      if (nextAvailable > hireEndDate) {
        return res.status(400).json({
          ok: false,
          error: "The next available collection day is beyond the current hire period. Extend the hire first or contact the office.",
        });
      }
      collectionDate = nextAvailable;
    }

    const { error: updateErr } = await supabase
      .from("jobs")
      .update({
        collection_date: collectionDate,
        term_hire_suppressed: true,
        term_hire_suppressed_at: new Date().toISOString(),
        term_hire_suppressed_reason: "customer_booked_collection",
        term_hire_status: "collection_requested",
        term_hire_auto_collection_due: false,
        term_hire_extension_pending: false,
        term_hire_extension_pending_at: null,
        last_edited_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("subscriber_id", job.subscriber_id);

    if (updateErr) throw updateErr;

    await supabase
      .from("term_hire_actions")
      .update({
        status: "used",
        used_at: new Date().toISOString(),
      })
      .eq("id", action.id);

    await supabase.from("term_hire_events").insert({
      subscriber_id: job.subscriber_id,
      job_id: job.id,
      customer_id: customer?.id || job.customer_id || null,
      channel: "web",
      event_type: "collection_booked",
      template_key: null,
      recipient: customer?.email || null,
      metadata: {
        collection_date: collectionDate,
        mode,
        hire_end_date: hireEndDate,
      },
    });

    return res.status(200).json({
      ok: true,
      collection_date: collectionDate,
      hire_end_date: hireEndDate,
      next_available: nextAvailable,
    });
  } catch (err) {
    console.error("term-hire/book-collection error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to book collection",
    });
  }
}
