// pages/api/cron/send-term-hire-reminders.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function requireCronAuth(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: true }; // allow if you haven't set one yet

  const viaHeader =
    req.headers["x-cron-secret"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  const viaQuery = req.query?.secret;

  if (viaHeader === secret || viaQuery === secret) return { ok: true };
  return { ok: false, message: "Unauthorized (missing/invalid CRON_SECRET)" };
}

async function sendResendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "SkipLogic <no-reply@skiplogic.co.uk>";

  if (!key) return { ok: false, skipped: true, reason: "Missing RESEND_API_KEY" };

  const mod = await import("resend").catch(() => null);
  const Resend = mod?.Resend;
  if (!Resend) return { ok: false, skipped: true, reason: "Resend SDK not available" };

  const resend = new Resend(key);

  try {
    const resp = await resend.emails.send({ from, to, subject, html });
    return { ok: true, resp };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function ymdTodayUTC() {
  // Keep it simple and stable for cron: use UTC date.
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysYMD(ymd, days) {
  // ymd is "YYYY-MM-DD"
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtUKDate(ymd) {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).split("-").map((x) => Number(x));
  if (!y || !m || !d) return String(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(dt);
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildEmailHtml({ customerName, jobNumber, sitePostcode, deliveredYmd, termEndYmd, daysTotal }) {
  const safeName = escapeHtml(customerName || "there");
  const safeJob = escapeHtml(jobNumber || "—");
  const safePc = escapeHtml(sitePostcode || "—");

  return `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height:1.5; color:#111;">
    <h2 style="margin:0 0 10px;">Skip hire reminder</h2>
    <p style="margin:0 0 12px;">Hi ${safeName},</p>
    <p style="margin:0 0 12px;">
      This is a friendly reminder that your skip hire is approaching the end of its agreed period.
    </p>

    <div style="padding:12px; border:1px solid #eee; border-radius:10px; background:#fafafa; margin:0 0 12px;">
      <div><b>Job:</b> ${safeJob}</div>
      <div><b>Site postcode:</b> ${safePc}</div>
      <div><b>Delivered:</b> ${escapeHtml(fmtUKDate(deliveredYmd))}</div>
      <div><b>Hire term:</b> ${escapeHtml(String(daysTotal))} days</div>
      <div><b>Term ends:</b> ${escapeHtml(fmtUKDate(termEndYmd))}</div>
    </div>

    <p style="margin:0 0 12px;">
      Please reply to this email (or contact us) to book collection, or if you need to extend the hire.
    </p>

    <p style="margin:0; color:#666; font-size:12px;">
      (Automated reminder from SkipLogic)
    </p>
  </div>
  `;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth = requireCronAuth(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: auth.message });

  const supabaseAdmin = getSupabaseAdmin();

  const today = ymdTodayUTC();

  // Pull all jobs that are delivered and not collected.
  // Then join customers + subscribers so we can compute term rules.
  const { data: rows, error } = await supabaseAdmin
    .from("jobs")
    .select(`
      id,
      subscriber_id,
      customer_id,
      job_number,
      site_postcode,
      delivery_actual_date,
      collection_actual_date,
      hire_extension_days,
      customers:customer_id (
        id,
        first_name,
        last_name,
        company_name,
        email,
        term_hire_exempt,
        term_hire_days_override
      ),
      subscribers:subscriber_id (
        id,
        term_hire_days,
        term_hire_reminder_days_before
      )
    `)
    .is("collection_actual_date", null)
    .not("delivery_actual_date", "is", null);

  if (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message || "Query failed" });
  }

  const candidates = Array.isArray(rows) ? rows : [];

  let considered = 0;
  let eligible = 0;
  let sent = 0;
  let skippedNoEmail = 0;
  let skippedExempt = 0;
  let skippedNotDue = 0;
  let skippedAlreadySent = 0;
  let failed = 0;

  const details = [];

  for (const r of candidates) {
    considered++;

    const subscriber = r.subscribers || {};
    const cust = r.customers || {};

    const isExempt = !!cust.term_hire_exempt;
    if (isExempt) {
      skippedExempt++;
      continue;
    }

    const to = String(cust.email || "").trim();
    if (!to) {
      skippedNoEmail++;
      continue;
    }

    const deliveredYmd = r.delivery_actual_date; // date column -> "YYYY-MM-DD"
    if (!deliveredYmd) {
      skippedNotDue++;
      continue;
    }

    const baseTermDays = cust.term_hire_days_override != null
      ? clampInt(cust.term_hire_days_override, 1, 365)
      : clampInt(subscriber.term_hire_days ?? 14, 1, 365);

    const extensionDays = clampInt(r.hire_extension_days ?? 0, 0, 3650);
    const totalTermDays = baseTermDays + extensionDays;

    const reminderDaysBefore = clampInt(subscriber.term_hire_reminder_days_before ?? 4, 0, 365);
    const reminderOffset = Math.max(0, totalTermDays - reminderDaysBefore); // day number after delivery

    const reminderDate = addDaysYMD(deliveredYmd, reminderOffset);
    if (reminderDate !== today) {
      skippedNotDue++;
      continue;
    }

    eligible++;

    // Deduplicate: check log table first
    const { data: existing, error: logErr } = await supabaseAdmin
      .from("term_hire_reminder_log")
      .select("id")
      .eq("subscriber_id", r.subscriber_id)
      .eq("job_id", r.id)
      .eq("reminder_date", reminderDate)
      .limit(1);

    if (logErr) {
      console.error("Log lookup error", logErr);
      failed++;
      details.push({ job_id: r.id, ok: false, stage: "log_lookup", error: logErr.message || String(logErr) });
      continue;
    }

    if (existing && existing.length) {
      skippedAlreadySent++;
      continue;
    }

    const termEnd = addDaysYMD(deliveredYmd, totalTermDays);

    const customerName =
      (cust.company_name || "") ||
      `${cust.first_name || ""} ${cust.last_name || ""}`.trim() ||
      "there";

    const subject = `Skip hire reminder – please book collection`;
    const html = buildEmailHtml({
      customerName,
      jobNumber: r.job_number || r.id,
      sitePostcode: r.site_postcode || "",
      deliveredYmd,
      termEndYmd: termEnd,
      daysTotal: totalTermDays,
    });

    const emailResp = await sendResendEmail({ to, subject, html });

    if (!emailResp.ok) {
      console.error("Email send failed", emailResp);
      failed++;
      details.push({
        job_id: r.id,
        ok: false,
        stage: "send_email",
        reason: emailResp.reason || null,
        error: emailResp.error ? String(emailResp.error?.message || emailResp.error) : null,
      });
      continue;
    }

    // Insert log row
    const { error: insErr } = await supabaseAdmin
      .from("term_hire_reminder_log")
      .insert({
        subscriber_id: r.subscriber_id,
        job_id: r.id,
        reminder_date: reminderDate,
        sent_to: to,
      });

    if (insErr) {
      console.error("Log insert failed", insErr);
      // Email already sent; we still count it as sent, but surface the issue.
      failed++;
      sent++;
      details.push({ job_id: r.id, ok: true, stage: "sent_but_log_failed", error: insErr.message || String(insErr) });
      continue;
    }

    sent++;
    details.push({ job_id: r.id, ok: true, to, reminder_date: reminderDate });
  }

  return res.status(200).json({
    ok: true,
    today,
    considered,
    eligible,
    sent,
    skipped: {
      exempt: skippedExempt,
      no_email: skippedNoEmail,
      not_due: skippedNotDue,
      already_sent: skippedAlreadySent,
    },
    failed,
    details,
  });
}
