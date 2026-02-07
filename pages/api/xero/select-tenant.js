// pages/api/xero/select-tenant.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getXeroConnection } from "../../../lib/xeroOAuth";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const auth = await requireOfficeUser(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not signed in" });

  const subscriberId = auth.subscriber_id;

  const body = req.body && typeof req.body === "object" ? req.body : null;
  const tenantId = body?.tenant_id ? String(body.tenant_id) : "";
  if (!tenantId) return res.status(400).json({ ok: false, error: "Missing tenant_id" });

  try {
    const row = await getXeroConnection(subscriberId);
    if (!row) return res.status(400).json({ ok: false, error: "Xero not connected" });

    const tenants = Array.isArray(row.tenants) ? row.tenants : [];
    const found = tenants.find((t) => String(t.tenantId) === String(tenantId));
    if (!found) return res.status(400).json({ ok: false, error: "tenant_id not in connections list" });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("xero_connections")
      .update({ tenant_id: tenantId, updated_at: new Date().toISOString() })
      .eq("subscriber_id", subscriberId);

    if (error) return res.status(500).json({ ok: false, error: "Failed to save tenant" });

    return res.json({ ok: true, tenant_id: tenantId });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed" });
  }
}
