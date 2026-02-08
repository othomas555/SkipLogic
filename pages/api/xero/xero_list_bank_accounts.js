// pages/api/xero/xero_list_bank_accounts.js
//
// GET
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Purpose:
// - Returns accounts that Xero considers BANK accounts (used for Payments)
// - Also returns deterministic debug info: counts by Type + a small sample
//
// Response:
// {
//   ok:true,
//   total_accounts: number,
//   type_counts: { [type]: count },
//   bank_accounts: [{ Code, Name, Type, Status, BankAccountNumber }],
//   sample_accounts: [{ Code, Name, Type, Class, Status }]
// }

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getValidXeroClient } from "../../../lib/xeroOAuth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

function normType(x) {
  return String(x || "").trim().toUpperCase();
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
    if (!xc?.tenantId) {
      return res.status(400).json({ ok: false, error: "Xero connected but no organisation selected" });
    }

    const out = await xeroRequest({
      accessToken: xc.accessToken,
      tenantId: xc.tenantId,
      path: "/Accounts",
      method: "GET",
    });

    const accounts = Array.isArray(out?.Accounts) ? out.Accounts : [];

    // Count by normalized Type
    const typeCounts = {};
    for (const a of accounts) {
      const t = normType(a?.Type);
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }

    // BANK accounts (case/spacing tolerant)
    const bankAccounts = accounts
      .filter((a) => normType(a?.Type) === "BANK")
      .map((a) => ({
        Code: a?.Code ? String(a.Code) : null,
        Name: a?.Name ? String(a.Name) : null,
        Type: a?.Type ? String(a.Type) : null,
        Status: a?.Status ? String(a.Status) : null,
        BankAccountNumber: a?.BankAccountNumber ? String(a.BankAccountNumber) : null,
      }))
      .filter((a) => a.Code)
      .sort((a, b) => String(a.Code).localeCompare(String(b.Code)));

    // Small deterministic sample to see what Types actually look like in your org
    const sampleAccounts = accounts.slice(0, 20).map((a) => ({
      Code: a?.Code ? String(a.Code) : null,
      Name: a?.Name ? String(a.Name) : null,
      Type: a?.Type ? String(a.Type) : null,
      Class: a?.Class ? String(a.Class) : null,
      Status: a?.Status ? String(a.Status) : null,
    }));

    return res.status(200).json({
      ok: true,
      total_accounts: accounts.length,
      type_counts: typeCounts,
      bank_accounts: bankAccounts,
      sample_accounts: sampleAccounts,
    });
  } catch (err) {
    console.error("xero_list_bank_accounts error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
