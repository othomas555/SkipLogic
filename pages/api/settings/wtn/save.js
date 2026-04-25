import { requireOfficeUser } from "../../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = auth.subscriber_id;
    const supabase = getSupabaseAdmin();
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const payload = {
      subscriber_id: subscriberId,
      wtn_prefix: asText(body.wtn_prefix) || "WTN",
      company_name: asText(body.company_name),
      company_address: asText(body.company_address),
      waste_carrier_registration: asText(body.waste_carrier_registration),
      environmental_permit_number: asText(body.environmental_permit_number),
      default_sic_code: asText(body.default_sic_code),
      default_ewc_code: asText(body.default_ewc_code) || "17 09 04",
      default_waste_description:
        asText(body.default_waste_description) || "Mixed construction and demolition waste",
      default_container_type: asText(body.default_container_type) || "Skip",
      default_destination_site: asText(body.default_destination_site),
      declaration_text:
        asText(body.declaration_text) ||
        "I confirm that the waste transfer described on this note is accurate and that the waste hierarchy has been considered.",
      footer_text: asText(body.footer_text),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("wtn_settings")
      .upsert(payload, { onConflict: "subscriber_id" })
      .select("*")
      .single();

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      settings: data,
    });
  } catch (err) {
    console.error("settings/wtn/save error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to save WTN settings",
    });
  }
}
