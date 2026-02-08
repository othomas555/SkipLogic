// pages/app/settings/invoicing.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}

function looksLikeUuid(x) {
  const v = asText(x);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

function normalizeCategories(arr) {
  const items = safeArray(arr)
    .map((x) => ({
      key: asText(x?.key),
      label: asText(x?.label),
      account_code: asText(x?.account_code),
      enabled: x?.enabled === false ? false : true,
      sort: Number.isFinite(Number(x?.sort)) ? Number(x.sort) : 0,
      vat_rate: asText(x?.vat_rate), // optional for later
    }))
    .filter((x) => x.key || x.label || x.account_code);

  items.sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(a.key).localeCompare(String(b.key)));
  return items;
}

function validateAccountCode(code, name) {
  const v = asText(code);
  if (!v) return `${name} is required`;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return `${name} has invalid characters`;
  if (v.length > 50) return `${name} is too long`;
  return null;
}

function validateBankAccountKey(value, name) {
  const v = asText(value);
  if (!v) return `${name} is required`;
  // allow either AccountID (uuid) or Code (legacy)
  if (looksLikeUuid(v)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return `${name} must be a Xero AccountID (uuid) or an account Code`;
  if (v.length > 80) return `${name} is too long`;
  return null;
}

function validateCategoryRow(row, idx) {
  const key = asText(row.key);
  const label = asText(row.label);
  const account = asText(row.account_code);

  if (!key) return `Category #${idx + 1}: key is required (e.g. haulage)`;
  if (!/^[a-z0-9_-]+$/.test(key)) return `Category #${idx + 1}: key must be lower-case letters/numbers/_/-`;
  if (!label) return `Category #${idx + 1}: label is required`;
  if (!account) return `Category #${idx + 1}: account_code is required`;
  if (!/^[A-Za-z0-9_-]+$/.test(account)) return `Category #${idx + 1}: account_code has invalid characters`;
  return null;
}

function displayBankOptionLabel(a) {
  const name = asText(a?.Name) || "Unnamed";
  const status = asText(a?.Status) || "";
  // BANK accounts often have Code null; keep it short
  const extra = status && status !== "ACTIVE" ? ` (${status})` : "";
  return `${name}${extra}`;
}

function displayRevenueOptionLabel(a) {
  const name = asText(a?.Name) || "Unnamed";
  const code = asText(a?.Code) || "";
  const status = asText(a?.Status) || "";
  const extra = status && status !== "ACTIVE" ? ` (${status})` : "";
  return code ? `${code} — ${name}${extra}` : `${name}${extra}`;
}

export default function InvoicingSettingsPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // Revenue codes (stored as Code)
  const [skipHireCode, setSkipHireCode] = useState("200");
  const [permitCode, setPermitCode] = useState("215");

  // BANK accounts (stored as AccountID preferred; Code allowed legacy)
  const [cardClearingAccountKey, setCardClearingAccountKey] = useState("");
  const [cashBankAccountKey, setCashBankAccountKey] = useState("");

  const [useDefaultsWhenMissing, setUseDefaultsWhenMissing] = useState(true);
  const [categories, setCategories] = useState([]);

  // Xero accounts list for dropdowns
  const [xeroAccounts, setXeroAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsErr, setAccountsErr] = useState("");

  const categoriesSorted = useMemo(() => normalizeCategories(categories), [categories]);

  const bankAccounts = useMemo(() => {
    const all = safeArray(xeroAccounts);
    const list = all.filter((a) => String(a?.Type || "") === "BANK");
    // Stable order: Name asc
    list.sort((a, b) => String(a?.Name || "").localeCompare(String(b?.Name || "")));
    return list;
  }, [xeroAccounts]);

  const revenueAccounts = useMemo(() => {
    const all = safeArray(xeroAccounts);
    const list = all
      .filter((a) => String(a?.Type || "") === "REVENUE")
      .filter((a) => !!asText(a?.Code)); // revenue must have Code to be usable
    // Stable: Code asc
    list.sort((a, b) => String(a?.Code || "").localeCompare(String(b?.Code || "")));
    return list;
  }, [xeroAccounts]);

  async function loadXeroAccounts() {
    setAccountsErr("");
    setAccountsLoading(true);

    const token = await getAccessToken();
    if (!token) {
      setAccountsErr("You must be signed in.");
      setAccountsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/xero/xero_list_accounts", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setAccountsErr(json?.error || json?.details || `Could not load Xero accounts (HTTP ${res.status})`);
        setAccountsLoading(false);
        return;
      }

      setXeroAccounts(Array.isArray(json.accounts) ? json.accounts : []);
      setAccountsLoading(false);
    } catch (e) {
      setAccountsErr(String(e?.message || e));
      setAccountsLoading(false);
    }
  }

  useEffect(() => {
    async function load() {
      if (checking) return;

      if (!user) {
        setLoading(false);
        return;
      }

      if (!subscriberId) {
        setErrorMsg("No subscriber found for this user.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg("");
      setOkMsg("");

      const token = await getAccessToken();
      if (!token) {
        setErrorMsg("You must be signed in.");
        setLoading(false);
        return;
      }

      // Load invoicing settings
      const res = await fetch("/api/settings/invoicing", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErrorMsg(json?.error || "Could not load invoicing settings.");
        setLoading(false);
        return;
      }

      const s = json.settings || {};
      setSkipHireCode(asText(s.skip_hire_sales_account_code) || "200");
      setPermitCode(asText(s.permit_sales_account_code) || "215");

      // IMPORTANT: these can be AccountID (uuid) OR Code (legacy)
      setCardClearingAccountKey(asText(s.card_clearing_account_code) || "");
      setCashBankAccountKey(asText(s.cash_bank_account_code) || "");

      setUseDefaultsWhenMissing(s.use_defaults_when_missing === false ? false : true);
      setCategories(normalizeCategories(s.sales_categories));

      // Load Xero accounts in parallel for dropdowns
      await loadXeroAccounts();

      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId]);

  function addCategory() {
    const next = [
      ...categoriesSorted,
      { key: "", label: "", account_code: "", enabled: true, sort: (categoriesSorted.length + 1) * 10, vat_rate: "" },
    ];
    setCategories(next);
    setOkMsg("");
    setErrorMsg("");
  }

  function updateCategory(idx, patch) {
    const next = categoriesSorted.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    setCategories(next);
    setOkMsg("");
    setErrorMsg("");
  }

  function deleteCategory(idx) {
    const next = categoriesSorted.filter((_, i) => i !== idx);
    setCategories(next);
    setOkMsg("");
    setErrorMsg("");
  }

  function bankAccountValueForSelect(a) {
    // We prefer AccountID always (works even when Code is null)
    const id = asText(a?.AccountID);
    if (id) return id;
    const code = asText(a?.Code);
    return code;
  }

  async function save() {
    setSaving(true);
    setErrorMsg("");
    setOkMsg("");

    const errors = [];

    // Revenue codes must be Code
    const e1 = validateAccountCode(skipHireCode, "Skip hire sales account code");
    const e2 = validateAccountCode(permitCode, "Permit sales account code");
    if (e1) errors.push(e1);
    if (e2) errors.push(e2);

    // BANK keys can be AccountID or Code
    const e3 = validateBankAccountKey(cardClearingAccountKey, "Card clearing account");
    const e4 = validateBankAccountKey(cashBankAccountKey, "Cash bank account");
    if (e3) errors.push(e3);
    if (e4) errors.push(e4);

    // validate categories
    const seenKeys = new Set();
    for (let i = 0; i < categoriesSorted.length; i++) {
      const row = categoriesSorted[i];
      const err = validateCategoryRow(row, i);
      if (err) errors.push(err);

      const k = asText(row.key);
      if (k) {
        if (seenKeys.has(k)) errors.push(`Duplicate category key: "${k}"`);
        seenKeys.add(k);
      }
    }

    if (errors.length) {
      setSaving(false);
      setErrorMsg(errors[0]);
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setSaving(false);
      setErrorMsg("You must be signed in.");
      return;
    }

    const payload = {
      skip_hire_sales_account_code: asText(skipHireCode),
      permit_sales_account_code: asText(permitCode),

      // These can be AccountID or Code (we store whatever was selected/typed)
      card_clearing_account_code: asText(cardClearingAccountKey),
      cash_bank_account_code: asText(cashBankAccountKey),

      use_defaults_when_missing: !!useDefaultsWhenMissing,
      sales_categories: categoriesSorted.map((c) => ({
        key: asText(c.key),
        label: asText(c.label),
        account_code: asText(c.account_code),
        enabled: c.enabled === false ? false : true,
        sort: Number.isFinite(Number(c.sort)) ? Number(c.sort) : 0,
        ...(asText(c.vat_rate) ? { vat_rate: asText(c.vat_rate) } : {}),
      })),
    };

    const res = await fetch("/api/settings/invoicing", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok || !json.ok) {
      setErrorMsg(json?.error || "Could not save invoicing settings.");
      return;
    }

    const s = json.settings || {};
    setSkipHireCode(asText(s.skip_hire_sales_account_code) || "200");
    setPermitCode(asText(s.permit_sales_account_code) || "215");

    setCardClearingAccountKey(asText(s.card_clearing_account_code) || "");
    setCashBankAccountKey(asText(s.cash_bank_account_code) || "");

    setUseDefaultsWhenMissing(s.use_defaults_when_missing === false ? false : true);
    setCategories(normalizeCategories(s.sales_categories));

    setOkMsg("Saved.");
  }

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading invoicing settings…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Invoicing</h1>
        <p>You must be signed in.</p>
        <button style={btnSecondary} onClick={() => router.push("/login")}>
          Go to login
        </button>
      </main>
    );
  }

  const bankHelp =
    "Pick the account by name. We store the Xero AccountID (uuid) behind the scenes, so BANK accounts work even when Code is null.";

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app/settings" style={linkStyle}>
            ← Back to Settings
          </Link>
          <h1 style={{ margin: "10px 0 0" }}>Invoicing</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Per-subscriber invoice account mappings + future sales categories.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={save} disabled={saving || !!authError}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {(authError || errorMsg || okMsg) && (
        <div style={{ marginBottom: 14 }}>
          {authError || errorMsg ? <p style={{ color: "red", margin: 0 }}>{authError || errorMsg}</p> : null}
          {okMsg ? <p style={{ color: "green", margin: 0 }}>{okMsg}</p> : null}
        </div>
      )}

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={h2Style}>Account mappings</h2>
            <p style={{ margin: 0, color: "#666", fontSize: 13 }}>
              Choose by name/code from your connected Xero organisation.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btnSecondary} onClick={loadXeroAccounts} disabled={accountsLoading}>
              {accountsLoading ? "Refreshing…" : "Refresh Xero accounts"}
            </button>
            <Link href="/app/xero-accounts" style={{ ...btnSecondary, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              View raw list →
            </Link>
          </div>
        </div>

        {accountsErr ? (
          <div style={{ marginTop: 10, ...hintBox, border: "1px solid #f0b4b4", background: "#fff5f5" }}>
            <div style={{ fontWeight: 900, color: "#8a1f1f" }}>Xero accounts error</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#8a1f1f", whiteSpace: "pre-wrap" }}>{accountsErr}</div>
          </div>
        ) : null}

        <div style={{ marginTop: 12, ...hintBox }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>BANK accounts (payments)</div>
          <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>{bankHelp}</div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          <label style={labelStyle}>
            Cash bank account (used for cash payments)
            <select
              value={cashBankAccountKey}
              onChange={(e) => {
                setCashBankAccountKey(e.target.value);
                setOkMsg("");
                setErrorMsg("");
              }}
              style={inputStyle}
            >
              <option value="">Select BANK account…</option>
              {bankAccounts.map((a) => (
                <option key={a.AccountID || a.Name} value={bankAccountValueForSelect(a)}>
                  {displayBankOptionLabel(a)}
                </option>
              ))}
            </select>
            <div style={tinyHint}>
              Stored as {looksLikeUuid(cashBankAccountKey) ? "AccountID (uuid)" : "Code"}:{" "}
              <span style={monoTiny}>{cashBankAccountKey || "—"}</span>
            </div>
          </label>

          <label style={labelStyle}>
            Card clearing account (used for card payments)
            <select
              value={cardClearingAccountKey}
              onChange={(e) => {
                setCardClearingAccountKey(e.target.value);
                setOkMsg("");
                setErrorMsg("");
              }}
              style={inputStyle}
            >
              <option value="">Select BANK account…</option>
              {bankAccounts.map((a) => (
                <option key={a.AccountID || a.Name} value={bankAccountValueForSelect(a)}>
                  {displayBankOptionLabel(a)}
                </option>
              ))}
            </select>
            <div style={tinyHint}>
              Stored as {looksLikeUuid(cardClearingAccountKey) ? "AccountID (uuid)" : "Code"}:{" "}
              <span style={monoTiny}>{cardClearingAccountKey || "—"}</span>
            </div>
          </label>
        </div>

        <div style={{ marginTop: 12, ...hintBox }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>REVENUE accounts (sales posting)</div>
          <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>
            These are saved as Xero <b>Code</b> (not AccountID).
          </div>
        </div>

        <div style={gridStyle}>
          <label style={labelStyle}>
            Skip hire sales account (Code)
            <select
              value={skipHireCode}
              onChange={(e) => {
                setSkipHireCode(e.target.value);
                setOkMsg("");
                setErrorMsg("");
              }}
              style={inputStyle}
            >
              <option value="">Select REVENUE account…</option>
              {revenueAccounts.map((a) => (
                <option key={a.AccountID || a.Code || a.Name} value={asText(a.Code)}>
                  {displayRevenueOptionLabel(a)}
                </option>
              ))}
            </select>
            <div style={tinyHint}>Default: 200</div>
          </label>

          <label style={labelStyle}>
            Permit sales account (NO VAT) (Code)
            <select
              value={permitCode}
              onChange={(e) => {
                setPermitCode(e.target.value);
                setOkMsg("");
                setErrorMsg("");
              }}
              style={inputStyle}
            >
              <option value="">Select REVENUE account…</option>
              {revenueAccounts.map((a) => (
                <option key={a.AccountID || a.Code || a.Name} value={asText(a.Code)}>
                  {displayRevenueOptionLabel(a)}
                </option>
              ))}
            </select>
            <div style={tinyHint}>Default: 215</div>
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "inline-flex", gap: 10, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={!!useDefaultsWhenMissing}
              onChange={(e) => setUseDefaultsWhenMissing(e.target.checked)}
            />
            Allow fallback to env defaults when a setting is missing (rollout safety)
          </label>
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={h2Style}>Additional sales categories</h2>
            <p style={{ margin: 0, color: "#666", fontSize: 13 }}>
              Future-proof mappings for haulage, grab, extras, etc. Stored now, wiring later.
            </p>
          </div>

          <button style={btnSecondary} onClick={addCategory}>
            Add category
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Key should be a stable slug (e.g. <b>haulage</b>). Label is what staff see. Sort controls order.
        </div>

        {categoriesSorted.length === 0 ? (
          <div style={{ marginTop: 12, fontSize: 13, color: "#666" }}>No categories yet. Add “haulage”, “grab”, “extras” etc.</div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {categoriesSorted.map((c, idx) => (
              <div key={`${c.key || "row"}-${idx}`} style={subCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>
                    {c.label ? c.label : "New category"}
                    {c.key ? (
                      <span style={{ marginLeft: 8, fontWeight: 600, color: "#666", fontSize: 12 }}>({c.key})</span>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={c.enabled !== false}
                        onChange={(e) => updateCategory(idx, { enabled: e.target.checked })}
                      />
                      Enabled
                    </label>

                    <button style={btnDanger} onClick={() => deleteCategory(idx)}>
                      Delete
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 10,
                  }}
                >
                  <label style={labelStyle}>
                    Key (slug)
                    <input
                      type="text"
                      value={c.key || ""}
                      onChange={(e) => updateCategory(idx, { key: e.target.value })}
                      placeholder="e.g. haulage"
                      style={inputStyle}
                    />
                    <div style={tinyHint}>lower-case letters/numbers/_/-</div>
                  </label>

                  <label style={labelStyle}>
                    Label
                    <input
                      type="text"
                      value={c.label || ""}
                      onChange={(e) => updateCategory(idx, { label: e.target.value })}
                      placeholder="e.g. Haulage"
                      style={inputStyle}
                    />
                    <div style={tinyHint}>Shown to staff</div>
                  </label>

                  <label style={labelStyle}>
                    Xero account code
                    <input
                      type="text"
                      value={c.account_code || ""}
                      onChange={(e) => updateCategory(idx, { account_code: e.target.value })}
                      placeholder="e.g. 201"
                      style={inputStyle}
                    />
                    <div style={tinyHint}>Where line items will post</div>
                  </label>

                  <label style={labelStyle}>
                    Sort
                    <input
                      type="number"
                      value={Number.isFinite(Number(c.sort)) ? Number(c.sort) : 0}
                      onChange={(e) => updateCategory(idx, { sort: Number(e.target.value) })}
                      style={inputStyle}
                    />
                    <div style={tinyHint}>10, 20, 30…</div>
                  </label>

                  <label style={labelStyle}>
                    VAT rate (optional, future)
                    <input
                      type="text"
                      value={c.vat_rate || ""}
                      onChange={(e) => updateCategory(idx, { vat_rate: e.target.value })}
                      placeholder="(leave blank)"
                      style={inputStyle}
                    />
                    <div style={tinyHint}>Stored now, wired later</div>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f7f7f7",
};

const centerStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const linkStyle = {
  textDecoration: "underline",
  color: "#0070f3",
  fontSize: 13,
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const subCard = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
};

const h2Style = { fontSize: 16, margin: "0 0 10px" };

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "#333",
};

const tinyHint = {
  fontSize: 11,
  color: "#666",
};

const monoTiny = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 11,
  color: "#333",
  wordBreak: "break-all",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
};

const hintBox = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #f0f0f0",
  background: "#fafafa",
};

const btnPrimary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #0070f3",
  background: "#0070f3",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontSize: 13,
};

const btnDanger = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #8a1f1f",
  background: "#8a1f1f",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};
