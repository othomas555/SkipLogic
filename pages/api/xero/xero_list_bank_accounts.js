// pages/api/xero/xero_list_bank_accounts.js
//
// GET
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Debug + utility:
// - Returns type_counts for all accounts
// - Returns bank_accounts as RAW slices so we can see what fields exist
// - Returns bank_candidates where ANY field stringifies to include "BANK" (sanity check)
//
// Response:
// {
//   ok:true,
//   total_accounts,
//   type_counts,
//   bank_accounts_raw: [ ... up to 25 ],
//   bank_candidates_raw: [ ... up to 25 ]
// }

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

function looksBankAnywhere(obj) {
  try {
    const s = JSON.stringify(obj);
    return s.toUpperCase().includes("BANK");
  } catch {
    return false;
  }
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

    const type_counts = {};
    for (const a of accounts) {
      const t = norm(a?.Type);
      type_counts[t] = (type_counts[t] || 0) + 1;
    }

    // Collect the ones we *think* are BANK based on the same logic used in counts
    const bank_accounts_raw = [];
    for (const a of accounts) {
      if (norm(a?.Type) === "BANK") bank_accounts_raw.push(a);
      if (bank_accounts_raw.length >= 25) break;
    }

    // Sanity: any object that contains "BANK" anywhere in its JSON
    const bank_candidates_raw = [];
    for (const a of accounts) {
      if (looksBankAnywhere(a)) bank_candidates_raw.push(a);
      if (bank_candidates_raw.length >= 25) break;
    }

    return res.status(200).json({
      ok: true,
      total_accounts: accounts.length,
      type_counts,
      bank_accounts_raw,
      bank_candidates_raw,
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
