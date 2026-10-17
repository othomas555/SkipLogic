import { createHmac, timingSafeEqual } from "crypto";
import Stripe from "stripe";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  res.setHeader("Set-Cookie", "sl_stripe_oauth_nonce=; HttpOnly; Secure; SameSite=Lax; Path=/api/stripe/connect-oauth-callback; Max-Age=0");
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://skip-logic.app").origin;
  const destination = origin + "/app/settings/online-booking";
  if (req.method !== "GET") return res.status(405).end();
  const fail = () => res.redirect(303, destination + "?stripe=error");
  try {
    if (req.query.error || !req.query.code || !req.query.state) return fail();
    const secret = process.env.STRIPE_CONNECT_OAUTH_STATE_SECRET;
    if (!secret || secret.length < 32 || !process.env.STRIPE_SECRET_KEY) return fail();
    const [payload, signature, extra] = String(req.query.state).split(".");
    if (!payload || !signature || extra) return fail();
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    const a = Buffer.from(signature), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return fail();
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const cookies = String(req.headers.cookie || "").split(";").map(x => x.trim());
    const cookie = cookies.find(x => x.startsWith("sl_stripe_oauth_nonce="));
    const nonce = cookie ? cookie.slice("sl_stripe_oauth_nonce=".length) : "";
    if (!nonce || nonce !== state.nonce || !state.subscriberId || Date.now() > state.expires) return fail();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const result = await stripe.oauth.token({ grant_type: "authorization_code", code: String(req.query.code) });
    const accountId = result.stripe_user_id;
    if (!accountId) return fail();
    const account = await stripe.accounts.retrieve(accountId);
    if (account.controller?.losses?.payments === "application") return fail();
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("subscribers")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", state.subscriberId)
      .is("stripe_connect_account_id", null)
      .select("id").maybeSingle();
    if (error || !data) {
      await stripe.oauth.deauthorize({ client_id: process.env.STRIPE_CONNECT_CLIENT_ID, stripe_user_id: accountId }).catch(() => {});
      return fail();
    }
    return res.redirect(303, destination + "?stripe=connected");
  } catch (err) {
    console.error("Stripe Connect OAuth callback failed", err?.message);
    return fail();
  }
}
