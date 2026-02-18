// pages/api/stripe/create-billing-portal-session.js
import Stripe from "stripe";
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { profile } = await requireOfficeUser(req);
    const subscriberId = profile?.subscriber_id;
    if (!subscriberId) return res.status(400).json({ error: "No subscriber_id on profile" });

    const supabase = getSupabaseAdmin();

    const { data: subRow, error: subErr } = await supabase
      .from("subscribers")
      .select("stripe_customer_id")
      .eq("id", subscriberId)
      .single();
    if (subErr) throw subErr;

    if (!subRow.stripe_customer_id) {
      return res.status(400).json({
        error: "No Stripe customer for this subscriber yet",
        hint: "Start a subscription first (Checkout).",
      });
    }

    const origin =
      (req.headers["x-forwarded-proto"] ? String(req.headers["x-forwarded-proto"]) : "https") +
      "://" +
      req.headers.host;

    const session = await stripe.billingPortal.sessions.create({
      customer: subRow.stripe_customer_id,
      return_url: `${origin}/app/settings/subscription`,
    });

    return res.status(200).json({ ok: true, url: session.url });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to create billing portal session",
      detail: String(err?.message || err),
    });
  }
}
