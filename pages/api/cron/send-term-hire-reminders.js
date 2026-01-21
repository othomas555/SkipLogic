// pages/api/cron/send-term-hire-reminders.js
import { createClient } from "@supabase/supabase-js";

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

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function ymdTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysYMD(ymd, days) {
  const dt = new Date(`${ymd}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
}

function cmpYMD(a, b) {
  // YMD strings compare lexicographically when in YYYY-MM-DD format
  if (a === b) return 0;
  return a < b ? -1 : 1;
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

function buildEmailHtml({
  customerName,
  jobNumber,
  sitePostcode,
  deliveredYmd,
  termEndYmd,
  daysTotal,
}) {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111">
    <h2 style="margin:0 0 10px;">Skip hire reminder</h2>
    <p style="margin:0 0 12px;">Hi ${escapeHtml(customerName || "there")},</p>
    <p style="margin:0 0 12px;">
      This is a friendly reminder that your skip hire is approaching the end of its agreed period.
    </p>

    <div style="padding:12px;border:1px solid #eee;border-radius:10px;background:#fafafa;margin:0 0 12px;">
      <div><b>Job:</b> ${escapeHtml(jobNumber)}</div>
      <div><b>Site postcode:</b> ${escapeHtml(sitePostcode)}</div>
      <div><b>Delivered:</b> ${escapeHtml(deliveredYmd)}</div>
      <div><b>Hire term:</b> ${escapeHtml(String(daysTotal))} days</div>
      <div><b>Term ends:</b> ${escapeHtml(termEndYmd)}</div>
    </div>

    <p style="margin:0 0 12px;">
      Please reply to this email (or contact us) to book collection, or if you need to extend the hire.
    </p>

    <p style="margin:0;color:#666;font-size:12px;">(Automated reminder)</p>
  </div>`;
}

async function sendSendGridEmail({ to, subject, html }) {
  const key = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!key) return { ok: false, reason: "Missing SENDGRID_API_KEY" };
  if (!fromEmail) return { ok: false, reason: "Missing SENDGRID_FROM_EMAIL" };

  // SAFETY OVERRIDE:
  // If SENDGRID_TO_EMAIL is set, we send ALL emails to that address (useful for testing).
  const overrideTo = String(process.env.SENDGRID_TO_EMAIL || "").trim();
  const finalTo = overrideTo || to;

  const payload = {
    personalizations: [{ to: [{ email: finalTo }] }],
    from: { email: fromEmail },
    subject,
    content: [{ type: "text/html", value: html }],
  };

  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (resp.status >= 200 && resp.status < 300) {
    return { ok: true, overridden: !!overrideTo, to: finalTo };
  }

  const text = await resp.text().catch(() => "");
  return { ok: false, reason: `SendGrid error ${resp.status}`, body: text };
}

export default async function handler(req, res) {
  try {
    if (!["GET", "POST"].includes(req.method)) {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = requireCronAuth(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.message });

    const supabase = getSupabaseAdminClient();
    const today = ymdTodayUTC();

    // Defaults (no subscriber-level settings read here):
    const DEFAULT_TERM_DAYS = 14;
    const DEFAULT_REMINDER_DAYS_BEFORE = 4;

    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(
        `
        id,
        subscriber_id,
        customer_id,
        job_number,
        site_postcode,
        delivery_actual_date,
        collection_actual_date,
        hire_extension_days,
        customers:customer_id (
          first_name,
          last_name,
          company_name,
          email,
          term_hire_exempt,
          term_hire_days_override
        )
      `
      )
      .is("collection_actual_date", null)
      .not("delivery_actual_date", "is", null);

    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false, error: error.message || "Query failed" });
    }

    let considered = 0;
    let eligible = 0;
    let sent = 0;
    let skippedExempt = 0;
    let skippedNoEmail = 0;
    let skippedNotDue = 0;
    let skippedAlreadySent = 0;
    let failed = 0;

    const details = [];

    for (const j of jobs || []) {
      considered++;

      const cust = j.customers || {};

      if (cust.term_hire_exempt) {
        skippedExempt++;
        details.push({
          job_id: j.id,
          ok: false,
          skipped: "exempt",
          job_number: j.job_number || null,
        });
        continue;
      }

      const to = String(cust.email || "").trim();
      if (!to) {
        skippedNoEmail++;
        details.push({
          job_id: j.id,
          ok: false,
          skipped: "no_email",
          job_number: j.job_number || null,
        });
        continue;
      }

      const delivered = j.delivery_actual_date;
      if (!delivered) {
        skippedNotDue++;
        details.push({
          job_id: j.id,
          ok: false,
          skipped: "no_delivery_date",
          job_number: j.job_number || null,
        });
        continue;
      }

      const baseTermDays =
        cust.term_hire_days_override != null
          ? clampInt(cust.term_hire_days_override, 1, 365)
          : DEFAULT_TERM_DAYS;

      const extDays = clampInt(j.hire_extension_days ?? 0, 0, 3650);
      const totalDays = baseTermDays + extDays;

      const reminderBefore = DEFAULT_REMINDER_DAYS_BEFORE;

      // Reminder is scheduled for the "reminder day" (e.g. day 10 of 14)
      const reminderDate = addDaysYMD(delivered, Math.max(0, totalDays - reminderBefore));
      const termEnd = addDaysYMD(delivered, totalDays);

      // NEW BEHAVIOUR:
      // If we missed the exact day, still send ONCE when overdue.
      // Eligible if reminderDate <= today.
      if (cmpYMD(reminderDate, today) === 1) {
        skippedNotDue++;
        details.push({
          job_id: j.id,
          ok: false,
          skipped: "not_due",
          job_number: j.job_number || null,
          delivered,
          reminder_date: reminderDate,
          today,
          due_in_days_hint: "reminder_date > today",
        });
        continue;
      }

      eligible++;

      // Deduplicate using term_hire_reminder_log (log is keyed by the scheduled reminderDate)
      const { data: existing, error: logErr } = await supabase
        .from("term_hire_reminder_log")
        .select("id")
        .eq("subscriber_id", j.subscriber_id)
        .eq("job_id", j.id)
        .eq("reminder_date", reminderDate)
        .limit(1);

      if (logErr) {
        failed++;
        details.push({
          job_id: j.id,
          ok: false,
          stage: "log_lookup",
          error: logErr.message,
          delivered,
          reminder_date: reminderDate,
          today,
        });
        continue;
      }

      if (existing && existing.length) {
        skippedAlreadySent++;
        details.push({
          job_id: j.id,
          ok: false,
          skipped: "already_sent",
          job_number: j.job_number || null,
          delivered,
          reminder_date: reminderDate,
          today,
        });
        continue;
      }

      const name =
        cust.company_name ||
        `${cust.first_name || ""} ${cust.last_name || ""}`.trim() ||
        "there";

      const subject = "Skip hire reminder – please book collection";
      const html = buildEmailHtml({
        customerName: name,
        jobNumber: j.job_number || j.id,
        sitePostcode: j.site_postcode || "",
        deliveredYmd: delivered,
        termEndYmd: termEnd,
        daysTotal: totalDays,
      });

      const mail = await sendSendGridEmail({ to, subject, html });

      if (!mail.ok) {
        failed++;
        details.push({
          job_id: j.id,
          ok: false,
          stage: "send_email",
          reason: mail.reason,
          body: mail.body,
          delivered,
          reminder_date: reminderDate,
          today,
        });
        continue;
      }

      // Log it so we never send twice for the same reminder day
      const { error: insErr } = await supabase.from("term_hire_reminder_log").insert({
        subscriber_id: j.subscriber_id,
        job_id: j.id,
        reminder_date: reminderDate,
        sent_to: mail.to,
      });

      if (insErr) {
        // Email sent, but logging failed. Surface it.
        sent++;
        failed++;
        details.push({
          job_id: j.id,
          ok: true,
          stage: "sent_but_log_failed",
          error: insErr.message,
          to: mail.to,
          overridden: mail.overridden,
          delivered,
          reminder_date: reminderDate,
          today,
        });
        continue;
      }

      sent++;
      details.push({
        job_id: j.id,
        ok: true,
        to: mail.to,
        overridden: mail.overridden,
        delivered,
        reminder_date: reminderDate,
        term_end: termEnd,
        total_days: totalDays,
        reminder_days_before: reminderBefore,
        today,
      });
    }

    return res.status(200).json({
      ok: true,
      today,
      considered,
      eligible,
      sent,
      failed,
      skipped: {
        exempt: skippedExempt,
        no_email: skippedNoEmail,
        not_due: skippedNotDue,
        already_sent: skippedAlreadySent,
      },
      defaults: {
        term_days: DEFAULT_TERM_DAYS,
        reminder_days_before: DEFAULT_REMINDER_DAYS_BEFORE,
      },
      details,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
