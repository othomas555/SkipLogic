import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function resendSend({ apiKey, from, to, subject, html, reply_to, bcc }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      reply_to: reply_to || undefined,
      bcc: bcc || undefined,
    }),
  });

  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

async function getRenderedEmailForOutbox(supabase, row) {
  const { data: eventRows, error: eventErr } = await supabase
    .from("term_hire_events")
    .select("*")
    .eq("subscriber_id", row.subscriber_id)
    .eq("job_id", row.job_id)
    .eq("template_key", row.template_key)
    .eq("recipient", row.to_email)
    .eq("channel", "email")
    .eq("event_type", "email_queued")
    .order("created_at", { ascending: false })
    .limit(1);

  if (eventErr) throw eventErr;

  const ev = Array.isArray(eventRows) && eventRows.length ? eventRows[0] : null;
  const subject = asText(ev?.metadata?.subject) || asText(row.subject_snapshot);
  const html =
    asText(ev?.metadata?.body_html) ||
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111"><p>${subject}</p></div>`;

  return { subject, html };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.RESEND_API_KEY;
    assert(apiKey, "Missing RESEND_API_KEY env var");

    const supabase = getSupabaseAdmin();

    const { data: rows, error: rowsErr } = await supabase
      .from("email_outbox")
      .select("*")
      .in("status", ["pending", "queued"])
      .order("created_at", { ascending: true })
      .limit(50);

    if (rowsErr) throw rowsErr;

    let sent = 0;
    let failed = 0;
    const debug = [];

    for (const row of rows || []) {
      try {
        const { data: settings, error: settingsErr } = await supabase
          .from("email_settings")
          .select("*")
          .eq("subscriber_id", row.subscriber_id)
          .maybeSingle();

        if (settingsErr) throw settingsErr;
        if (!settings || !settings.is_enabled) {
          throw new Error("Email settings missing or disabled");
        }
        if (!settings.from_email) {
          throw new Error("Missing from_email in email settings");
        }

        const fromName = settings.from_name || "SkipLogic";
        const from = `${fromName} <${settings.from_email}>`;
        const { subject, html } = await getRenderedEmailForOutbox(supabase, row);

        const sendRes = await resendSend({
          apiKey,
          from,
          to: row.to_email,
          subject,
          html,
          reply_to: settings.reply_to || null,
          bcc: settings.send_bcc ? settings.bcc_email || undefined : undefined,
        });

        if (!sendRes.ok) {
          await supabase
            .from("email_outbox")
            .update({
              status: "failed",
              error: JSON.stringify(sendRes.json || {}),
              sent_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          await supabase.from("term_hire_events").insert({
            subscriber_id: row.subscriber_id,
            job_id: row.job_id,
            customer_id: row.customer_id || null,
            channel: "email",
            event_type: "email_failed",
            template_key: row.template_key,
            recipient: row.to_email,
            metadata: {
              outbox_id: row.id,
              resend_status: sendRes.status,
              response: sendRes.json || {},
            },
          });

          failed += 1;
          debug.push({ id: row.id, status: "failed" });
          continue;
        }

        const providerMessageId = sendRes.json?.id || null;

        await supabase
          .from("email_outbox")
          .update({
            status: "sent",
            provider_message_id: providerMessageId,
            error: null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        await supabase.from("term_hire_events").insert({
          subscriber_id: row.subscriber_id,
          job_id: row.job_id,
          customer_id: row.customer_id || null,
          channel: "email",
          event_type: "email_sent",
          template_key: row.template_key,
          recipient: row.to_email,
          metadata: {
            outbox_id: row.id,
            provider_message_id: providerMessageId,
          },
        });

        sent += 1;
        debug.push({ id: row.id, status: "sent" });
      } catch (innerErr) {
        console.error("process-email-outbox row error", innerErr);

        await supabase
          .from("email_outbox")
          .update({
            status: "failed",
            error: innerErr?.message || "Send failed",
            sent_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        failed += 1;
        debug.push({ id: row.id, status: "failed", error: innerErr?.message || "Send failed" });
      }
    }

    return res.status(200).json({
      ok: true,
      processed: (rows || []).length,
      sent,
      failed,
      debug,
    });
  } catch (err) {
    console.error("process-email-outbox error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to process email outbox",
    });
  }
}
