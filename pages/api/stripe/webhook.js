// pages/api/stripe/webhook.js
import Stripe from "stripe";
import { buffer } from "micro";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: { bodyParser: false }, // required for Stripe signature verification
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isoNow() {
  return new Date().toISOString();
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function toIsoOrNull(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function isTrialing(sub) {
  return sub?.status === "trialing" || !!sub?.trial_end;
}

function normalizeStatus(sub) {
  if (isTrialing(sub)) return "trialing";
  const s = sub?.status || "unknown";
  if (s === "active") return "active";
  if (s === "past_due") return "past_due";
  if (s === "canceled") return "canceled";
  if (s === "unpaid") return "unpaid";
  if (s === "incomplete" || s === "incomplete_expired") return "incomplete";
  return s;
}

function supabaseAdmin() {
  const url = mustEnv("SUPABASE_URL");
  const key = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getSubscriberIdFromStripe(sub, stripeCustomerId, supabase) {
  // Preferred: metadata.subscriber_id (we’ll set this when we create checkout/subscription later)
  const meta = sub?.metadata?.subscriber_id;
  if (meta) return meta;

  // Fallback: lookup by stripe_customer_id on subscribers
  if (!stripeCustomerId) return null;

  const { data, error } = await supabase
    .from("subscribers")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

async function logEventBestEffort(supabase, subscriberId, event) {
  try {
    await supabase.from("subscription_events").insert({
      subscriber_id: subscriberId || null,
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event,
    });
  } catch (_) {
    // ignore
  }
}

async function updateSubscriberFromSub(supabase, subscriberId, stripeCustomerId, sub) {
  const status = normalizeStatus(sub);
  const trialEndsAt = toIsoOrNull(sub.trial_end);

  // Load current grace/lock so we don't overwrite grace repeatedly
  const { data: current, error: curErr } = await supabase
    .from("subscribers")
    .select("grace_ends_at, locked_at")
    .eq("id", subscriberId)
    .single();
  if (curErr) throw curErr;

  const patch = {
    stripe_customer_id: stripeCustomerId || null,
    stripe_subscription_id: sub.id,
    subscription_status: status,
    trial_ends_at: trialEndsAt,
  };

  // Grace / lock rules:
  // - past_due => start grace (7 days) if not already set
  // - active/trialing => clear grace + unlock
  // - canceled/unpaid => lock immediately
  const now = isoNow();

  if (status === "past_due") {
    if (!current.grace_ends_at) patch.grace_ends_at = addDays(now, 7);
    // keep access during grace
  } else if (status === "active" || status === "trialing") {
    patch.grace_ends_at = null;
    patch.locked_at = null;
  } else if (status === "canceled" || status === "unpaid") {
    patch.grace_ends_at = null;
    patch.locked_at = now;
  }

  const { error } = await supabase.from("subscribers").update(patch).eq("id", subscriberId);
  if (error) throw error;

  // If grace expired and still past_due, lock and mark status locked
  const { data: after, error: afterErr } = await supabase
    .from("subscribers")
    .select("subscription_status, grace_ends_at, locked_at")
    .eq("id", subscriberId)
    .single();
  if (afterErr) throw afterErr;

  if (!after.locked_at && after.subscription_status === "past_due" && after.grace_ends_at) {
    const graceMs = new Date(after.grace_ends_at).getTime();
    if (Number.isFinite(graceMs) && Date.now() > graceMs) {
      const { error: lockErr } = await supabase
        .from("subscribers")
        .update({ locked_at: isoNow(), subscription_status: "locked" })
        .eq("id", subscriberId);
      if (lockErr) throw lockErr;
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let event;
  try {
    const rawBody = await buffer(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(rawBody, sig, mustEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    return res.status(400).json({
      error: "Stripe signature verification failed",
      detail: String(err?.message || err),
    });
  }

  const supabase = supabaseAdmin();

  try {
    const type = event.type;

    if (type.startsWith("customer.subscription.")) {
      const sub = event.data.object;
      const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

      const subscriberId = await getSubscriberIdFromStripe(sub, stripeCustomerId, supabase);
      await logEventBestEffort(supabase, subscriberId, event);

      if (subscriberId) {
        await updateSubscriberFromSub(supabase, subscriberId, stripeCustomerId, sub);
      }

      return res.status(200).json({ ok: true });
    }

    if (type === "invoice.payment_failed" || type === "invoice.payment_succeeded") {
      const inv = event.data.object;
      const stripeCustomerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      const stripeSubId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;

      let subscriberId = null;

      if (stripeSubId) {
        const sub = await stripe.subscriptions.retrieve(stripeSubId);
        subscriberId = await getSubscriberIdFromStripe(sub, stripeCustomerId, supabase);
        await logEventBestEffort(supabase, subscriberId, event);

        if (subscriberId) {
          await updateSubscriberFromSub(supabase, subscriberId, stripeCustomerId, sub);
        }
      } else {
        await logEventBestEffort(supabase, null, event);
      }

      return res.status(200).json({ ok: true });
    }

    // Ignore other event types (keep lean)
    await logEventBestEffort(supabase, null, event);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      error: "Webhook handler failed",
      event_type: event?.type,
      detail: String(err?.message || err),
    });
  }
}
