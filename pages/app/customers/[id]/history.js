// pages/app/customers/[id]/history.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuthProfile } from "../../../../lib/useAuthProfile";

function fmtDate(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString("en-GB");
  } catch {
    return String(d);
  }
}

function moneyGBP(n) {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(x);
}

export default function CustomerHistoryPage() {
  const router = useRouter();
  const customerId = router.query?.id ? String(router.query.id) : "";
  const { checking, user } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [debugMsg, setDebugMsg] = useState("");
  const [payload, setPayload] = useState(null);

  async function load() {
    if (!customerId) return;
    if (checking) return;

    if (!user) {
      setLoading(false);
      setErrorMsg("You must be signed in.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setDebugMsg("");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) {
        console.error("getSession error:", sessionErr);
        setErrorMsg("Could not read session.");
        setDebugMsg(sessionErr.message || String(sessionErr));
        setPayload(null);
        setLoading(false);
        return;
      }

      const token = sessionData?.session?.access_token;
      if (!token) {
        setErrorMsg("No auth session token found. Try signing out and back in.");
        setPayload(null);
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/customers/history?customer_id=${encodeURIComponent(customerId)}`, {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      });

      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        console.error("History API error:", res.status, json || text);
        setErrorMsg(json?.error || `Could not load history (HTTP ${res.status}).`);
        setDebugMsg(json ? JSON.stringify(json) : text);
        setPayload(null);
        setLoading(false);
        return;
      }

      setPayload(json);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setErrorMsg("Could not load history.");
      setDebugMsg(e?.message || String(e));
      setPayload(null);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, checking, user]);

  const jobs = payload?.jobs || [];
  const invoices = payload?.invoices || [];
  const wtns = payload?.wtns || [];
  const warnings = payload?.warnings || [];

  const title = payload?.customer
    ? payload.customer.company_name
      ? `${payload.customer.company_name}${
          payload.customer.first_name || payload.customer.last_name
            ? ` – ${((payload.customer.first_name || "") + " " + (payload.customer.last_name || "")).trim()}`
            : ""
        }`
      : `${((payload.customer.first_name || "") + " " + (payload.customer.last_name || "")).trim()}`.trim() || "Customer"
    : "Customer";

  const jobsSorted = useMemo(() => {
    return [...jobs].sort((a, b) => String(b.date || b.created_at || "").localeCompare(String(a.date || a.created_at || "")));
  }, [jobs]);

  const invoicesSorted = useMemo(() => {
    return [...invoices].sort((a, b) => String(b.date || b.created_at || "").localeCompare(String(a.date || a.created_at || "")));
  }, [invoices]);

  const wtnsSorted = useMemo(() => {
    return [...wtns].sort((a, b) => String(b.date || b.created_at || "").localeCompare(String(a.date || a.created_at || "")));
  }, [wtns]);

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading history…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Customer history</h1>
        <p>You must be signed in.</p>
        <button style={btnSecondary} onClick={() => router.push("/login")}>
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app/customers" style={linkStyle}>
            ← Back to customers
          </Link>
          <h1 style={{ margin: "10px 0 0" }}>History: {title}</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Jobs, invoices and waste paperwork for this customer.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={load}>
            Refresh
          </button>
          <button style={btnPrimary} onClick={() => router.push(`/app/customers/${customerId}`)}>
            View / Edit customer
          </button>
        </div>
      </header>

      {errorMsg && (
        <section style={{ ...cardStyle, borderColor: "#ffd1d1", background: "#fff5f5" }}>
          <p style={{ color: "#8a1f1f", margin: 0, fontWeight: 800 }}>{errorMsg}</p>
          {debugMsg ? (
            <pre style={preStyle}>{debugMsg}</pre>
          ) : null}
        </section>
      )}

      {warnings.length > 0 && (
        <section style={{ ...cardStyle, borderColor: "#ffe7b5", background: "#fffaf0" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Wiring warnings (safe to ignore for now)</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#7a5a00", fontSize: 12 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>Jobs</h2>
        {jobsSorted.length === 0 ? (
          <p style={{ margin: 0, color: "#666" }}>No jobs found (or not wired yet).</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Ref</th>
                  <th style={thStyle}>Site / Postcode</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Value</th>
                </tr>
              </thead>
              <tbody>
                {jobsSorted.map((j) => (
                  <tr key={j.id || `${j.ref}-${j.date}`}>
                    <td style={tdStyle}>{fmtDate(j.date || j.created_at || j.job_date)}</td>
                    <td style={tdStyle}>{j.type || j.job_type || "—"}</td>
                    <td style={tdStyle}>{j.ref || j.job_ref || j.booking_ref || "—"}</td>
                    <td style={tdStyle}>
                      <div>{j.site_name || j.address || j.delivery_address || "—"}</div>
                      <div style={{ color: "#666" }}>{j.postcode || j.delivery_postcode || "—"}</div>
                    </td>
                    <td style={tdStyle}>{j.status || "—"}</td>
                    <td style={tdStyle}>{moneyGBP(j.total_inc_vat ?? j.price_inc_vat ?? j.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Invoices</h2>
        {invoicesSorted.length === 0 ? (
          <p style={{ margin: 0, color: "#666" }}>No invoices found (or not wired yet).</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Invoice</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoicesSorted.map((inv) => (
                  <tr key={inv.id || inv.invoice_id || inv.number || `${inv.date}-${inv.total}`}>
                    <td style={tdStyle}>{fmtDate(inv.date || inv.created_at || inv.issued_at)}</td>
                    <td style={tdStyle}>{inv.number || inv.invoice_number || inv.xero_invoice_number || "—"}</td>
                    <td style={tdStyle}>{inv.status || inv.xero_status || "—"}</td>
                    <td style={tdStyle}>{moneyGBP(inv.total_inc_vat ?? inv.total ?? inv.amount)}</td>
                    <td style={tdStyle}>
                      <button style={btnSmall} disabled title="Next step: wire to existing resend invoice flow">
                        Resend invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Waste Transfer Notes</h2>
        {wtnsSorted.length === 0 ? (
          <p style={{ margin: 0, color: "#666" }}>No WTNs found (or not wired yet).</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 950 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>WTN</th>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {wtnsSorted.map((w) => (
                  <tr key={w.id || `${w.date}-${w.number}`}>
                    <td style={tdStyle}>{fmtDate(w.date || w.created_at)}</td>
                    <td style={tdStyle}>{w.number || w.wtn_number || "—"}</td>
                    <td style={tdStyle}>{w.description || w.notes || "—"}</td>
                    <td style={tdStyle}>
                      <button style={btnSmall} disabled title="Next step: wire resend WTN">
                        Resend WTN
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

const linkStyle = { textDecoration: "underline", color: "#0070f3", fontSize: 13 };

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const h2Style = { margin: "0 0 10px", fontSize: 14 };

const thStyle = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "10px 8px",
  fontSize: 12,
  fontWeight: 700,
  color: "#333",
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: "10px 8px",
  fontSize: 12,
  color: "#111",
  verticalAlign: "top",
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

const btnSmall = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontSize: 12,
};

const preStyle = {
  marginTop: 10,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 12,
  background: "#fff",
  border: "1px solid #eee",
  padding: 10,
  borderRadius: 10,
  color: "#333",
};
