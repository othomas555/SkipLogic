import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireUser(req, supabaseAdmin) {
  const token = getBearer(req);
  if (!token) return { ok: false, status: 401, error: "Missing Authorization bearer token" };

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user?.id) return { ok: false, status: 401, error: "Invalid token" };

  const userId = userData.user.id;

  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("id, subscriber_id, is_active, email")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) return { ok: false, status: 500, error: profErr.message };
  if (!prof || prof.is_active === false) return { ok: false, status: 403, error: "Profile inactive" };
  if (!prof.subscriber_id) return { ok: false, status: 403, error: "Profile missing subscriber_id" };

  return { ok: true, user_id: userId, subscriber_id: prof.subscriber_id, user_email: prof.email };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function resendSend({ apiKey, from, to, subject, html, reply_to }) {
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
    }),
  });

  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabaseAdmin = getSupabaseAdmin();
  const authz = await requireUser(req, supabaseAdmin);
  if (!authz.ok) return res.status(authz.status).json({ ok: false, error: authz.error });

  try {
    const apiKey = process.env.RESEND_API_KEY;
    assert(apiKey, "Missing RESEND_API_KEY env var");

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const to_email = String(body.to_email || authz.user_email || "");
    assert(to_email, "Missing to_email (and profile.email is empty)");

    const subscriber_id = authz.subscriber_id;

    const { data: settings, error: sErr } = await supabaseAdmin
      .from("email_settings")
      .select("*")
      .eq("subscriber_id", subscriber_id)
      .maybeSingle();

    if (sErr) throw new Error(sErr.message);
    assert(settings, "Email settings missing");
    assert(settings.is_enabled, "Email sending is disabled in settings");
    assert(settings.from_email, "Missing from_email in settings");
    const fromName = settings.from_name || "SkipLogic";
    const from = `${fromName} <${settings.from_email}>`;

    const subject = "SkipLogic test email ✅";
    const html = `
      <p>This is a test email from SkipLogic.</p>
      <p>If you received this, your sender settings are working.</p>
    `;

    // log outbox as queued
    const { data: out, error: oErr } = await supabaseAdmin
      .from("email_outbox")
      .insert({
        subscriber_id,
        template_key: "test",
        to_email,
        subject_snapshot: subject,
        status: "queued",
        provider: "resend",
      })
      .select("id")
      .maybeSingle();

    if (oErr) throw new Error(oErr.message);

    const sendRes = await resendSend({
      apiKey,
      from,
      to: to_email,
      subject,
      html,
      reply_to: settings.reply_to || null,
    });

    if (!sendRes.ok) {
      await supabaseAdmin
        .from("email_outbox")
        .update({ status: "failed", error: JSON.stringify(sendRes.json || {}), sent_at: new Date().toISOString() })
        .eq("id", out.id);

      return res.status(400).json({ ok: false, error: "Resend send failed", details: sendRes.json });
    }

    const messageId = sendRes.json?.id || null;

    await supabaseAdmin
      .from("email_outbox")
      .update({ status: "sent", provider_message_id: messageId, sent_at: new Date().toISOString() })
      .eq("id", out.id);

    return res.status(200).json({ ok: true, message_id: messageId });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
}
