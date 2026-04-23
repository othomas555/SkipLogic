import Stripe from "stripe";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isTokenExpired(expiresAt) {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t < Date.now();
}

function makeOrigin(req) {
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
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();

    const jobId = asText(req.body?.job_id);
    const token = asText(req.body?.token);
    const weeks = Math.max(1, Number(req.body?.weeks || 1) || 1);

    if (!jobId) {
      return res.status(400).json({ ok: false, error: "Missing job_id" });
    }

    if (!token) {
      return res.status(400).json({ ok: false, error: "Missing token" });
    }

    const { data: action, error: actionErr } = await supabase
      .from("term_hire_actions")
      .select("*")
      .eq("job_id", jobId)
      .eq("token", token)
      .eq("action_type", "extend")
      .maybeSingle();

    if (actionErr) throw actionErr;

    if (!action) {
      return res.status(404).json({ ok: false, error: "Invalid extension link" });
    }

    if (String(action.status || "").toLowerCase() !== "active") {
      return res.status(400).json({ ok: false, error: "This extension link has already been used" });
    }

    if (isTokenExpired(action.expires_at)) {
      return res.status(400).json({ ok: false, error: "This extension link has expired" });
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, subscriber_id, customer_id, job_number, job_status, collection_actual_date, cancelled_at")
      .eq("id", jobId)
      .eq("subscriber_id", action.subscriber_id)
      .maybeSingle();

    if (jobErr) throw jobErr;

    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    if (job.collection_actual_date) {
      return res.status(400).json({ ok: false, error: "This skip has already been collected" });
    }

    if (job.cancelled_at || String(job.job_status || "").toLowerCase() === "cancelled") {
      return res.status(400).json({ ok: false, error: "This job has been cancelled" });
    }

    const { data: settings, error: settingsErr } = await supabase
      .from("email_settings")
      .select("from_name, from_email, term_hire_extension_price_per_week")
      .eq("subscriber_id", job.subscriber_id)
      .maybeSingle();

    if (settingsErr) throw settingsErr;

    const unitAmount = Math.round(Number(settings?.term_hire_extension_price_per_week || 0) * 100);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Extension price is not configured for this subscriber",
      });
    }

    const amountTotalPence = unitAmount * weeks;
    const origin = makeOrigin(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${origin}/extend-success?job_id=${encodeURIComponent(job.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/extend-cancelled?job_id=${encodeURIComponent(job.id)}`,
      customer_email: undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: amountTotalPence,
            product_data: {
              name: `Skip hire extension${job.job_number ? ` – ${job.job_number}` : ""}`,
              description: `${weeks} week${weeks === 1 ? "" : "s"} extension`,
            },
          },
        },
      ],
      metadata: {
        flow: "term_hire_extension",
        job_id: job.id,
        subscriber_id: job.subscriber_id,
        customer_id: job.customer_id || "",
        weeks: String(weeks),
        token,
      },
    });

    return res.status(200).json({
      ok: true,
      url: session.url,
      job_number: job.job_number || "",
    });
  } catch (err) {
    console.error("create-checkout error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to create extension checkout",
    });
  }
}
