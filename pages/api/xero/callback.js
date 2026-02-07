// pages/api/xero/callback.js
import { exchangeCodeForToken, fetchTenantId, saveXeroConnection } from "../../../lib/xeroOAuth";
import { getUserFromSession } from "../../../lib/auth"; // <-- same note as connect.js

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/api/xero; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  // Office auth required
  const auth = await getUserFromSession(req);
  if (!auth?.ok) return res.status(401).send("Not signed in");

  const subscriberId = auth.subscriber_id || auth.subscriberId;
  if (!subscriberId) return res.status(400).send("Missing subscriber id");

  const code = typeof req.query?.code === "string" ? req.query.code : "";
  const state = typeof req.query?.state === "string" ? req.query.state : "";
  if (!code) return res.status(400).send("Missing code");
  if (!state) return res.status(400).send("Missing state");

  const cookies = parseCookies(req);
  const expectedState = cookies.xero_oauth_state || "";
  const verifier = cookies.xero_oauth_verifier || "";

  if (!expectedState || !verifier) {
    return res.status(400).send("Missing OAuth verifier (try connect again)");
  }
  if (state !== expectedState) {
    return res.status(400).send("State mismatch (try connect again)");
  }

  try {
    const tok = await exchangeCodeForToken({ code, codeVerifier: verifier });
    const tenantId = await fetchTenantId(tok.access_token);

    const expiresAtIso = new Date(Date.now() + tok.expires_in * 1000).toISOString();

    await saveXeroConnection({
      subscriberId,
      tenantId,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAtIso,
    });

    // clear oauth cookies
    clearCookie(res, "xero_oauth_state");
    clearCookie(res, "xero_oauth_verifier");

    // redirect back to settings page (adjust if you have one)
    res.redirect("/app/settings?xero=connected");
  } catch (e) {
    console.error("xero/callback failed", e);
    clearCookie(res, "xero_oauth_state");
    clearCookie(res, "xero_oauth_verifier");
    res.status(500).send(e?.message || "Xero connection failed");
  }
}
