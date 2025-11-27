// pages/api/xero_token_exchange.js
//
// Server-side token exchange for Xero OAuth.
// Called from /xero-connect with { code, redirectUri }.
// Uses server-side env vars so there is no CORS problem.

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { code, redirectUri } = req.body || {};

    if (!code || !redirectUri) {
      return res
        .status(400)
        .json({ error: "Missing code or redirectUri in body" });
    }

    if (!XERO_CLIENT_ID || !XERO_CLIENT_SECRET) {
      return res.status(500).json({
        error:
          "Missing XERO_CLIENT_ID or XERO_CLIENT_SECRET env vars on server",
      });
    }

    const basicAuth = Buffer.from(
      `${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`
    ).toString("base64");

    const body = new URLSearchParams();
    body.append("grant_type", "authorization_code");
    body.append("code", code);
    body.append("redirect_uri", redirectUri);

    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const json = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("Xero token exchange failed:", json);
      return res.status(tokenRes.status).json({
        error: "Token exchange failed",
        details: json,
      });
    }

    // Just proxy the JSON back to the browser
    return res.status(200).json(json);
  } catch (err) {
    console.error("Unexpected error in /api/xero_token_exchange:", err);
    return res.status(500).json({
      error: "Unexpected error",
      details: String(err),
    });
  }
}
