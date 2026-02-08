// pages/api/xero/connect.js
import { buildAuthorizeUrl, makeChallenge, makeVerifier } from "../../../lib/xeroOAuth";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function parseBearer(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  return h.slice(7);
}

function appendSetCookie(res, cookieStr) {
  const prev = res.getHeader("Set-Cookie");
  if (!prev) {
    res.setHeader("Set-Cookie", cookieStr);
    return;
  }
  if (Array.isArray(prev)) {
    res.setHeader("Set-Cookie", [...prev, cookieStr]);
    return;
  }
  res.setHeader("Set-Cookie", [prev, cookieStr]);
}

function makeCookie(name, value, opts = {}) {
  const parts = [];
  parts.push(`${name}=${encodeURIComponent(value)}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite || "None"}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();

    const token = parseBearer(req);
    if (!token) return res.status(401).json({ ok: false, error: "Missing bearer token" });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ ok: false, error: "Invalid session" });

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("subscriber_id")
      .eq("id", userData.user.id)
      .single();

    if (profErr || !profile?.subscriber_id) {
      return res.status(400).json({ ok: false, error: "Subscriber not found" });
    }

    const subscriberId = profile.subscriber_id;

    const state = `${subscriberId}:${Date.now()}`;
    const verifier = makeVerifier(64);
    const challenge = await makeChallenge(verifier);

    // IMPORTANT for cross-site OAuth:
    // - SameSite=None
    // - Secure
    // - Path=/
    // ALSO: must APPEND Set-Cookie, not overwrite
    appendSetCookie(
      res,
      makeCookie("xero_oauth_state", state, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 600,
        path: "/",
      })
    );

    appendSetCookie(
      res,
      makeCookie("xero_oauth_verifier", verifier, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 600,
        path: "/",
      })
    );

    const url = buildAuthorizeUrl({ state, codeChallenge: challenge });
    return res.json({ ok: true, url });
  } catch (e) {
    console.error("xero/connect failed", e);
    return res.status(500).json({ ok: false, error: e?.message || "Failed to start Xero connection" });
  }
}
