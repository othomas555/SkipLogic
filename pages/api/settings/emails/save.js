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
    .select("id, subscriber_id, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) return { ok: false, status: 500, error: profErr.message };
  if (!prof || prof.is_active === false) return { ok: false, status: 403, error: "Profile inactive" };
  if (!prof.subscriber_id) return { ok: false, status: 403, error: "Profile missing subscriber_id" };

  return { ok: true, user_id: userId, subscriber_id: prof.subscriber_id };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabaseAdmin = getSupabaseAdmin();
  const authz = await requireUser(req, supabaseAdmin);
  if (!authz.ok) return res.status(authz.status).json({ ok: false, error: authz.error });

  try {
    const subscriber_id = authz.subscriber_id;
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const settings = body.settings && typeof body.settings === "object" ? body.settings : null;
    const templates = Array.isArray(body.templates) ? body.templates : [];

    assert(settings, "Missing settings");

    // Upsert settings
    const updateSettings = {
      provider: "resend",
      is_enabled: !!settings.is_enabled,
      from_name: settings.from_name || null,
      from_email: settings.from_email || null,
      reply_to: settings.reply_to || null,
      send_bcc: !!settings.send_bcc,
      bcc_email: settings.bcc_email || null,
    };

    const { error: sErr } = await supabaseAdmin
      .from("email_settings")
      .upsert({ subscriber_id, ...updateSettings }, { onConflict: "subscriber_id" });

    if (sErr) throw new Error(sErr.message);

    // Upsert templates
    for (const t of templates) {
      const template_key = String(t.template_key || "");
      assert(template_key, "Template missing template_key");

      const row = {
        subscriber_id,
        template_key,
        enabled: !!t.enabled,
        subject: String(t.subject || ""),
        body_html: String(t.body_html || ""),
      };

      const { error: tErr } = await supabaseAdmin
        .from("email_templates")
        .upsert(row, { onConflict: "subscriber_id,template_key" });

      if (tErr) throw new Error(tErr.message);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
}
