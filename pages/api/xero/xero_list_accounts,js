// pages/api/xero/xero_list_accounts.js
//
// GET
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Returns Xero chart of accounts for the subscriber's connected tenant.
//
// Why this exists:
// - Tenants should not have to manually copy/paste AccountID UUIDs.
// - UI will use this endpoint to show dropdowns by Name and store AccountID/Code.
//
// Response:
// { ok:true, accounts:[{ AccountID, Code, Name, Type, Class, Status, BankAccountNumber, EnablePaymentsToAccount }] }

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getValidXeroClient } from "../../../lib/xeroOAuth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

async function xeroRequest({ accessToken, tenantId, path, method = "GET" }) {
  const url = `${XERO_API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Xero-tenant-id": tenantId,
    Accept: "application/json",
  };

  const res = await fetch(url, { method, headers });
  const text = await res.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Xero request failed: ${res.status} ${res.statusText} – ${text}`);
  }

  return json;
}

function normalizeAccount(a) {
  return {
    AccountID: a?.AccountID ? String(a.AccountID) : null,
    Code: a?.Code == null ? null : String(a.Code),
    Name: a?.Name == null ? null : String(a.Name),
    Type: a?.Type == null ? null : String(a.Type),
    Class: a?.Class == null ? null : String(a.Class),
    Status: a?.Status == null ? null : String(a.Status),
    BankAccountNumber: a?.BankAccountNumber == null ? null : String(a.BankAccountNumber),
    EnablePaymentsToAccount: a?.EnablePaymentsToAccount === true,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = String(auth.subscriber_id || "");
    if (!subscriberId) return res.status(400).json({ ok: false, error: "Missing subscriber_id" });

    const xc = await getValidXeroClient(subscriberId);
    if (!xc?.tenantId) return res.status(400).json({ ok: false, error: "Xero connected but no organisation selected" });

    const accessToken = xc.accessToken;
    const tenantId = xc.tenantId;

    const out = await xeroRequest({
      accessToken,
      tenantId,
      path: "/Accounts",
      method: "GET",
    });

    const accountsRaw = Array.isArray(out?.Accounts) ? out.Accounts : [];
    const accounts = accountsRaw.map(normalizeAccount);

    // Deterministic sort: BANK first, then Name asc, then Code asc
    accounts.sort((a, b) => {
      const aBank = a.Type === "BANK" ? 0 : 1;
      const bBank = b.Type === "BANK" ? 0 : 1;
      if (aBank !== bBank) return aBank - bBank;

      const an = (a.Name || "").toLowerCase();
      const bn = (b.Name || "").toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;

      const ac = (a.Code || "").toLowerCase();
      const bc = (b.Code || "").toLowerCase();
      if (ac < bc) return -1;
      if (ac > bc) return 1;
      return 0;
    });

    return res.status(200).json({
      ok: true,
      accounts,
    });
  } catch (err) {
    console.error("xero_list_accounts error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
