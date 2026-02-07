// pages/api/xero/disconnect.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const auth = await requireOfficeUser(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not signed in" });

  const subscriberId = auth.subscriber_id;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("xero_connections").delete().eq("subscriber_id", subscriberId);

  if (error) return res.status(500).json({ ok: false, error: "Failed to disconnect" });

  return res.json({ ok: true });
}
