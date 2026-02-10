// pages/api/settings/emails/resend-domains.js
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

async function resendFetch(path, { method = "GET", body } = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  assert(apiKey, "Missing RESEND_API_KEY env var");

  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export default async function handler(req, res) {
  const supabaseAdmin = getSupabaseAdmin();
  const authz = await requireUser(req, supabaseAdmin);
  if (!authz.ok) return res.status(authz.status).json({ ok: false, error: authz.error });

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "");

    if (req.method === "POST" && action === "list") {
      const r = await resendFetch("/domains", { method: "GET" });
      if (!r.ok) return res.status(400).json({ ok: false, error: "Resend list failed", details: r.json });
      return res.status(200).json({ ok: true, data: r.json });
    }

    if (req.method === "POST" && action === "create") {
      const name = String(body.name || "").trim();
      assert(name, "Missing domain name");
      const r = await resendFetch("/domains", { method: "POST", body: { name } });
      if (!r.ok) return res.status(400).json({ ok: false, error: "Resend create failed", details: r.json });
      return res.status(200).json({ ok: true, data: r.json });
    }

    if (req.method === "POST" && action === "get") {
      const domain_id = String(body.domain_id || "").trim();
      assert(domain_id, "Missing domain_id");
      const r = await resendFetch(`/domains/${domain_id}`, { method: "GET" });
      if (!r.ok) return res.status(400).json({ ok: false, error: "Resend get failed", details: r.json });
      return res.status(200).json({ ok: true, data: r.json });
    }

    if (req.method === "POST" && action === "verify") {
      const domain_id = String(body.domain_id || "").trim();
      assert(domain_id, "Missing domain_id");
      const r = await resendFetch(`/domains/${domain_id}/verify`, { method: "POST" });
      if (!r.ok) return res.status(400).json({ ok: false, error: "Resend verify failed", details: r.json });
      return res.status(200).json({ ok: true, data: r.json });
    }

    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
}
