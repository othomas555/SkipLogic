import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { requireOfficeUser } from "../../../../lib/requireOfficeUser";

function mergeTags() {
  return [
    "{{customer_name}}",
    "{{job_number}}",
    "{{skip_type}}",
    "{{site_address}}",
    "{{scheduled_date}}",
    "{{collection_date}}",
    "{{days_remaining}}",
    "{{hire_end_date}}",
    "{{extension_price}}",
    "{{extend_url}}",
    "{{collection_url}}",
  ];
}

function defaultTemplates() {
  return {
    booking_confirmed: {
      subject: "Your skip booking is confirmed",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111\"><p>Hi {{customer_name}},</p><p>Your skip booking for job <b>{{job_number}}</b> is confirmed.</p></div>",
    },
    skip_due_for_collection: {
      subject: "Your skip is booked for collection",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111\"><p>Hi {{customer_name}},</p><p>Your skip for job <b>{{job_number}}</b> has been booked for collection.</p></div>",
    },
    swap_scheduled: {
      subject: "Your skip swap is booked",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111\"><p>Hi {{customer_name}},</p><p>Your skip swap for job <b>{{job_number}}</b> has been booked.</p></div>",
    },
    collected_confirmation: {
      subject: "Your skip has been collected",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111\"><p>Hi {{customer_name}},</p><p>Your skip for job <b>{{job_number}}</b> has been collected.</p></div>",
    },
    term_ending_reminder: {
      subject: "Your skip hire is ending soon",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111\"><p>Hi {{customer_name}},</p><p>Your skip hire for job <b>{{job_number}}</b> is ending soon.</p></div>",
    },
    term_hire_reminder_1: {
      subject: "Your skip hire is ending in {{days_remaining}} days",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111\"><p>Hi {{customer_name}},</p><p>Your skip hire for job <b>{{job_number}}</b> is ending in <b>{{days_remaining}} days</b>.</p><p>If you still need the skip, you can extend it for <b>£{{extension_price}} per week</b>.</p><p style=\"margin:24px 0\"><a href=\"{{extend_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#111;color:#fff;text-decoration:none;font-weight:bold;margin-right:10px;\">Extend hire</a><a href=\"{{collection_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#f3f4f6;color:#111;text-decoration:none;font-weight:bold;\">Book collection</a></p><p>Site: {{site_address}}</p><p>Hire end date: {{hire_end_date}}</p></div>",
    },
    term_hire_reminder_2: {
      subject: "Reminder: your skip hire is ending soon",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111\"><p>Hi {{customer_name}},</p><p>This is a reminder that your skip hire for job <b>{{job_number}}</b> is ending in <b>{{days_remaining}} days</b>.</p><p>To keep the skip, extend now for <b>£{{extension_price}} per week</b>.</p><p style=\"margin:24px 0\"><a href=\"{{extend_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#111;color:#fff;text-decoration:none;font-weight:bold;margin-right:10px;\">Extend hire</a><a href=\"{{collection_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#f3f4f6;color:#111;text-decoration:none;font-weight:bold;\">Book collection</a></p><p>Site: {{site_address}}</p><p>Hire end date: {{hire_end_date}}</p></div>",
    },
    term_hire_final_notice: {
      subject: "Final notice: your skip is now due for collection",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111\"><p>Hi {{customer_name}},</p><p>Your skip hire for job <b>{{job_number}}</b> is now due to end.</p><p>If you still need the skip, you must extend now for <b>£{{extension_price}} per week</b>. Otherwise it may be booked for collection.</p><p style=\"margin:24px 0\"><a href=\"{{extend_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#111;color:#fff;text-decoration:none;font-weight:bold;margin-right:10px;\">Extend now</a><a href=\"{{collection_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#f3f4f6;color:#111;text-decoration:none;font-weight:bold;\">Book collection</a></p><p>Site: {{site_address}}</p><p>Hire end date: {{hire_end_date}}</p></div>",
    },
  };
}

async function ensureSettingsRow(supabase, subscriberId) {
  const { data: existing, error: selectError } = await supabase
    .from("email_settings")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const insertPayload = {
    subscriber_id: subscriberId,
    provider: "resend",
    is_enabled: false,
    from_name: "",
    from_email: "",
    reply_to: "",
    send_bcc: false,
    bcc_email: "",
    term_hire_enabled: false,
    term_hire_default_days: 14,
    term_hire_reminder_1_days_before: 4,
    term_hire_reminder_2_days_before: 2,
    term_hire_final_notice_enabled: true,
    term_hire_extension_price_per_week: 0,
    term_hire_auto_book_collection: false,
    term_hire_email_enabled: true,
    term_hire_sms_enabled: false,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("email_settings")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError) throw insertError;
  return inserted;
}

async function ensureTemplateRows(supabase, subscriberId, defaults) {
  const keys = Object.keys(defaults || {});
  if (!keys.length) return [];

  const { data: existingRows, error: selectError } = await supabase
    .from("email_templates")
    .select("*")
    .eq("subscriber_id", subscriberId);

  if (selectError) throw selectError;

  const existing = Array.isArray(existingRows) ? existingRows : [];
  const existingKeys = new Set(existing.map((x) => x.template_key));
  const missing = keys.filter((k) => !existingKeys.has(k));

  if (missing.length) {
    const inserts = missing.map((templateKey) => ({
      subscriber_id: subscriberId,
      template_key: templateKey,
      enabled: true,
      subject: defaults[templateKey]?.subject || "",
      body_html: defaults[templateKey]?.body_html || "",
      updated_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase.from("email_templates").insert(inserts);
    if (insertError) throw insertError;
  }

  const { data: finalRows, error: finalError } = await supabase
    .from("email_templates")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .order("updated_at", { ascending: false });

  if (finalError) throw finalError;
  return Array.isArray(finalRows) ? finalRows : [];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await requireOfficeUser(req);
    if (!auth?.ok) {
      return res.status(401).json({ ok: false, error: auth?.error || "Unauthorized" });
    }

    const subscriberId = auth.subscriber_id;
    const supabase = getSupabaseAdmin();

    const defaults = defaultTemplates();
    const settings = await ensureSettingsRow(supabase, subscriberId);
    const templates = await ensureTemplateRows(supabase, subscriberId, defaults);

    const { data: outboxRows, error: outboxError } = await supabase
      .from("email_outbox")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (outboxError) throw outboxError;

    return res.status(200).json({
      ok: true,
      settings,
      templates,
      defaults,
      outbox: Array.isArray(outboxRows) ? outboxRows : [],
      merge_tags: mergeTags(),
    });
  } catch (error) {
    console.error("emails/get error", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to load email settings",
    });
  }
}
