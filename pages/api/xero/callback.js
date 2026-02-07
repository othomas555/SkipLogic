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

function clearCookie(res, name) {
  // IMPORTANT: clear on Path "/"
  res.setHeader("Set-Cookie", `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  const code = typeof req.query?.code === "string" ? req.query.code : "";
  const state = typeof req.query?.state === "string" ? req.query.state : "";
  if (!code) return res.status(400).send("Missing code");
  if (!state) return res.status(400).send("Missing state");

  const cookies = parseCookies(req);
  const expectedState = cookies.xero_oauth_state || "";
  const verifier = cookies.xero_oauth_verifier || "";

  if (!expectedState || !verifier) {
    return res.status(400).send("Missing OAuth verifier/state. Please reconnect from Settings.");
  }
  if (state !== expectedState) {
    return res.status(400).send("OAuth state mismatch. Please reconnect from Settings.");
  }

  const subscriberId = String(state).split(":")[0];
  if (!subscriberId) return res.status(400).send("Bad state (missing subscriber)");

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

    clearCookie(res, "xero_oauth_state");
    clearCookie(res, "xero_oauth_verifier");

    if (!selectedTenantId && tenants.length > 1) {
      return res.redirect("/app/settings?xero=choose_org");
    }

    return res.redirect("/app/settings?xero=connected");
  } catch (e) {
    console.error("xero/callback failed", e);
    clearCookie(res, "xero_oauth_state");
    clearCookie(res, "xero_oauth_verifier");
    return res.status(500).send(e?.message || "Xero connection failed");
  }
}
