// pages/api/stripe/webhook.js
import Stripe from "stripe";
import { buffer } from "micro";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false, // required for Stripe signature verification
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function addDays(ts, days) {
  const d = new Date(ts);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function toIsoOrNull(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function normalizeStatus(stripeStatus, isTrialing) {
  // Keep our statuses simple + commercial
  if (isTrialing) return "trialing";
  if (stripeStatus === "active") return "active";
  if (stripeStatus === "past_due") return "past_due";
  if (stripeStatus === "canceled") return "canceled";
  if (stripeStatus === "unpaid") return "unpaid";
  if (stripeStatus === "incomplete") return "incomplete";
  if (stripeStatus === "incomplete_expired") return "incomplete";
  return stripeStatus || "unknown";
}

function isTrialingFromStripeSub(sub) {
  // Stripe can show trial via status=trialing and/or trial_end
  return sub?.status === "trialing" || !!sub?.trial_end;
}

function getSupabaseAdmin() {
  const url = mustEnv("SUPABASE_URL");
  const key = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function findSubscriberId({ supabase, stripeCustomerId, stripeSubscription }) {
  // Preferred: metadata.subscriber_id (we will set this when creating checkout/subscription)
  const metaSubId =
    stripeSubscription?.metadata?.subscriber_id ||
    stripeSubscription?.customer?.metadata?.subscriber_id ||
    null;

  if (metaSubId) return metaSubId;

  // Fallback: map by stripe_customer_id stored on subscribers
  if (!stripeCustomerId) return null;

  const { data, error } = await supabase
    .from("subscribers")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

async function updateSubscriberFromSubscription({ supabase, subscriberId, stripeCustomerId, sub }) {
  const trialEndsAt = toIsoOrNull(sub.trial_end);
  const status = normalizeStatus(sub.status, isTrialingFromStripeSub(sub));

  // Grace logic:
  // - when Stripe marks past_due => set grace_ends_at = now + 7 days (if not already set)
  // - when Stripe becomes active/trialing => clear grace + lock
  // - when canceled/unpaid => lock immediately
  const nowIso = new Date().toISOString();

  // Fetch current to avoid overwriting grace unnecessarily
  const { data: current, error: curErr } = await supabase
    .from("subscribers")
    .select("grace_ends_at, locked_at, subscription_status")
    .eq("id", subscriberId)
    .single();
  if (curErr) throw curErr;

  const patch = {
    stripe_customer_id: stripeCustomerId || null,
    stripe_subscription_id: sub.id,
    subscription_status: status,
    trial_ends_at: trialEndsAt,
  };

  if (status === "past_due") {
    // start grace if not already set
    if (!current.grace_ends_at) patch.grace_ends_at = addDays(nowIso, 7);
    // do not lock during grace
  } else if (status === "active" || status === "trialing") {
    patch.grace_ends_at = null;
    patch.locked_at = null;
  } else if (status === "canceled" || status === "unpaid") {
    patch.grace_ends_at = null;
    patch.locked_at = nowIso;
  }

  const { error } = await supabase.from("subscribers").update(patch).eq("id", subscriberId);
  if (error) throw error;
}

async function lockExpiredGrace({ supabase, subscriberId }) {
  // If grace_end passed and still past_due, lock
  const { data, error } = await supabase
    .from("subscribers")
    .select("subscription_status, grace_ends_at, locked_at")
    .eq("id", subscriberId)
    .single();
  if (error) throw error;

  if (data.locked_at) return;

  if (data.subscription_status === "past_due" && data.grace_ends_at) {
    const graceMs = new Date(data.grace_ends_at).getTime();
    if (Number.isFinite(graceMs) && Date.now() > graceMs) {
      const { error: upErr } = await supabase
        .from("subscribers")
        .update({ locked_at: new Date().toISOString(), subscription_status: "locked" })
        .eq("id", subscriberId);
      if (upErr) throw upErr;
    }
  }
}

async function logEvent({ supabase, subscriberId, event }) {
  // best-effort logging (don’t fail the webhook if this fails)
  try {
    await supabase.from("subscription_events").insert({
      subscriber_id: subscriberId || null,
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event,
    });
  } catch (e) {
    // ignore
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = mustEnv("STRIPE_WEBHOOK_SECRET");
  const supabase = getSupabaseAdmin();

  let event;
  try {
    const rawBody = await buffer(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed`, detail: String(err?.message || err) });
  }

  try {
    // Core events we care about now:
    // - customer.subscription.created/updated/deleted
    // - invoice.payment_succeeded / invoice.payment_failed (optional but useful)
    const type = event.type;

    if (type.startsWith("customer.subscription.")) {
      const sub = event.data.object;
      const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

      const subscriberId = await findSubscriberId({ supabase, stripeCustomerId, stripeSubscription: sub });

      await logEvent({ supabase, subscriberId, event });

      if (subscriberId) {
        await updateSubscriberFromSubscription({ supabase, subscriberId, stripeCustomerId, sub });
        await lockExpiredGrace({ supabase, subscriberId });
      }

      return res.status(200).json({ ok: true });
    }

    if (type === "invoice.payment_failed" || type === "invoice.payment_succeeded") {
      const inv = event.data.object;
      const stripeCustomerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      const stripeSubId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;

      // If we have a subscription id, fetch the subscription and update status consistently
      if (stripeSubId) {
        const sub = await stripe.subscriptions.retrieve(stripeSubId);
        const subscriberId = await findSubscriberId({ supabase, stripeCustomerId, stripeSubscription: sub });

        await logEvent({ supabase, subscriberId, event });

        if (subscriberId) {
          await updateSubscriberFromSubscription({ supabase, subscriberId, stripeCustomerId, sub });
          await lockExpiredGrace({ supabase, subscriberId });
        }
      } else {
        await logEvent({ supabase, subscriberId: null, event });
      }

      return res.status(200).json({ ok: true });
    }

    // Ignore other event types for now (keep lean)
    await logEvent({ supabase, subscriberId: null, event });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      error: "Webhook handler failed",
      detail: String(err?.message || err),
      event_type: event?.type,
    });
  }
}
