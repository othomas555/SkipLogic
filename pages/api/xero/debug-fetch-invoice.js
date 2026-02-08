import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getValidXeroClient } from "../../../lib/xeroOAuth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = await requireOfficeUser(req);
    if (!auth.ok) {
      return res.status(401).json({ ok: false, error: auth.error });
    }

    const { invoice_id } = req.body || {};
    if (!invoice_id) {
      return res.status(400).json({ ok: false, error: "invoice_id required" });
    }

    const xc = await getValidXeroClient(auth.subscriber_id);
    if (!xc?.tenantId) {
      return res.status(400).json({ ok: false, error: "No Xero tenant selected" });
    }

    const resp = await fetch(
      `${XERO_API_BASE}/Invoices/${invoice_id}`,
      {
        headers: {
          Authorization: `Bearer ${xc.accessToken}`,
          "Xero-tenant-id": xc.tenantId,
          Accept: "application/json",
        },
      }
    );

    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }

    return res.status(resp.ok ? 200 : resp.status).json({
      ok: resp.ok,
      status: resp.status,
      data: json,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
