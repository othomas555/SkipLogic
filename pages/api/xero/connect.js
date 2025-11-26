export default function handler(req, res) {
  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = "https://skip-logic.vercel.app/api/xero/callback";
  const scope = "offline_access accounting.transactions accounting.contacts";

  const url =
    "https://login.xero.com/identity/connect/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
    });

  res.redirect(url);
}
