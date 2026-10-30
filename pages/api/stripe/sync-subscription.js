import Stripe from "stripe";
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = await requireOfficeUser(req);
    if (!auth.ok || !auth.subscriber_id) return res.status(401).json({ error: "Not authenticated" });
    const supabase = getSupabaseAdmin();
    const { data: subscriber, error: subError } = await supabase
      .from("subscribers").select("id, stripe_customer_id").eq("id", auth.subscriber_id).single();
    if (subError) throw subError;
    if (!subscriber?.stripe_customer_id) return res.status(404).json({ error: "No Stripe customer linked" });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    const subscriptions = await stripe.subscriptions.list({
      customer: subscriber.stripe_customer_id, status: "all", limit: 100,
    });
    const ranked = subscriptions.data
      .filter((s) => ["trialing", "active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"].includes(s.status))
      .sort((a, b) => {
        const score = (s) => (["trialing", "active"].includes(s.status) ? 3 : s.status === "past_due" ? 2 : 1);
        return score(b) - score(a) || b.created - a.created;
      });
    const subscription = ranked[0];
    if (!subscription) return res.status(404).json({ error: "No Stripe subscription found for this company" });
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const { data: plan, error: planError } = await supabase
      .from("plan_variants").select("id").eq("stripe_price_id", priceId).maybeSingle();
    if (planError) throw planError;
    if (!plan) return res.status(409).json({ error: "Subscription price does not match a SkipLogic plan" });
    const status = subscription.status;
    const patch = {
      plan_variant_id: plan.id,
      subscription_status: status,
      trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      locked_at: ["canceled", "unpaid", "incomplete_expired"].includes(status) ? new Date().toISOString() : null,
    };
    const { error: updateError } = await supabase
      .from("subscribers").update(patch).eq("id", subscriber.id);
    if (updateError) throw updateError;
    return res.status(200).json({ ok: true, status, subscription_id: subscription.id });
  } catch (err) {
    console.error("Subscription sync failed", err);
    return res.status(500).json({ error: "Subscription sync failed", detail: String(err?.message || err) });
  }
}
