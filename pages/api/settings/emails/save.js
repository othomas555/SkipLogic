import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { requireOfficeUser } from "../../../../lib/requireOfficeUser";

const ALLOWED_TEMPLATE_KEYS = new Set([
  "booking_confirmed",
  "skip_due_for_collection",
  "swap_scheduled",
  "collected_confirmation",
  "term_ending_reminder",
  "term_hire_reminder_1",
  "term_hire_reminder_2",
  "term_hire_final_notice",
]);

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function asBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v == null) return fallback;
  return !!v;
}

function asInt(v, fallback, min = null, max = null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  let x = Math.trunc(n);
  if (min != null) x = Math.max(min, x);
  if (max != null) x = Math.min(max, x);
  return x;
}

function asMoney(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n * 100) / 100;
}

function normaliseSettings(raw) {
  const s = raw || {};
  return {
    provider: asText(s.provider || "resend") || "resend",
    is_enabled: asBool(s.is_enabled, false),
    from_name: asText(s.from_name),
    from_email: asText(s.from_email),
    reply_to: asText(s.reply_to),
    send_bcc: asBool(s.send_bcc, false),
    bcc_email: asText(s.bcc_email),

    term_hire_enabled: asBool(s.term_hire_enabled, false),
    term_hire_default_days: asInt(s.term_hire_default_days, 14, 1, 365),
    term_hire_reminder_1_days_before: asInt(
      s.term_hire_reminder_1_days_before,
      4,
      0,
      365
    ),
    term_hire_reminder_2_days_before: asInt(
      s.term_hire_reminder_2_days_before,
      2,
      0,
      365
    ),
    term_hire_final_notice_enabled: asBool(s.term_hire_final_notice_enabled, true),
    term_hire_extension_price_per_week: asMoney(
      s.term_hire_extension_price_per_week,
      0
    ),
    term_hire_auto_book_collection: asBool(
      s.term_hire_auto_book_collection,
      false
    ),
    term_hire_email_enabled: asBool(s.term_hire_email_enabled, true),
    term_hire_sms_enabled: asBool(s.term_hire_sms_enabled, false),
  };
}

function normaliseTemplate(t) {
  return {
    template_key: asText(t?.template_key),
    enabled: asBool(t?.enabled, true),
    subject: String(t?.subject || ""),
    body_html: String(t?.body_html || ""),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await requireOfficeUser(req);
    if (!auth?.ok) {
      return res.status(401).json({ ok: false, error: auth?.error || "Unauthorized" });
    }

    const subscriberId = auth.subscriber_id;
    const supabase = getSupabaseAdmin();

    const body = req.body || {};
    const settings = normaliseSettings(body.settings || {});
    const templates = Array.isArray(body.templates) ? body.templates : [];

    if (
      settings.term_hire_reminder_2_days_before >
      settings.term_hire_reminder_1_days_before
    ) {
      return res.status(400).json({
        ok: false,
        error: "Second reminder must be closer to the end date than the first reminder.",
      });
    }

    const nowIso = new Date().toISOString();

    const settingsPayload = {
      subscriber_id: subscriberId,
      ...settings,
      updated_at: nowIso,
    };

    const { error: settingsError } = await supabase
      .from("email_settings")
      .upsert(settingsPayload, { onConflict: "subscriber_id" });

    if (settingsError) throw settingsError;

    const { error: subscriberError } = await supabase
      .from("subscribers")
      .update({
        term_hire_days: settings.term_hire_default_days,
      })
      .eq("id", subscriberId);

    if (subscriberError) throw subscriberError;

    const cleanedTemplates = templates
      .map(normaliseTemplate)
      .filter((t) => t.template_key && ALLOWED_TEMPLATE_KEYS.has(t.template_key));

    if (cleanedTemplates.length) {
      const templatePayload = cleanedTemplates.map((t) => ({
        subscriber_id: subscriberId,
        template_key: t.template_key,
        enabled: t.enabled,
        subject: t.subject,
        body_html: t.body_html,
        updated_at: nowIso,
      }));

      const { error: templatesError } = await supabase
        .from("email_templates")
        .upsert(templatePayload, {
          onConflict: "subscriber_id,template_key",
        });

      if (templatesError) throw templatesError;
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("emails/save error", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to save email settings",
    });
  }
}
