// pages/api/xero/status.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getXeroConnection, getValidXeroClient } from "../../../lib/xeroOAuth";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const auth = await requireOfficeUser(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not signed in" });

  const subscriberId = auth.subscriber_id;

  try {
    const row = await getXeroConnection(subscriberId);
    if (!row) return res.json({ ok: true, connected: false });

    // also proves we can refresh token if needed
    const client = await getValidXeroClient(subscriberId);

    return res.json({
      ok: true,
      connected: true,
      tenant_id: client.tenantId,
      tenants: Array.isArray(row.tenants) ? row.tenants : [],
      expires_at: row.expires_at,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed to load status" });
  }
}
