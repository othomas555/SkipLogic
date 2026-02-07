// pages/api/xero/status.js
import { getValidXeroClient, getXeroConnection } from "../../../lib/xeroOAuth";
import { getUserFromSession } from "../../../lib/auth"; // same note

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const auth = await getUserFromSession(req);
  if (!auth?.ok) return res.status(401).json({ ok: false, error: "Not signed in" });

  const subscriberId = auth.subscriber_id || auth.subscriberId;
  if (!subscriberId) return res.status(400).json({ ok: false, error: "Missing subscriber id" });

  try {
    const row = await getXeroConnection(subscriberId);
    if (!row) return res.json({ ok: true, connected: false });

    // prove we can refresh if needed
    const client = await getValidXeroClient(subscriberId);

    return res.json({
      ok: true,
      connected: true,
      tenant_id: client.tenantId,
      expires_at: row.expires_at,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed" });
  }
}
