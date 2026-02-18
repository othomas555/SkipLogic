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
    trial_ends_at:
