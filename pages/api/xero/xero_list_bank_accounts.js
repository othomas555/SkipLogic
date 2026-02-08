// pages/api/xero/xero_list_bank_accounts.js
//
// GET
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Returns BANK accounts from Xero with AccountID (UUID) so we can use it for Payments.
// (Some orgs do not populate Account Code for bank accounts.)
//
// Response:
// { ok:true, accounts:[{ AccountID, Code, Name, Type, Status, BankAccountNumber }] }

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getValidXeroClient } from "../../../lib/xeroOAuth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

function norm(x) {
  return String(x ?? "").trim().toUpperCase();
}

async function xeroRequest({ accessToken, tenantId, path, method = "GET" }) {
  const url = `${XERO_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
    },
  });

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

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = String(auth.subscriber_id || "");
    if (!subscriberId) return res.status(401).json({ ok: false, error: "No subscriber in auth context" });

    const xc = await getValidXeroClient(subscriberId);
    if (!xc?.tenantId) return res.status(400).json({ ok: false, error: "Xero connected but no organisation selected" });

    const out = await xeroRequest({
      accessToken: xc.accessToken,
      tenantId: xc.tenantId,
      path: "/Accounts",
      method: "GET",
    });

    const accounts = Array.isArray(out?.Accounts) ? out.Accounts : [];

    const bank = accounts
      .filter((a) => norm(a?.Type) === "BANK")
      .map((a) => ({
        AccountID: a?.AccountID ? String(a.AccountID) : null,
        Code: a?.Code != null && String(a.Code).trim() !== "" ? String(a.Code) : null,
        Name: a?.Name ? String(a.Name) : null,
        Type: a?.Type ? String(a.Type) : null,
        Status: a?.Status ? String(a.Status) : null,
        BankAccountNumber: a?.BankAccountNumber ? String(a.BankAccountNumber) : null,
      }))
      .filter((a) => a.AccountID) // MUST have AccountID
      .sort((a, b) => String(a.Name || "").localeCompare(String(b.Name || "")));

    return res.status(200).json({ ok: true, accounts: bank });
  } catch (err) {
    console.error("xero_list_bank_accounts error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
