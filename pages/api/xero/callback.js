import { supabase } from "../../../lib/supabaseClient";

export default async function handler(req, res) {
  const code = req.query.code;
  const subscriberId = req.cookies["sb-subscriber-id"]; // how we track subscriber

  if (!code) {
    return res.status(400).send("Missing code");
  }

  const redirectUri = "https://skip-logic.vercel.app/api/xero/callback";

  // STEP 1: Exchange code for tokens
  const tokenResp = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.XERO_CLIENT_ID + ":" + process.env.XERO_CLIENT_SECRET
        ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenJson = await tokenResp.json();

  if (!tokenResp.ok) {
    return res.status(500).send("Token exchange failed: " + JSON.stringify(tokenJson));
  }

  const refreshToken = tokenJson.refresh_token;
  const accessToken = tokenJson.access_token;

  // STEP 2: Get tenant ID
  const connectionsResp = await fetch("https://api.xero.com/connections", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const connections = await connectionsResp.json();
  const tenantId = connections[0].tenantId;

  // STEP 3: Store tokens in subscriber
  const { error: updateError } = await supabase
    .from("subscribers")
    .update({
      xero_refresh_token: refreshToken,
      xero_access_token: accessToken,
      xero_tenant_id: tenantId,
      xero_connected_at: new Date().toISOString(),
    })
    .eq("id", subscriberId);

  if (updateError) {
    return res.status(500).send("Failed to store tokens.");
  }

  // STEP 4: Redirect back to settings page
  res.redirect("/app/settings?xero=connected");
}
