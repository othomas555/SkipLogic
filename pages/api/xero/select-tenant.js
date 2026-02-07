// pages/api/xero/select-tenant.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getXeroConnection } from "../../../lib/xeroOAuth";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const auth = await requireOfficeUser(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error || "Not signed in" });

  const tenantId = req.body?.tenant_id ? String(req.body.tenant_id) : "";
  if (!tenantId) return res.status(400).json({ ok: false, error: "Missing tenant_id" });

  const row = await getXeroConnection(auth.subscriber_id);
  if (!row) return res.status(400).json({ ok: false, error: "Xero not connected" });

  const tenants = Array.isArray(row.tenants) ? row.tenants : [];
  const found = tenants.find((t) => String(t.tenantId) === tenantId);
  if (!found) return res.status(400).json({ ok: false, error: "tenant_id not in connections list" });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("xero_connections")
    .update({ tenant_id: tenantId, updated_at: new Date().toISOString() })
    .eq("subscriber_id", auth.subscriber_id);

  if (error) return res.status(500).json({ ok: false, error: "Failed to save tenant" });

  return res.json({ ok: true, tenant_id: tenantId });
}
