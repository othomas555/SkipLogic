// pages/app/xero-accounts.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

export default function XeroAccountsPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [accounts, setAccounts] = useState([]);

  async function loadAccounts() {
    setErrorMsg("");
    setAccounts([]);
    setLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setErrorMsg("No access token found. Please log in again via /login.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/xero/xero_list_accounts", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErrorMsg(json?.error || json?.details || `Request failed (HTTP ${res.status})`);
        setLoading(false);
        return;
      }

      setAccounts(Array.isArray(json.accounts) ? json.accounts : []);
      setLoading(false);
    } catch (e) {
      setErrorMsg(String(e?.message || e));
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checking) return;
    if (!user || !subscriberId) return;
    // auto-load once
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId]);

  if (checking) {
    return (
      <main style={styles.center}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={styles.page}>
        <h1>Xero Accounts</h1>
        <p>You must be signed in.</p>
        <a href="/login" style={{ textDecoration: "underline" }}>Go to login</a>
      </main>
    );
  }

  const bank = accounts.filter((a) => a?.Type === "BANK");
  const revenue = accounts.filter((a) => a?.Type === "REVENUE");

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <Link href="/app/jobs" style={{ textDecoration: "underline", fontSize: 13 }}>
            ← Back to jobs
          </Link>
          <h1 style={{ margin: "10px 0 6px" }}>Xero Accounts (for invoice settings)</h1>
          <div style={{ fontSize: 13, color: "#555" }}>
            Signed in as <b>{user.email}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={loadAccounts} disabled={loading} style={loading ? styles.btnDisabled : styles.btn}>
            {loading ? "Loading…" : "Reload"}
          </button>
        </div>
      </header>

      {(authError || errorMsg) && (
        <div style={styles.alertBad}>
          {authError ? String(authError) : null}
          {authError && errorMsg ? "\n" : null}
          {errorMsg ? String(errorMsg) : null}
        </div>
      )}

      <section style={styles.card}>
        <h2 style={styles.h2}>BANK accounts (use for cash + card clearing)</h2>
        <p style={styles.help}>
          You will pick these by <b>Name</b>. We store the <b>AccountID</b> behind the scenes.
        </p>

        {bank.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>No BANK accounts returned.</div>
        ) : (
          <div style={styles.table}>
            <div style={styles.rowHead}>
              <div>Name</div>
              <div>AccountID</div>
              <div>Code</div>
              <div>Status</div>
            </div>
            {bank.map((a) => (
              <div key={a.AccountID || a.Name} style={styles.row}>
                <div style={styles.cellStrong}>{a.Name || "—"}</div>
                <div style={styles.mono}>{a.AccountID || "—"}</div>
                <div style={styles.mono}>{a.Code || "—"}</div>
                <div>{a.Status || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={styles.card}>
        <h2 style={styles.h2}>REVENUE accounts (use for skip + permit sales)</h2>

        {revenue.length === 0 ? (
          <div style={{ color: "#666", fontSize: 13 }}>No REVENUE accounts returned.</div>
        ) : (
          <div style={styles.table}>
            <div style={styles.rowHead}>
              <div>Name</div>
              <div>AccountID</div>
              <div>Code</div>
              <div>Status</div>
            </div>
            {revenue.map((a) => (
              <div key={a.AccountID || a.Name} style={styles.row}>
                <div style={styles.cellStrong}>{a.Name || "—"}</div>
                <div style={styles.mono}>{a.AccountID || "—"}</div>
                <div style={styles.mono}>{a.Code || "—"}</div>
                <div>{a.Status || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 24,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "#f7f7f7",
  },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  h2: { margin: "0 0 8px", fontSize: 15 },
  help: { margin: "0 0 10px", fontSize: 13, color: "#555" },
  alertBad: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #f0b4b4",
    background: "#fff5f5",
    color: "#8a1f1f",
    whiteSpace: "pre-wrap",
    fontSize: 13,
  },
  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: 0,
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  btnDisabled: {
    padding: "10px 12px",
    borderRadius: 10,
    border: 0,
    background: "#111",
    color: "#fff",
    cursor: "default",
    fontWeight: 900,
    whiteSpace: "nowrap",
    opacity: 0.6,
  },
  table: {
    border: "1px solid #eee",
    borderRadius: 12,
    overflow: "hidden",
  },
  rowHead: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1.6fr 0.5fr 0.5fr",
    gap: 10,
    padding: "10px 12px",
    background: "#fafafa",
    fontWeight: 900,
    fontSize: 12,
    color: "#333",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1.6fr 0.5fr 0.5fr",
    gap: 10,
    padding: "10px 12px",
    borderTop: "1px solid #eee",
    fontSize: 13,
    alignItems: "center",
  },
  mono: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    wordBreak: "break-all",
    color: "#333",
  },
  cellStrong: { fontWeight: 800 },
};
