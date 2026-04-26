import { getSupabaseAdmin } from "./supabaseAdmin";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function siteAddress(job) {
  return [
    job.site_name,
    job.site_address_line1,
    job.site_address_line2,
    job.site_town,
    job.site_postcode,
  ]
    .map(asText)
    .filter(Boolean)
    .join(", ");
}

function customerName(customer) {
  const person = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
  return customer.company_name || person || "Customer";
}

function replaceTags(input, tags) {
  let out = String(input || "");
  for (const [key, value] of Object.entries(tags || {})) {
    out = out.split(`{{${key}}}`).join(value == null ? "" : String(value));
  }
  return out;
}

function defaultTerms() {
  return `
    The skip must not be overloaded above the sides.
    Restricted items must not be placed in the skip unless agreed in advance.
    Additional charges may apply for tyres, mattresses, fridge/freezers, paint tins, plasterboard, POPs waste, hazardous waste or overweight skips.
    The hirer is responsible for ensuring clear and safe access for delivery and collection.
  `;
}

function normaliseAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .map((a) => {
      const filename = asText(a?.filename);
      const content = a?.content;
      const contentType = asText(a?.content_type || a?.contentType);

      if (!filename || !content) return null;

      let encoded = "";

      if (Buffer.isBuffer(content)) {
        encoded = content.toString("base64");
      } else if (content instanceof Uint8Array) {
        encoded = Buffer.from(content).toString("base64");
      } else {
        encoded = String(content);
      }

      return {
        filename,
        content: encoded,
        ...(contentType ? { content_type: contentType } : {}),
      };
    })
    .filter(Boolean);
}

async function sendViaResend({ from, to, subject, html, replyTo, bcc, attachments = [] }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is missing");

  const body = {
    from,
    to,
    subject,
    html,
  };

  if (replyTo) body.reply_to = replyTo;
  if (bcc) body.bcc = bcc;

  const normalisedAttachments = normaliseAttachments(attachments);
  if (normalisedAttachments.length > 0) {
    body.attachments = normalisedAttachments;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(json?.message || json?.error || "Resend email failed");
  }

  return json;
}

export async function sendJobEmail({
  subscriberId,
  jobId,
  templateKey,
  extraTags = {},
  attachments = [],
}) {
  const supabase = getSupabaseAdmin();

  if (!subscriberId) throw new Error("subscriberId is required");
  if (!jobId) throw new Error("jobId is required");
  if (!templateKey) throw new Error("templateKey is required");

  const { data: settings, error: settingsErr } = await supabase
    .from("email_settings")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (settingsErr) throw settingsErr;
  if (!settings?.is_enabled) {
    return { ok: false, skipped: true, reason: "Email settings disabled" };
  }

  const { data: template, error: templateErr } = await supabase
    .from("email_templates")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("template_key", templateKey)
    .maybeSingle();

  if (templateErr) throw templateErr;
  if (!template) {
    return { ok: false, skipped: true, reason: `Missing email template ${templateKey}` };
  }

  if (template.enabled === false) {
    return { ok: false, skipped: true, reason: `Template disabled ${templateKey}` };
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job) throw new Error("Job not found");

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("id", job.customer_id)
    .maybeSingle();

  if (customerErr) throw customerErr;
  if (!customer) throw new Error("Customer not found");

  const toEmail = asText(extraTags.to_email) || asText(customer.email);
  if (!toEmail) {
    return { ok: false, skipped: true, reason: "Customer has no email address" };
  }

  const fromName = asText(settings.from_name) || "Skip Hire";
  const fromEmail = asText(settings.from_email);
  if (!fromEmail) throw new Error("Email from_email is missing in settings");

  const collectedDate =
    job.collection_actual_date || extraTags.collected_date || extraTags.collection_date || "";

  const tags = {
    customer_name: customerName(customer),
    job_number: job.job_number || "",
    scheduled_date: job.scheduled_date || "",
    delivery_date: job.scheduled_date || "",
    collected_date: collectedDate,
    collection_date: collectedDate,
    site_address: siteAddress(job),
    site_postcode: job.site_postcode || "",
    price_inc_vat: job.price_inc_vat || "",
    payment_type: job.payment_type || "",
    terms_and_conditions: settings.terms_and_conditions || defaultTerms(),
    wtn_url: extraTags.wtn_url || "",
    waste_transfer_note_url: extraTags.wtn_url || "",
    ...extraTags,
  };

  const subject = replaceTags(template.subject, tags);
  const html = replaceTags(template.body_html, tags);

  let outboxId = null;

  const { data: outboxRow } = await supabase
    .from("email_outbox")
    .insert({
      subscriber_id: subscriberId,
      job_id: job.id,
      customer_id: customer.id,
      template_key: templateKey,
      to_email: toEmail,
      subject,
      body_html: html,
      status: "queued",
    })
    .select("id")
    .maybeSingle();

  outboxId = outboxRow?.id || null;

  try {
    const resendResult = await sendViaResend({
      from: `${fromName} <${fromEmail}>`,
      to: toEmail,
      subject,
      html,
      replyTo: asText(settings.reply_to) || undefined,
      bcc: settings.send_bcc && settings.bcc_email ? settings.bcc_email : undefined,
      attachments,
    });

    if (outboxId) {
      await supabase
        .from("email_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: resendResult?.id || null,
          error: null,
        })
        .eq("id", outboxId);
    }

    return {
      ok: true,
      sent: true,
      to_email: toEmail,
      template_key: templateKey,
      attachments: normaliseAttachments(attachments).map((a) => a.filename),
    };
  } catch (err) {
    if (outboxId) {
      await supabase
        .from("email_outbox")
        .update({
          status: "failed",
          error: String(err?.message || err),
        })
        .eq("id", outboxId);
    }

    throw err;
  }
}
