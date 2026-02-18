// pages/api/stripe/create-checkout-session.js
import Stripe from "stripe";
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Auth (office user)
    const { user, profile } = await requireOfficeUser(req);
    const subscriberId = profile?.subscriber_id;
    if (!subscriberId) return res.status(400).json({ error: "No subscriber_id on profile" });

    const { plan_variant_id } = req.body || {};
    if (!plan_variant_id) return res.status(400).json({ error: "Missing plan_variant_id" });

    const supabase = getSupabaseAdmin();

    // Load subscriber + chosen plan variant
    const { data: subRow, error: subErr } = await supabase
      .from("subscribers")
      .select("id, stripe_customer_id")
      .eq("id", subscriberId)
      .single();
    if (subErr) throw subErr;

    const { data: pv, error: pvErr } = await supabase
      .from("plan_variants")
      .select("id, name, stripe_price_id, is_active")
      .eq("id", plan_variant_id)
      .single();
    if (pvErr) throw pvErr;

    if (!pv.is_active) return res.status(400).json({ error: "Plan variant is not active" });
    if (!pv.stripe_price_id) {
      return res.status(400).json({
        error: "Plan variant has no stripe_price_id set yet",
        hint: "Set plan_variants.stripe_price_id to a Stripe recurring monthly Price ID (price_...)",
      });
    }

    // Ensure Stripe customer exists
    let stripeCustomerId = subRow.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        metadata: {
          subscriber_id: subscriberId,
        },
      });

      stripeCustomerId = customer.id;

      const { error: upErr } = await supabase
        .from("subscribers")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", subscriberId);
      if (upErr) throw upErr;
    } else {
      // Keep metadata aligned (best-effort)
      try {
        await stripe.customers.update(stripeCustomerId, {
          metadata: { subscriber_id: subscriberId },
        });
      } catch (_) {}
    }

    const origin =
      (req.headers["x-forwarded-proto"] ? String(req.headers["x-forwarded-proto"]) : "https") +
      "://" +
      req.headers.host;

    // Stripe Checkout: subscription + 30-day trial + card required
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: pv.stripe_price_id, quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          subscriber_id: subscriberId,
          plan_variant_id: pv.id,
        },
      },
      allow_promotion_codes: true,
      success_url: `${origin}/app/settings/subscription?checkout=success`,
      cancel_url: `${origin}/app/settings/subscription?checkout=cancel`,
    });

    return res.status(200).json({ ok: true, url: session.url });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to create checkout session",
      detail: String(err?.message || err),
    });
  }
}
