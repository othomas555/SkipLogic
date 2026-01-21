// pages/api/cron/send-term-hire-reminders.js
import { createClient } from "@supabase/supabase-js";

function requireCronAuth(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: true };

  const viaHeader =
    req.headers["x-cron-secret"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  const viaQuery = req.query?.secret;

  if (viaHeader === secret || viaQuery === secret) return { ok: true };
  return { ok: false, message: "Unauthorized (missing/invalid CRON_SECRET)" };
}

function getSupabaseAdminClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_URL;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sendResendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "SkipLogic <no-reply@skiplogic.co.uk>";

  if (!key) return { ok: false, skipped: true, reason: "Missing RESEND_API_KEY" };

  let Resend;
  try {
    // Runtime require avoids build-time issues
    Resend = require("resend").Resend;
  } catch (e) {
    return { ok: false, skipped: true, reason: "Resend package not installed" };
  }

  try {
    const resend = new Resend(key);
    const resp = await resend.emails.send({ from, to, subject, html });
    return { ok: true, resp };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function ymdTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysYMD(ymd, days) {
  const dt = new Date(`${ymd}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
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
  <div style="font-family:system-ui;line-height:1.5">
    <h2>Skip hire reminder</h2>
    <p>Hi ${escapeHtml(customerName || "there")},</p>
    <p>Your skip hire is nearing the end of its agreed period.</p>
    <ul>
      <li><b>Job:</b> ${escapeHtml(jobNumber)}</li>
      <li><b>Postcode:</b> ${escapeHtml(sitePostcode)}</li>
      <li><b>Delivered:</b> ${escapeHtml(deliveredYmd)}</li>
      <li><b>Hire term:</b> ${escapeHtml(String(daysTotal))} days</li>
      <li><b>Ends:</b> ${escapeHtml(termEndYmd)}</li>
    </ul>
    <p>Please reply to arrange collection or request an extension.</p>
  </div>`;
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

    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(
        `
        id,
        subscriber_id,
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
        ),
        subscribers:subscriber_id (
          term_hire_days,
          term_hire_reminder_days_before
        )
      `
      )
      .is("collection_actual_date", null)
      .not("delivery_actual_date", "is", null);

    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false, error: error.message || "Query failed" });
    }

    let sent = 0;
    let skipped = 0;
    let skippedNoEmail = 0;
    let skippedExempt = 0;
    let skippedNotDue = 0;
    let failed = 0;

    for (const j of jobs || []) {
      const cust = j.customers || {};
      const sub = j.subscribers || {};

      if (cust.term_hire_exempt) {
        skippedExempt++;
        continue;
      }

      const email = String(cust.email || "").trim();
      if (!email) {
        skippedNoEmail++;
        continue;
      }

      const delivered = j.delivery_actual_date;
      if (!delivered) {
        skippedNotDue++;
        continue;
      }

      const baseDays =
        cust.term_hire_days_override != null
          ? clampInt(cust.term_hire_days_override, 1, 365)
          : clampInt(sub.term_hire_days ?? 14, 1, 365);

      const extDays = clampInt(j.hire_extension_days ?? 0, 0, 3650);
      const totalDays = baseDays + extDays;

      const reminderBefore = clampInt(sub.term_hire_reminder_days_before ?? 4, 0, 365);
      const reminderDate = addDaysYMD(delivered, Math.max(0, totalDays - reminderBefore));

      if (reminderDate !== today) {
        skippedNotDue++;
        continue;
      }

      const termEnd = addDaysYMD(delivered, totalDays);

      const name =
        cust.company_name ||
        `${cust.first_name || ""} ${cust.last_name || ""}`.trim() ||
        "there";

      const result = await sendResendEmail({
        to: email,
        subject: "Skip hire reminder – please book collection",
        html: buildEmailHtml({
          customerName: name,
          jobNumber: j.job_number || j.id,
          sitePostcode: j.site_postcode || "",
          deliveredYmd: delivered,
          termEndYmd: termEnd,
          daysTotal: totalDays,
        }),
      });

      if (result.ok) {
        sent++;
      } else {
        failed++;
        skipped++;
      }
    }

    return res.json({
      ok: true,
      today,
      sent,
      failed,
      skipped,
      skipped_breakdown: {
        exempt: skippedExempt,
        no_email: skippedNoEmail,
        not_due: skippedNotDue,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
