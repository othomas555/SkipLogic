// pages/api/xero/connect.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { buildAuthorizeUrl, makeChallenge, makeVerifier } from "../../../lib/xeroOAuth";
import { getUserFromSession } from "../../../lib/auth"; // <-- if you already have office auth helper

function setCookie(res, name, value, opts = {}) {
  const parts = [];
  parts.push(`${name}=${encodeURIComponent(value)}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  res.setHeader("Set-Cookie", parts.join("; "));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  // Office auth required (Xero connection is an office action)
  // If your helper name differs, swap it here.
  const auth = await getUserFromSession(req);
  if (!auth?.ok) return res.status(401).send("Not signed in");

  const subscriberId = auth.subscriber_id || auth.subscriberId;
  if (!subscriberId) return res.status(400).send("Missing subscriber id");

  const state = `${subscriberId}:${Date.now()}`;
  const verifier = makeVerifier(64);
  const challenge = await makeChallenge(verifier);

  // Store verifier+state in HttpOnly cookie (10 mins)
  setCookie(res, "xero_oauth_state", state, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/api/xero" });
  setCookie(res, "xero_oauth_verifier", verifier, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/api/xero" });

  const url = buildAuthorizeUrl({ state, codeChallenge: challenge });
  res.redirect(url);
}
