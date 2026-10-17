// Temporary authenticated diagnostic for the Stripe account used by this deployment.
// Does not return API keys or full account identifiers.
import Stripe from "stripe";
import { requireOfficeUser } from "../../../lib/requireOfficeUser";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireOfficeUser(req);
  if (!auth.ok) return res.status(401).json({ error: "Not authenticated" });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "STRIPE_SECRET_KEY is missing on this deployment" });

  try {
    const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
    const account = await stripe.accounts.retrieve();
    return res.status(200).json({
      ok: true,
      account_name: account.business_profile?.name || account.settings?.dashboard?.display_name || account.company?.name || "(not configured)",
      account_id_last4: account.id?.slice(-4) || null,
      key_mode: key.startsWith("sk_test_") ? "test" : key.startsWith("sk_live_") ? "live" : "unknown",
      stripe_account_live_mode: Boolean(account.charges_enabled && key.startsWith("sk_live_")),
    });
  } catch (err) {
    return res.status(500).json({ error: "Could not identify Stripe account", detail: err?.message || String(err) });
  }
}
