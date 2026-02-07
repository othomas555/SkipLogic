// pages/api/xero/disconnect.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const auth = await requireOfficeUser(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error || "Not signed in" });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("xero_connections").delete().eq("subscriber_id", auth.subscriber_id);

  if (error) return res.status(500).json({ ok: false, error: "Failed to disconnect" });

  return res.json({ ok: true });
}
