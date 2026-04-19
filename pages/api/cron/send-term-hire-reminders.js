import crypto from "crypto";
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

function diffDays(fromYmd, toYmd) {
  const a = new Date(`${fromYmd}T00:00:00Z`);
  const b = new Date(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function customerName(customer) {
  const company = asText(customer?.company_name);
  const first = asText(customer?.first_name);
  const last = asText(customer?.last_name);
  const person = [first, last].filter(Boolean).join(" ").trim();
  if (company && person) return `${company} – ${person}`;
  if (company) return company;
  if (person) return person;
  return "Customer";
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

function replaceMergeTags(input, vars) {
  let out = String(input || "");
  for (const [key, value] of Object.entries(vars || {})) {
    out = out.replaceAll(`{{${key}}}`, value == null ? "" : String(value));
  }
  return out;
}

function makePublicBaseUrl(req) {
  const envBase = asText(process.env.NEXT_PUBLIC_BASE_URL);
  if (envBase) return envBase.replace(/\/+$/, "");

  const proto =
    req.headers["x-forwarded-proto"] ||
    (process.env.NODE_ENV === "development" ? "http" : "https");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getTemplateKey(daysRemaining, settings) {
  const r1 = Number(settings?.term_hire_reminder_1_days_before ?? 4);
  const r2 = Number(settings?.term_hire_reminder_2_days_before ?? 2);
  const finalEnabled = !!settings?.term_hire_final_notice_enabled;

  if (daysRemaining === r1) return "term_hire_reminder_1";
  if (daysRemaining === r2) return "term_hire_reminder_2";
  if (daysRemaining === 0 && finalEnabled) return "term_hire_final_notice";
  return null;
}

async function hasEventForTemplateToday(supabase, subscriberId, jobId, templateKey, today) {
  const { data, error } = await supabase
    .from("term_hire_events")
    .select("id")
    .eq("subscriber_id", subscriberId)
    .eq("job_id", jobId)
    .eq("template_key", templateKey)
    .gte("created_at", `${today}T00:00:00.000Z`)
    .lt("created_at", `${today}T23:59:59.999Z`)
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function createActionToken(supabase, subscriberId, job, customerId, actionType) {
  const token = makeToken();
  const expiresAt = addDays(todayYmd(), 30);

  const payload = {
    subscriber_id: subscriberId,
    job_id: job.id,
    customer_id: customerId,
    action_type: actionType,
    token,
    status: "active",
    expires_at: expiresAt ? `${expiresAt}T23:59:59.000Z` : null,
    metadata: {
      job_number: job.job_number || null,
      action_type: actionType,
    },
  };

  const { error } = await supabase.from("term_hire_actions").insert(payload);
  if (error) throw error;

  return token;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const today = todayYmd();
    const baseUrl = makePublicBaseUrl(req);

    const { data: subscriberSettingsRows, error: settingsErr } = await supabase
      .from("email_settings")
      .select("*")
      .eq("is_enabled", true)
      .eq("term_hire_enabled", true)
      .eq("term_hire_email_enabled", true);

    if (settingsErr) throw settingsErr;

    let scanned = 0;
    let queued = 0;
    const debug = [];

    for (const settings of subscriberSettingsRows || []) {
      const subscriberId = settings.subscriber_id;

      const { data: templates, error: templatesErr } = await supabase
        .from("email_templates")
        .select("*")
        .eq("subscriber_id", subscriberId)
        .in("template_key", [
          "term_hire_reminder_1",
          "term_hire_reminder_2",
          "term_hire_final_notice",
        ]);

      if (templatesErr) throw templatesErr;

      const templateMap = Object.fromEntries(
        (Array.isArray(templates) ? templates : []).map((t) => [t.template_key, t])
      );

      const { data: jobs, error: jobsErr } = await supabase
        .from("jobs")
        .select("*")
        .eq("subscriber_id", subscriberId)
        .is("collection_actual_date", null)
        .is("cancelled_at", null);

      if (jobsErr) throw jobsErr;

      const customerIds = Array.from(
        new Set((jobs || []).map((j) => j.customer_id).filter(Boolean))
      );

      const skipTypeIds = Array.from(
        new Set((jobs || []).map((j) => j.skip_type_id).filter(Boolean))
      );

      let customerMap = {};
      let skipTypeMap = {};

      if (customerIds.length) {
        const { data: customers, error: customersErr } = await supabase
          .from("customers")
          .select(`
            id,
            first_name,
            last_name,
            company_name,
            email,
            term_hire_exempt,
            term_hire_days_override
          `)
          .in("id", customerIds)
          .eq("subscriber_id", subscriberId);

        if (customersErr) throw customersErr;

        customerMap = Object.fromEntries(
          (Array.isArray(customers) ? customers : []).map((c) => [c.id, c])
        );
      }

      if (skipTypeIds.length) {
        const { data: skipTypes, error: skipTypesErr } = await supabase
          .from("skip_types")
          .select("id, name")
          .in("id", skipTypeIds);

        if (skipTypesErr) throw skipTypesErr;

        skipTypeMap = Object.fromEntries(
          (Array.isArray(skipTypes) ? skipTypes : []).map((s) => [s.id, s])
        );
      }

      for (const job of jobs || []) {
        scanned += 1;

        const customer = customerMap[job.customer_id] || {};
        const skipType = skipTypeMap[job.skip_type_id] || {};
        const customerId = customer.id || job.customer_id || null;
        const email = asText(customer.email);

        if (!customerId || !email) continue;
        if (customer.term_hire_exempt === true) continue;
        if (job.term_hire_suppressed === true) continue;
        if (job.collection_date) continue;
        if (String(job.job_status || "").toLowerCase() === "cancelled") continue;

        const deliveryDate = job.delivery_actual_date || job.scheduled_date;
        if (!isYmd(deliveryDate)) continue;

        const defaultDays = Number(settings.term_hire_default_days || 14);
        const overrideDays =
          customer.term_hire_days_override == null
            ? null
            : Number(customer.term_hire_days_override);

        const hireDays =
          Number.isFinite(overrideDays) && overrideDays > 0 ? overrideDays : defaultDays;

        const currentHireEndDate =
          job.term_hire_extended_until || addDays(deliveryDate, hireDays);

        if (!isYmd(currentHireEndDate)) continue;

        const daysRemaining = diffDays(today, currentHireEndDate);
        if (daysRemaining == null) continue;
        if (daysRemaining < 0) continue;

        const templateKey = getTemplateKey(daysRemaining, settings);
        if (!templateKey) continue;

        const template = templateMap[templateKey];
        if (!template || !template.enabled) continue;

        const alreadyQueuedToday = await hasEventForTemplateToday(
          supabase,
          subscriberId,
          job.id,
          templateKey,
          today
        );
        if (alreadyQueuedToday) continue;

        const extendToken = await createActionToken(
          supabase,
          subscriberId,
          job,
          customerId,
          "extend"
        );
        const collectionToken = await createActionToken(
          supabase,
          subscriberId,
          job,
          customerId,
          "book_collection"
        );

        const mergeVars = {
          customer_name: customerName(customer),
          job_number: asText(job.job_number),
          skip_type: asText(skipType?.name),
          site_address: siteAddress(job),
          scheduled_date: asText(job.scheduled_date),
          collection_date: asText(job.collection_date),
          days_remaining: String(daysRemaining),
          hire_end_date: currentHireEndDate,
          extension_price: Number(settings.term_hire_extension_price_per_week || 0).toFixed(2),
          extend_url: `${baseUrl}/extend/${encodeURIComponent(job.id)}?token=${encodeURIComponent(
            extendToken
          )}`,
          collection_url: `${baseUrl}/collection/${encodeURIComponent(
            job.id
          )}?token=${encodeURIComponent(collectionToken)}`,
        };

        const renderedSubject = replaceMergeTags(template.subject || "", mergeVars);
        const renderedBody = replaceMergeTags(template.body_html || "", mergeVars);

        const { error: outboxErr } = await supabase.from("email_outbox").insert({
          subscriber_id: subscriberId,
          job_id: job.id,
          customer_id: customerId,
          template_key: templateKey,
          to_email: email,
          subject_snapshot: renderedSubject,
          status: "pending",
          provider: settings.provider || "resend",
          error: null,
          sent_at: null,
        });

        if (outboxErr) throw outboxErr;

        const { error: eventErr } = await supabase.from("term_hire_events").insert({
          subscriber_id: subscriberId,
          job_id: job.id,
          customer_id: customerId,
          channel: "email",
          event_type: "email_queued",
          template_key: templateKey,
          recipient: email,
          metadata: {
            subject: renderedSubject,
            body_html: renderedBody,
            hire_end_date: currentHireEndDate,
            days_remaining: daysRemaining,
          },
        });

        if (eventErr) throw eventErr;

        const { error: legacyLogErr } = await supabase.from("term_hire_reminder_log").insert({
          subscriber_id: subscriberId,
          job_id: job.id,
          reminder_date: today,
          sent_to: email,
        });

        if (legacyLogErr) throw legacyLogErr;

        const nextStatus =
          templateKey === "term_hire_reminder_1"
            ? "reminder_1_sent"
            : templateKey === "term_hire_reminder_2"
            ? "reminder_2_sent"
            : "final_notice_sent";

        const { error: jobUpdateErr } = await supabase
          .from("jobs")
          .update({
            term_hire_status: nextStatus,
            term_hire_last_reminder_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("subscriber_id", subscriberId);

        if (jobUpdateErr) throw jobUpdateErr;

        queued += 1;
        debug.push({
          subscriber_id: subscriberId,
          job_id: job.id,
          template_key: templateKey,
          to_email: email,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      scanned,
      queued,
      debug,
    });
  } catch (err) {
    console.error("send-term-hire-reminders error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to process term hire reminders",
    });
  }
}
