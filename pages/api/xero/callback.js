// pages/api/xero/callback.js
import { exchangeCodeForToken, fetchConnections, saveXeroConnection } from "../../../lib/xeroOAuth";

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v || "");
  });
  return out;
}

function clearCookieStr(name) {
  // Must match the cookie attributes used when setting:
  // SameSite=None; Secure; Path=/
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
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

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  const code = typeof req.query?.code === "string" ? req.query.code : "";
  const state = typeof req.query?.state === "string" ? req.query.state : "";

  if (!code || !state) {
    return res.status(400).send("Missing OAuth code or state");
  }

  const cookies = parseCookies(req);
  const expectedState = cookies.xero_oauth_state || "";
  const verifier = cookies.xero_oauth_verifier || "";

  if (!expectedState || !verifier) {
    return res.status(400).send("Missing OAuth verifier/state. Please reconnect from Settings.");
  }

  if (state !== expectedState) {
    return res.status(400).send("OAuth state mismatch. Please reconnect.");
  }

  const subscriberId = String(state).split(":")[0];
  if (!subscriberId) return res.status(400).send("Invalid OAuth state");

  try {
    const tok = await exchangeCodeForToken({ code, codeVerifier: verifier });
    const tenants = await fetchConnections(tok.access_token);

    const selectedTenantId = tenants.length === 1 ? tenants[0].tenantId : null;
    const expiresAtIso = new Date(Date.now() + tok.expires_in * 1000).toISOString();

    await saveXeroConnection({
      subscriberId,
      tenantId: selectedTenantId,
      tenants,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAtIso,
    });

    // Clear BOTH cookies (must APPEND Set-Cookie, not overwrite)
    appendSetCookie(res, clearCookieStr("xero_oauth_state"));
    appendSetCookie(res, clearCookieStr("xero_oauth_verifier"));

    if (!selectedTenantId && tenants.length > 1) {
      return res.redirect("/app/settings?xero=choose_org");
    }

    return res.redirect("/app/settings?xero=connected");
  } catch (e) {
    console.error("xero/callback failed", e);

    // Clear cookies even on failure
    appendSetCookie(res, clearCookieStr("xero_oauth_state"));
    appendSetCookie(res, clearCookieStr("xero_oauth_verifier"));

    return res.status(500).send(e?.message || "Xero connection failed");
  }
}
