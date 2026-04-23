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
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;background:#f8fafc;padding:24px\"><div style=\"max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden\"><div style=\"padding:20px 24px;background:#111827;color:#ffffff\"><div style=\"font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8\">SkipLogic</div><h1 style=\"margin:8px 0 0;font-size:24px;line-height:1.2\">Booking confirmed</h1></div><div style=\"padding:24px\"><p style=\"margin-top:0\">Hi {{customer_name}},</p><p>Your skip booking for job <strong>{{job_number}}</strong> is confirmed.</p><p>We will be in touch if we need anything further.</p></div></div></div>",
    },
    skip_due_for_collection: {
      subject: "Your skip is booked for collection",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;background:#f8fafc;padding:24px\"><div style=\"max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden\"><div style=\"padding:20px 24px;background:#111827;color:#ffffff\"><div style=\"font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8\">SkipLogic</div><h1 style=\"margin:8px 0 0;font-size:24px;line-height:1.2\">Collection booked</h1></div><div style=\"padding:24px\"><p style=\"margin-top:0\">Hi {{customer_name}},</p><p>Your skip for job <strong>{{job_number}}</strong> has been booked for collection.</p></div></div></div>",
    },
    swap_scheduled: {
      subject: "Your skip swap is booked",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;background:#f8fafc;padding:24px\"><div style=\"max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden\"><div style=\"padding:20px 24px;background:#111827;color:#ffffff\"><div style=\"font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8\">SkipLogic</div><h1 style=\"margin:8px 0 0;font-size:24px;line-height:1.2\">Swap booked</h1></div><div style=\"padding:24px\"><p style=\"margin-top:0\">Hi {{customer_name}},</p><p>Your skip swap for job <strong>{{job_number}}</strong> has been booked.</p></div></div></div>",
    },
    collected_confirmation: {
      subject: "Your skip has been collected",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;background:#f8fafc;padding:24px\"><div style=\"max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden\"><div style=\"padding:20px 24px;background:#111827;color:#ffffff\"><div style=\"font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8\">SkipLogic</div><h1 style=\"margin:8px 0 0;font-size:24px;line-height:1.2\">Skip collected</h1></div><div style=\"padding:24px\"><p style=\"margin-top:0\">Hi {{customer_name}},</p><p>Your skip for job <strong>{{job_number}}</strong> has been collected.</p></div></div></div>",
    },
    term_ending_reminder: {
      subject: "Your skip hire is ending soon",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;background:#f8fafc;padding:24px\"><div style=\"max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden\"><div style=\"padding:20px 24px;background:#111827;color:#ffffff\"><div style=\"font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8\">SkipLogic</div><h1 style=\"margin:8px 0 0;font-size:24px;line-height:1.2\">Hire ending soon</h1></div><div style=\"padding:24px\"><p style=\"margin-top:0\">Hi {{customer_name}},</p><p>Your skip hire for job <strong>{{job_number}}</strong> is ending soon.</p></div></div></div>",
    },
    term_hire_reminder_1: {
      subject: "Your skip hire is ending in {{days_remaining}} days",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;background:#f8fafc;padding:24px\"><div style=\"max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden\"><div style=\"padding:20px 24px;background:#111827;color:#ffffff\"><div style=\"font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8\">SkipLogic</div><h1 style=\"margin:8px 0 0;font-size:24px;line-height:1.2\">Your skip hire is ending soon</h1></div><div style=\"padding:24px\"><p style=\"margin-top:0\">Hi {{customer_name}},</p><p>Just a quick reminder that your skip hire for job <strong>{{job_number}}</strong> is due to end in <strong>{{days_remaining}} days</strong>.</p><p><strong>Hire end date:</strong> {{hire_end_date}}<br /><strong>Site:</strong> {{site_address}}</p><p>If you still need the skip, you can extend it online for <strong>£{{extension_price}} per week</strong>.</p><div style=\"margin:24px 0\"><a href=\"{{extend_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:10px;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold;margin-right:10px\">Extend hire</a><a href=\"{{collection_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:10px;background:#f3f4f6;color:#111827;text-decoration:none;font-weight:bold\">Book collection</a></div><p style=\"margin-bottom:0;color:#4b5563\">If you have any questions, just reply to this email.</p></div></div></div>",
    },
    term_hire_reminder_2: {
      subject: "Reminder: your skip hire is ending soon",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;background:#f8fafc;padding:24px\"><div style=\"max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden\"><div style=\"padding:20px 24px;background:#111827;color:#ffffff\"><div style=\"font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8\">SkipLogic</div><h1 style=\"margin:8px 0 0;font-size:24px;line-height:1.2\">Reminder: hire ending soon</h1></div><div style=\"padding:24px\"><p style=\"margin-top:0\">Hi {{customer_name}},</p><p>This is another reminder that your skip hire for job <strong>{{job_number}}</strong> is due to end in <strong>{{days_remaining}} days</strong>.</p><p><strong>Hire end date:</strong> {{hire_end_date}}<br /><strong>Site:</strong> {{site_address}}</p><p>If you need more time, you can extend online for <strong>£{{extension_price}} per week</strong>.</p><div style=\"margin:24px 0\"><a href=\"{{extend_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:10px;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold;margin-right:10px\">Extend hire</a><a href=\"{{collection_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:10px;background:#f3f4f6;color:#111827;text-decoration:none;font-weight:bold\">Book collection</a></div><p style=\"margin-bottom:0;color:#4b5563\">If you no longer need the skip, please book collection using the button above.</p></div></div></div>",
    },
    term_hire_final_notice: {
      subject: "Final notice: your skip is now due for collection",
      body_html:
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;background:#f8fafc;padding:24px\"><div style=\"max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden\"><div style=\"padding:20px 24px;background:#7f1d1d;color:#ffffff\"><div style=\"font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8\">SkipLogic</div><h1 style=\"margin:8px 0 0;font-size:24px;line-height:1.2\">Final notice</h1></div><div style=\"padding:24px\"><p style=\"margin-top:0\">Hi {{customer_name}},</p><p>Your skip hire for job <strong>{{job_number}}</strong> is now due to end.</p><p><strong>Hire end date:</strong> {{hire_end_date}}<br /><strong>Site:</strong> {{site_address}}</p><p>If you still need the skip, please extend it now for <strong>£{{extension_price}} per week</strong>. Otherwise, book collection below.</p><div style=\"margin:24px 0\"><a href=\"{{extend_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:10px;background:#111827;color:#ffffff;text-decoration:none;font-weight:bold;margin-right:10px\">Extend now</a><a href=\"{{collection_url}}\" style=\"display:inline-block;padding:12px 18px;border-radius:10px;background:#f3f4f6;color:#111827;text-decoration:none;font-weight:bold\">Book collection</a></div><p style=\"margin-bottom:0;color:#4b5563\">If nothing is booked, the skip may be scheduled for collection.</p></div></div></div>",
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

  const { data: subscriberRow, error: subscriberError } = await supabase
    .from("subscribers")
    .select("term_hire_days")
    .eq("id", subscriberId)
    .maybeSingle();

  if (subscriberError) throw subscriberError;

  const subscriberDefaultHireDays = Number(subscriberRow?.term_hire_days);
  const initialHireDays =
    Number.isFinite(subscriberDefaultHireDays) && subscriberDefaultHireDays > 0
      ? Math.trunc(subscriberDefaultHireDays)
      : 14;

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
    term_hire_default_days: initialHireDays,
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

async function loadRecentJobs(supabase, subscriberId) {
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(`
      id,
      job_number,
      job_status,
      scheduled_date,
      delivery_actual_date,
      collection_date,
      collection_actual_date,
      term_hire_end_date,
      customer_id,
      site_postcode,
      customers:customer_id (
        company_name,
        first_name,
        last_name
      )
    `)
    .eq("subscriber_id", subscriberId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return Array.isArray(jobs) ? jobs.map((j) => {
    const c = Array.isArray(j.customers) ? j.customers[0] : j.customers;
    const company = c?.company_name || "";
    const person = [c?.first_name || "", c?.last_name || ""].join(" ").trim();
    const customerLabel = company || person || "Customer";

    return {
      id: j.id,
      job_number: j.job_number || "",
      job_status: j.job_status || "",
      scheduled_date: j.scheduled_date || null,
      delivery_actual_date: j.delivery_actual_date || null,
      collection_date: j.collection_date || null,
      collection_actual_date: j.collection_actual_date || null,
      term_hire_end_date: j.term_hire_end_date || null,
      customer_label: customerLabel,
      site_postcode: j.site_postcode || "",
    };
  }) : [];
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
    const recentJobs = await loadRecentJobs(supabase, subscriberId);

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
      recent_jobs: recentJobs,
      office_email: auth?.user?.email || "",
    });
  } catch (error) {
    console.error("emails/get error", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to load email settings",
    });
  }
}
