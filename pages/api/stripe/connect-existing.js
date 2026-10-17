import { randomBytes, createHmac } from "crypto";
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });
    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    const secret = process.env.STRIPE_CONNECT_OAUTH_STATE_SECRET;
    if (!clientId || !secret || secret.length < 32) throw Error("Stripe OAuth is not configured");
    const db = getSupabaseAdmin();
    const { data: subscriber, error } = await db.from("subscribers").select("stripe_connect_account_id").eq("id", auth.subscriber_id).single();
    if (error) throw error;
    if (subscriber.stripe_connect_account_id) return res.status(409).json({ ok: false, error: "A Stripe account is already linked. Contact support to change it safely." });
    const nonce = randomBytes(24).toString("hex");
    const payload = Buffer.from(JSON.stringify({ subscriberId: auth.subscriber_id, nonce, expires: Date.now() + 600000 })).toString("base64url");
    const signature = createHmac("sha256", secret).update(payload).digest("base64url");
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://skip-logic.app").origin;
    const redirectUri = origin + "/api/stripe/connect-oauth-callback";
    res.setHeader("Set-Cookie", "sl_stripe_oauth_nonce=" + nonce + "; HttpOnly; Secure; SameSite=Lax; Path=/api/stripe/connect-oauth-callback; Max-Age=600");
    const url = new URL("https://connect.stripe.com/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", "read_write");
    url.searchParams.set("state", payload + "." + signature);
    url.searchParams.set("redirect_uri", redirectUri);
    return res.json({ ok: true, url: url.toString() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Unable to connect Stripe" });
  }
}
