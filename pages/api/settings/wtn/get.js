import { requireOfficeUser } from "../../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function defaultSettings() {
  return {
    wtn_prefix: "WTN",
    company_name: "",
    company_address: "",
    waste_carrier_registration: "",
    environmental_permit_number: "",
    default_sic_code: "",
    default_ewc_code: "17 09 04",
    default_waste_description: "Mixed construction and demolition waste",
    default_container_type: "Skip",
    default_destination_site: "",
    declaration_text:
      "I confirm that the waste transfer described on this note is accurate and that the waste hierarchy has been considered.",
    footer_text: "",
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = auth.subscriber_id;
    const supabase = getSupabaseAdmin();

    const { data: settings, error: settingsErr } = await supabase
      .from("wtn_settings")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (settingsErr) throw settingsErr;

    const { data: recentRecords, error: recordsErr } = await supabase
      .from("wtn_records")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (recordsErr) throw recordsErr;

    return res.status(200).json({
      ok: true,
      settings: { ...defaultSettings(), ...(settings || {}) },
      recent_records: Array.isArray(recentRecords) ? recentRecords : [],
    });
  } catch (err) {
    console.error("settings/wtn/get error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to load WTN settings",
    });
  }
}
