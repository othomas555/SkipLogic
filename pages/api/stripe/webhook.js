import Stripe from "stripe";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { createTermHireExtensionInvoice } from "../xero/xero_create_invoice";

export const config = {
  api: { bodyParser: false },
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

function addDays(ymd, days) {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function asPositiveNumberOrNull(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatMoneyGBP(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "£0.00";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function escapeHtml(v) {
  return String(v == null ? "" : v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function customerName(customer) {
  const company = asText(customer?.company_name);
  const first = asText(customer?.first_name);
  const last = asText(customer?.last_name);
  const person = [first, last].filter(Boolean).join(" ").trim();

  if (company && person) return `${company} – ${person}`;
  if (company) return company;
  if (person) return person;
  return "Customer";
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

async function insertTermHireEvent(supabase, payload) {
  try {
    await supabase.from("term_hire_events").insert(payload);
  } catch (e) {
    console.error("term_hire_events insert failed", e);
  }
}

async function getBaseHireEndDate(supabase, job) {
  if (job?.term_hire_end_date) return job.term_hire_end_date;
  if (job?.term_hire_extended_until) return job.term_hire_extended_until;

  const deliveryBase = job?.delivery_actual_date || job?.scheduled_date || null;
  if (!deliveryBase) return null;

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("term_hire_days_override")
    .eq("id", job.customer_id)
    .maybeSingle();

  if (customerErr) throw customerErr;

  const { data: subscriber, error: subscriberErr } = await supabase
    .from("subscribers")
    .select("term_hire_days")
    .eq("id", job.subscriber_id)
    .maybeSingle();

  if (subscriberErr) throw subscriberErr;

  const { data: settings, error: settingsErr } = await supabase
    .from("email_settings")
    .select("term_hire_default_days")
    .eq("subscriber_id", job.subscriber_id)
    .maybeSingle();

  if (settingsErr) throw settingsErr;

  const hireDays =
    asPositiveNumberOrNull(customer?.term_hire_days_override) ??
    asPositiveNumberOrNull(subscriber?.term_hire_days) ??
    asPositiveNumberOrNull(settings?.term_hire_default_days) ??
    14;

  return addDays(deliveryBase, hireDays);
}

async function queueExtensionConfirmationEmail({
  supabase,
  subscriberId,
  job,
  customerId,
  customerEmail,
  customer,
  weeks,
  amountPaid,
  oldHireEndDate,
  newHireEndDate,
  session,
}) {
  const toEmail = asText(customerEmail);
  if (!toEmail) return;

  const { data: settings, error: settingsErr } = await supabase
    .from("email_settings")
    .select("provider, is_enabled")
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (settingsErr) throw settingsErr;

  if (!settings?.is_enabled) {
    await insertTermHireEvent(supabase, {
      subscriber_id: subscriberId,
      job_id: job.id,
      customer_id: customerId || job.customer_id || null,
      channel: "email",
      event_type: "extension_confirmation_skipped",
      template_key: "term_hire_extension_confirmation",
      recipient: toEmail,
      metadata: {
        reason: "Email settings disabled",
        stripe_session_id: session.id,
      },
    });
    return;
  }

  const jobNumber = job.job_number || job.id;
  const subject = `Your skip hire has been extended (${jobNumber})`;

  const safeCustomerName = escapeHtml(customerName(customer));
  const safeJobNumber = escapeHtml(jobNumber);
  const safeOldDate = escapeHtml(oldHireEndDate || "");
  const safeNewDate = escapeHtml(newHireEndDate || "");
  const safeWeeks = escapeHtml(String(weeks));
  const safeAmount = escapeHtml(formatMoneyGBP(amountPaid));

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;background:#f8fafc;padding:24px">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
        <div style="padding:20px 24px;background:#111827;color:#ffffff">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8">Skip hire</div>
          <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2">Hire extended</h1>
        </div>
        <div style="padding:24px">
          <p style="margin-top:0">Hi ${safeCustomerName},</p>
          <p>Thank you. Your skip hire has been successfully extended.</p>

          <div style="margin:18px 0;padding:14px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb">
            <p style="margin:0 0 8px"><strong>Job:</strong> ${safeJobNumber}</p>
            <p style="margin:0 0 8px"><strong>Extension:</strong> ${safeWeeks} week${weeks === 1 ? "" : "s"}</p>
            <p style="margin:0 0 8px"><strong>Previous hire end date:</strong> ${safeOldDate}</p>
            <p style="margin:0 0 8px"><strong>New hire end date:</strong> ${safeNewDate}</p>
            <p style="margin:0"><strong>Amount paid:</strong> ${safeAmount}</p>
          </div>

          <p>If you need anything else, just reply to this email.</p>
          <p style="margin-bottom:0;color:#4b5563;font-size:13px">Payment reference: ${escapeHtml(session.id)}</p>
        </div>
      </div>
    </div>
  `;

  const { error: outboxErr } = await supabase.from("email_outbox").insert({
    subscriber_id: subscriberId,
    job_id: job.id,
    customer_id: customerId || job.customer_id || null,
    template_key: "term_hire_extension_confirmation",
    to_email: toEmail,
    subject_snapshot: subject,
    status: "pending",
    provider: settings.provider || "resend",
    error: null,
    sent_at: null,
  });

  if (outboxErr) throw outboxErr;

  await insertTermHireEvent(supabase, {
    subscriber_id: subscriberId,
    job_id: job.id,
    customer_id: customerId || job.customer_id || null,
    channel: "email",
    event_type: "email_queued",
    template_key: "term_hire_extension_confirmation",
    recipient: toEmail,
    metadata: {
      subject,
      body_html: html,
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      weeks,
      amount: amountPaid,
      old_hire_end_date: oldHireEndDate,
      new_hire_end_date: newHireEndDate,
      reason: "term_hire_extension_confirmation",
    },
  });
}

async function queueXeroInvoiceFailureEvent({
  supabase,
  subscriberId,
  job,
  customerId,
  session,
  error,
}) {
  await insertTermHireEvent(supabase, {
    subscriber_id: subscriberId,
    job_id: job.id,
    customer_id: customerId || job.customer_id || null,
    channel: "xero",
    event_type: "extension_xero_invoice_failed",
    template_key: null,
    recipient: null,
    metadata: {
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      error: String(error?.message || error || "Unknown Xero invoice error"),
    },
  });
}

async function handleTermHireCheckoutCompleted(supabase, session) {
  const flow = String(session?.metadata?.flow || "");
  if (flow !== "term_hire_extension") {
    return { handled: false };
  }

  const jobId = String(session?.metadata?.job_id || "");
  const subscriberId = String(session?.metadata?.subscriber_id || "");
  const customerId = String(session?.metadata?.customer_id || "");
  const token = String(session?.metadata?.token || "");
  const weeks = Math.max(1, Number(session?.metadata?.weeks || 1) || 1);

  if (!jobId || !subscriberId) {
    return { handled: true, ok: false, reason: "Missing term-hire metadata" };
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (jobErr) throw jobErr;

  if (!job) {
    return { handled: true, ok: false, reason: "Job not found" };
  }

  const { data: existingPaid, error: existingPaidErr } = await supabase
    .from("term_hire_extensions")
    .select("id")
    .eq("stripe_session_id", session.id)
    .eq("status", "paid")
    .limit(1);

  if (existingPaidErr) throw existingPaidErr;

  if (Array.isArray(existingPaid) && existingPaid.length > 0) {
    return { handled: true, ok: true, reason: "Already processed" };
  }

  const baseEndDate = await getBaseHireEndDate(supabase, job);

  if (!baseEndDate) {
    return { handled: true, ok: false, reason: "No base hire end date" };
  }

  const newHireEndDate = addDays(baseEndDate, weeks * 7);
  const amountPaid = Number(session?.amount_total || 0) / 100;
  const nowIso = new Date().toISOString();

  const upsertExtension = {
    subscriber_id: subscriberId,
    job_id: job.id,
    customer_id: customerId || job.customer_id || null,
    weeks,
    amount: amountPaid,
    old_hire_end_date: baseEndDate,
    new_hire_end_date: newHireEndDate,
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || null,
    status: "paid",
    paid_at: nowIso,
  };

  const { error: extensionInsertErr } = await supabase
    .from("term_hire_extensions")
    .upsert(upsertExtension, { onConflict: "stripe_session_id" });

  if (extensionInsertErr) throw extensionInsertErr;

  const currentExtensionDays = Number(job.hire_extension_days || 0);
  const nextExtensionDays = Number.isFinite(currentExtensionDays)
    ? currentExtensionDays + weeks * 7
    : weeks * 7;

  const { error: jobUpdateErr } = await supabase
    .from("jobs")
    .update({
      term_hire_end_date: newHireEndDate,
      term_hire_extended_until: newHireEndDate,
      hire_extension_days: nextExtensionDays,
      term_hire_status: "extended",
      term_hire_suppressed: false,
      term_hire_suppressed_at: null,
      term_hire_suppressed_reason: null,
      term_hire_extension_pending: false,
      term_hire_extension_pending_at: null,
      term_hire_auto_collection_due: false,
      collection_date: null,
      last_edited_at: nowIso,
    })
    .eq("id", job.id)
    .eq("subscriber_id", subscriberId);

  if (jobUpdateErr) throw jobUpdateErr;

  if (token) {
    const { data: action, error: actionErr } = await supabase
      .from("term_hire_actions")
      .select("id, metadata")
      .eq("token", token)
      .eq("job_id", job.id)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (actionErr) throw actionErr;

    if (action?.id) {
      const { error: actionUpdateErr } = await supabase
        .from("term_hire_actions")
        .update({
          status: "completed",
          metadata: {
            ...(action.metadata || {}),
            completed_at: nowIso,
            stripe_session_id: session.id,
            new_hire_end_date: newHireEndDate,
          },
        })
        .eq("id", action.id);

      if (actionUpdateErr) throw actionUpdateErr;
    }
  }

  await insertTermHireEvent(supabase, {
    subscriber_id: subscriberId,
    job_id: job.id,
    customer_id: customerId || job.customer_id || null,
    channel: "stripe",
    event_type: "extension_paid",
    template_key: null,
    recipient: session.customer_details?.email || session.customer_email || null,
    metadata: {
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent || null,
      weeks,
      amount: amountPaid,
      old_hire_end_date: baseEndDate,
      new_hire_end_date: newHireEndDate,
    },
  });

  let customer = null;
  if (customerId || job.customer_id) {
    const { data: customerRow, error: customerErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, company_name, email")
      .eq("id", customerId || job.customer_id)
      .maybeSingle();

    if (customerErr) throw customerErr;
    customer = customerRow || null;
  }

  const receiptEmail =
    session.customer_details?.email ||
    session.customer_email ||
    customer?.email ||
    null;

  await queueExtensionConfirmationEmail({
    supabase,
    subscriberId,
    job,
    customerId: customerId || job.customer_id || null,
    customerEmail: receiptEmail,
    customer,
    weeks,
    amountPaid,
    oldHireEndDate: baseEndDate,
    newHireEndDate,
    session,
  });

  try {
    const xeroResult = await createTermHireExtensionInvoice({
      subscriberId,
      jobId: job.id,
      stripeSessionId: session.id,
    });

    await insertTermHireEvent(supabase, {
      subscriber_id: subscriberId,
      job_id: job.id,
      customer_id: customerId || job.customer_id || null,
      channel: "xero",
      event_type: "extension_xero_invoice_result",
      template_key: null,
      recipient: null,
      metadata: {
        stripe_session_id: session.id,
        result: xeroResult || null,
      },
    });
  } catch (xeroErr) {
    console.error("Failed to create Xero invoice for term hire extension", xeroErr);

    await queueXeroInvoiceFailureEvent({
      supabase,
      subscriberId,
      job,
      customerId: customerId || job.customer_id || null,
      session,
      error: xeroErr,
    });
  }

  return { handled: true, ok: true };
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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const termHireResult = await handleTermHireCheckoutCompleted(supabase, session);
      if (termHireResult.handled) {
        return res.status(200).json({ ok: true, term_hire: termHireResult });
      }

      let subscription = null;
      const stripeCustomerId = session.customer || null;

      if (session.subscription) {
        subscription = await stripe.subscriptions.retrieve(session.subscription);
      }

      if (!stripeCustomerId) {
        return res.status(200).json({ ok: true, ignored: true, reason: "No customer id" });
      }

      const subscriberId = await findSubscriberByStripeCustomerId(supabase, stripeCustomerId);
      if (!subscriberId) {
        return res.status(200).json({ ok: true, ignored: true, reason: "No matching subscriber" });
      }

      const priceId = subscription?.items?.data?.[0]?.price?.id || null;
      const planVariantId = await findPlanVariantByPriceId(supabase, priceId);

      const status = subscription?.status || "unknown";
      const trialEndsAt = toIsoFromUnixSeconds(subscription?.trial_end || null);

      const patch = {
        subscription_status: status,
        trial_ends_at: trialEndsAt,
        plan_variant_id: planVariantId || null,
        locked_at: null,
      };

      const { error: upErr } = await supabase
        .from("subscribers")
        .update(patch)
        .eq("id", subscriberId);

      if (upErr) throw upErr;

      return res.status(200).json({ ok: true });
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer || null;

      if (!stripeCustomerId) {
        return res.status(200).json({ ok: true, ignored: true, reason: "No customer id" });
      }

      const subscriberId = await findSubscriberByStripeCustomerId(supabase, stripeCustomerId);
      if (!subscriberId) {
        return res.status(200).json({ ok: true, ignored: true, reason: "No matching subscriber" });
      }

      const priceId = subscription?.items?.data?.[0]?.price?.id || null;
      const planVariantId = await findPlanVariantByPriceId(supabase, priceId);

      const status = subscription?.status || "unknown";
      const trialEndsAt = toIsoFromUnixSeconds(subscription?.trial_end || null);

      const patch = {
        subscription_status: status,
        trial_ends_at: trialEndsAt,
        plan_variant_id: planVariantId || null,
        locked_at: null,
      };

      const { error: upErr } = await supabase
        .from("subscribers")
        .update(patch)
        .eq("id", subscriberId);

      if (upErr) throw upErr;

      return res.status(200).json({ ok: true });
    }

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

    return res.status(200).json({ ok: true, ignored: true, type: event.type });
  } catch (err) {
    console.error(err);
    return res.status(500).send(String(err?.message || err));
  }
}
