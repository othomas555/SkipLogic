// pages/api/xero/callback.js
import {
  exchangeCodeForToken,
  fetchTenantId,
  saveXeroConnection,
} from "../../../lib/xeroOAuth";

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("="));
  });
  return out;
}

function clearCookie(res, name) {
  res.setHeader(
    "Set-Cookie",
    `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

export default async function handler(req, res) {
  const code = req.query.code;
  const state = req.query.state;

  const cookies = parseCookies(req);
  const expectedState = cookies.xero_oauth_state;
  const verifier = cookies.xero_oauth_verifier;

  if (!code || !state || !expectedState || !verifier) {
    return res.status(400).send("Missing OAuth state. Please reconnect Xero.");
  }

  if (state !== expectedState) {
    return res.status(400).send("OAuth state mismatch. Please reconnect Xero.");
  }

  try {
    const tok = await exchangeCodeForToken({ code, codeVerifier: verifier });
    const tenantId = await fetchTenantId(tok.access_token);

    await saveXeroConnection({
      subscriberId: state.split(":")[0],
      tenantId,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAtIso: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    });

    clearCookie(res, "xero_oauth_state");
    clearCookie(res, "xero_oauth_verifier");

    res.redirect("/app/settings?xero=connected");
  } catch (e) {
    console.error("Xero callback failed", e);
    clearCookie(res, "xero_oauth_state");
    clearCookie(res, "xero_oauth_verifier");
    res.status(500).send("Xero connection failed");
  }
}
