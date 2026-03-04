// pages/api/stripe/webhook.js
import Stripe from "stripe";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const config = {
  api: { bodyParser: false }, // raw body for Stripe signature verification
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function toIsoFromUnixSeconds(sec) {
  if (!sec) return null;
  const ms = Number(sec) * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

async function findSubscriberByStripeCustomerId(supabase, stripeCustomerId) {
  const { data, error } = await supabase
    .from("subscribers")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function findPlanVariantByPriceId(supabase, priceId) {
  if (!priceId) return null;
  const { data, error } = await supabase
    .from("plan_variants")
    .select("id")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const webhookSecret = mustEnv("STRIPE_WEBHOOK_SECRET");
    const rawBody = await readRawBody(req);
    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).send("Missing stripe-signature header");

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    const supabase = getSupabaseAdmin();

    // ---- Subscription lifecycle events ----
    if (
      event.type === "checkout.session.completed" ||
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      let subscription = null;
      let stripeCustomerId = null;

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        stripeCustomerId = session.customer || null;

        if (session.subscription) {
          subscription = await stripe.subscriptions.retrieve(session.subscription);
        }
      } else {
        subscription = event.data.object;
        stripeCustomerId = subscription.customer || null;
      }

      if (!stripeCustomerId) return res.status(200).json({ ok: true, ignored: true, reason: "No customer id" });

      const subscriberId = await findSubscriberByStripeCustomerId(supabase, stripeCustomerId);
      if (!subscriberId) return res.status(200).json({ ok: true, ignored: true, reason: "No matching subscriber" });

      // Map Stripe price -> plan_variants.id
      let planVariantId = null;
      const priceId = subscription?.items?.data?.[0]?.price?.id || null;
      planVariantId = await findPlanVariantByPriceId(supabase, priceId);

      const status = subscription?.status || "unknown";
      const trialEndsAt = toIsoFromUnixSeconds(subscription?.trial_end || null);

      const patch = {
        subscription_status: status,
        trial_ends_at: trialEndsAt,
        plan_variant_id: planVariantId || null,
        locked_at: null, // if they re-subscribe, unlock
      };

      const { error: upErr } = await supabase.from("subscribers").update(patch).eq("id", subscriberId);
      if (upErr) throw upErr;

      return res.status(200).json({ ok: true });
    }

    // ---- Payment events (grace period logic) ----
    if (event.type === "invoice.payment_failed") {
      const inv = event.data.object;
      const stripeCustomerId = inv.customer || null;
      if (!stripeCustomerId) return res.status(200).json({ ok: true });

      const subscriberId = await findSubscriberByStripeCustomerId(supabase, stripeCustomerId);
      if (!subscriberId) return res.status(200).json({ ok: true });

      const grace = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error: upErr } = await supabase
        .from("subscribers")
        .update({
          subscription_status: "past_due",
          grace_ends_at: grace,
        })
        .eq("id", subscriberId);

      if (upErr) throw upErr;

      return res.status(200).json({ ok: true });
    }

    if (event.type === "invoice.payment_succeeded") {
      const inv = event.data.object;
      const stripeCustomerId = inv.customer || null;
      if (!stripeCustomerId) return res.status(200).json({ ok: true });

      const subscriberId = await findSubscriberByStripeCustomerId(supabase, stripeCustomerId);
      if (!subscriberId) return res.status(200).json({ ok: true });

      const { error: upErr } = await supabase
        .from("subscribers")
        .update({
          subscription_status: "active",
          grace_ends_at: null,
          locked_at: null,
        })
        .eq("id", subscriberId);

      if (upErr) throw upErr;

      return res.status(200).json({ ok: true });
    }

    // Ignore all other events
    return res.status(200).json({ ok: true, ignored: true, type: event.type });
  } catch (err) {
    console.error(err);
    return res.status(500).send(String(err?.message || err));
  }
}
