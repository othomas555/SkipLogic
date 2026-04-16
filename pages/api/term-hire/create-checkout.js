import Stripe from "stripe";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function getBaseUrl(req) {
  const envBase = asText(process.env.NEXT_PUBLIC_BASE_URL);
  if (envBase) return envBase.replace(/\/+$/, "");

  const proto =
    req.headers["x-forwarded-proto"] ||
    (process.env.NODE_ENV === "development" ? "http" : "https");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const jobId = asText(req.body?.job_id);
    const weeks = Math.max(1, Number(req.body?.weeks || 1) || 1);

    if (!jobId) {
      return res.status(400).json({ ok: false, error: "Missing job_id" });
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(`
        *,
        customers (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr) throw jobErr;

    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    if (job.collection_actual_date) {
      return res.status(400).json({ ok: false, error: "This skip has already been collected" });
    }

    if (String(job.job_status || "").toLowerCase() === "cancelled" || job.cancelled_at) {
      return res.status(400).json({ ok: false, error: "This job is cancelled" });
    }

    const { data: settings, error: settingsErr } = await supabase
      .from("email_settings")
      .select(`
        term_hire_enabled,
        term_hire_email_enabled,
        term_hire_extension_price_per_week
      `)
      .eq("subscriber_id", job.subscriber_id)
      .maybeSingle();

    if (settingsErr) throw settingsErr;

    if (!settings?.term_hire_enabled) {
      return res.status(400).json({ ok: false, error: "Term hire extensions are not enabled" });
    }

    const pricePerWeek = Number(settings?.term_hire_extension_price_per_week || 0);
    if (!Number.isFinite(pricePerWeek) || pricePerWeek <= 0) {
      return res.status(400).json({ ok: false, error: "Extension price is not configured" });
    }

    const customerEmail = asText(job?.customers?.email);
    if (!customerEmail) {
      return res.status(400).json({ ok: false, error: "Customer email is missing for this job" });
    }

    const baseUrl = getBaseUrl(req);
    const amount = Math.round(pricePerWeek * weeks * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: customerEmail,
      billing_address_collection: "auto",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name:
                weeks === 1
                  ? `Skip hire extension - ${job.job_number || job.id}`
                  : `Skip hire extension (${weeks} weeks) - ${job.job_number || job.id}`,
              description: `Additional hire for skip job ${job.job_number || job.id}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        flow: "term_hire_extension",
        job_id: job.id,
        subscriber_id: job.subscriber_id,
        customer_id: job.customer_id || job?.customers?.id || "",
        weeks: String(weeks),
      },
      success_url: `${baseUrl}/extend-success?job_id=${encodeURIComponent(job.id)}`,
      cancel_url: `${baseUrl}/extend-cancelled?job_id=${encodeURIComponent(job.id)}`,
    });

    const { error: pendingErr } = await supabase
      .from("jobs")
      .update({
        term_hire_extension_pending: true,
        term_hire_extension_pending_at: new Date().toISOString(),
        term_hire_status: "extension_pending_payment",
      })
      .eq("id", job.id)
      .eq("subscriber_id", job.subscriber_id);

    if (pendingErr) throw pendingErr;

    await supabase.from("term_hire_extensions").insert({
      subscriber_id: job.subscriber_id,
      job_id: job.id,
      customer_id: job.customer_id || job?.customers?.id || null,
      weeks,
      amount: amount / 100,
      stripe_session_id: session.id,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    await supabase.from("term_hire_events").insert({
      subscriber_id: job.subscriber_id,
      job_id: job.id,
      customer_id: job.customer_id || job?.customers?.id || null,
      channel: "web",
      event_type: "extension_checkout_created",
      template_key: null,
      recipient: customerEmail,
      metadata: {
        stripe_session_id: session.id,
        weeks,
        amount: amount / 100,
      },
    });

    return res.status(200).json({
      ok: true,
      url: session.url,
    });
  } catch (err) {
    console.error("term-hire/create-checkout error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to create checkout",
    });
  }
}
