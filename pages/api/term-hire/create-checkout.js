import Stripe from "stripe";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function addDays(ymd, days) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();

    const { job_id } = req.body || {};
    if (!job_id) {
      return res.status(400).json({ ok: false, error: "Missing job_id" });
    }

    // Get job
    const { data: job } = await supabase
      .from("jobs")
      .select("*, customers(email, first_name, last_name)")
      .eq("id", job_id)
      .maybeSingle();

    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    // Get settings
    const { data: settings } = await supabase
      .from("email_settings")
      .select("*")
      .eq("subscriber_id", job.subscriber_id)
      .maybeSingle();

    const price = Number(settings?.term_hire_extension_price_per_week || 0);
    if (!price || price <= 0) {
      return res.status(400).json({ ok: false, error: "Extension price not set" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: job.customers?.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Skip hire extension (${job.job_number})`,
            },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/extend-success?job_id=${job.id}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/extend-cancelled`,
      metadata: {
        job_id: job.id,
      },
    });

    return res.status(200).json({
      ok: true,
      url: session.url,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false });
  }
}
