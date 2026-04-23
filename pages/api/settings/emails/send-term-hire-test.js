import crypto from "crypto";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { requireOfficeUser } from "../../../../lib/requireOfficeUser";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function asPositiveNumberOrNull(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
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
      source: "manual_test_send",
    },
  };

  const { error } = await supabase.from("term_hire_actions").insert(payload);
  if (error) throw error;

  return token;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await requireOfficeUser(req);
    if (!auth?.ok) {
      return res.status(401).json({ ok: false, error: auth?.error || "Unauthorized" });
    }

    const supabase = getSupabaseAdmin();
    const subscriberId = auth.subscriber_id;
    const officeEmail = asText(auth?.user?.email);

    const jobId = asText(req.body?.job_id);
    const templateKey = asText(req.body?.template_key);
    const toEmail = asText(req.body?.to_email) || officeEmail;
    const daysRemainingRaw = Number(req.body?.days_remaining);

    if (!jobId) {
      return res.status(400).json({ ok: false, error: "Missing job_id" });
    }

    if (!templateKey) {
      return res.status(400).json({ ok: false, error: "Missing template_key" });
    }

    if (!toEmail) {
      return res.status(400).json({ ok: false, error: "No target email address available" });
    }

    const allowedTemplates = new Set([
      "term_hire_reminder_1",
      "term_hire_reminder_2",
      "term_hire_final_notice",
    ]);

    if (!allowedTemplates.has(templateKey)) {
      return res.status(400).json({ ok: false, error: "Invalid test template" });
    }

    const { data: settings, error: settingsErr } = await supabase
      .from("email_settings")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (settingsErr) throw settingsErr;
    if (!settings) {
      return res.status(400).json({ ok: false, error: "Email settings not found" });
    }

    const { data: template, error: templateErr } = await supabase
      .from("email_templates")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .eq("template_key", templateKey)
      .maybeSingle();

    if (templateErr) throw templateErr;
    if (!template) {
      return res.status(400).json({ ok: false, error: "Template not found" });
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr) throw jobErr;
    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    const { data: customer, error: customerErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, company_name, email, term_hire_days_override")
      .eq("subscriber_id", subscriberId)
      .eq("id", job.customer_id)
      .maybeSingle();

    if (customerErr) throw customerErr;

    const { data: subscriberRow, error: subscriberErr } = await supabase
      .from("subscribers")
      .select("term_hire_days")
      .eq("id", subscriberId)
      .maybeSingle();

    if (subscriberErr) throw subscriberErr;

    let skipType = null;
    if (job.skip_type_id) {
      const { data: skipTypeRow, error: skipTypeErr } = await supabase
        .from("skip_types")
        .select("id, name")
        .eq("id", job.skip_type_id)
        .maybeSingle();

      if (skipTypeErr) throw skipTypeErr;
      skipType = skipTypeRow || null;
    }

    const deliveryDate = job.delivery_actual_date || job.scheduled_date;
    if (!isYmd(deliveryDate)) {
      return res.status(400).json({ ok: false, error: "Job has no valid delivery/scheduled date" });
    }

    const overrideDays = asPositiveNumberOrNull(customer?.term_hire_days_override);
    const subscriberTermHireDays = asPositiveNumberOrNull(subscriberRow?.term_hire_days);
    const settingsDefaultDays = asPositiveNumberOrNull(settings?.term_hire_default_days);

    const hireDays =
      overrideDays ??
      subscriberTermHireDays ??
      settingsDefaultDays ??
      14;

    const currentHireEndDate =
      asText(job.term_hire_end_date) ||
      asText(job.term_hire_extended_until) ||
      addDays(deliveryDate, hireDays);

    if (!isYmd(currentHireEndDate)) {
      return res.status(400).json({ ok: false, error: "Could not determine hire end date" });
    }

    const defaultDaysRemaining =
      templateKey === "term_hire_reminder_1"
        ? Number(settings?.term_hire_reminder_1_days_before ?? 4)
        : templateKey === "term_hire_reminder_2"
        ? Number(settings?.term_hire_reminder_2_days_before ?? 2)
        : 0;

    const daysRemaining = Number.isFinite(daysRemainingRaw)
      ? Math.max(0, Math.trunc(daysRemainingRaw))
      : defaultDaysRemaining;

    const extendToken = await createActionToken(
      supabase,
      subscriberId,
      job,
      customer?.id || job.customer_id || null,
      "extend"
    );

    const collectionToken = await createActionToken(
      supabase,
      subscriberId,
      job,
      customer?.id || job.customer_id || null,
      "book_collection"
    );

    const baseUrl = makePublicBaseUrl(req);

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
      customer_id: customer?.id || job.customer_id || null,
      template_key: templateKey,
      to_email: toEmail,
      subject_snapshot: `[TEST] ${renderedSubject}`,
      status: "pending",
      provider: settings.provider || "resend",
      error: null,
      sent_at: null,
    });

    if (outboxErr) throw outboxErr;

    const { error: eventErr } = await supabase.from("term_hire_events").insert({
      subscriber_id: subscriberId,
      job_id: job.id,
      customer_id: customer?.id || job.customer_id || null,
      channel: "email",
      event_type: "test_email_queued",
      template_key: templateKey,
      recipient: toEmail,
      metadata: {
        subject: `[TEST] ${renderedSubject}`,
        body_html: renderedBody,
        hire_end_date: currentHireEndDate,
        days_remaining: daysRemaining,
        is_test: true,
      },
    });

    if (eventErr) throw eventErr;

    return res.status(200).json({
      ok: true,
      to_email: toEmail,
      job_number: job.job_number || "",
      template_key: templateKey,
    });
  } catch (error) {
    console.error("send-term-hire-test error", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to queue test term-hire email",
    });
  }
}
