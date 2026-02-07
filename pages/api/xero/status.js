// pages/api/xero/status.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getXeroConnection, getValidXeroClient } from "../../../lib/xeroOAuth";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const auth = await requireOfficeUser(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error || "Not signed in" });

  try {
    const row = await getXeroConnection(auth.subscriber_id);
    if (!row) return res.json({ ok: true, connected: false });

    const client = await getValidXeroClient(auth.subscriber_id);

    return res.json({
      ok: true,
      connected: true,
      tenant_id: client.tenantId,
      tenants: Array.isArray(row.tenants) ? row.tenants : [],
      expires_at: row.expires_at,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed" });
  }
}
