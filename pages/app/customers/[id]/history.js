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

function displayCustomerTitle(c) {
  if (!c) return "Customer";
  const base = `${c.first_name || ""} ${c.last_name || ""}`.trim();
  if (c.company_name) return `${c.company_name}${base ? ` – ${base}` : ""}`;
  return base || "Customer";
}

function safeStr(x) {
  if (x == null) return "";
  return String(x);
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const x of arr || []) {
    const k = keyFn(x);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function deriveJobType(j) {
  if (j.swap_role) {
    const r = String(j.swap_role || "").toLowerCase();
    if (r === "full") return "Swap (full)";
    if (r === "empty") return "Swap (empty)";
    return "Swap";
  }

  if (j.collection_actual_date) return "Collected";
  if (j.delivery_actual_date) return "Delivered";

  if (j.collection_date) return "Collection booked";
  if (j.scheduled_date) return "Delivery booked";

  if (j.notes) {
    const n = String(j.notes).toLowerCase();
    if (n.includes("swap")) return "Swap";
    if (n.includes("collect")) return "Collection";
    if (n.includes("deliver")) return "Delivery";
  }

  return "Job";
}

function derivePrimaryDate(j) {
  return (
    j.collection_actual_date ||
    j.delivery_actual_date ||
    j.collection_date ||
    j.scheduled_date ||
    j.work_date ||
    j.created_at ||
    null
  );
}

function mapJobRow(j) {
  const date = derivePrimaryDate(j);
  return {
    id: j.id,
    date,
    type: deriveJobType(j),
    ref: j.job_number || "—",
    status: j.job_status || "—",
    postcode: j.site_postcode || "—",
    value: j.price_inc_vat ?? null,
  };
}

export default function CustomerHistoryPage() {
  const router = useRouter();
  const customerId = router.query?.id ? String(router.query.id) : "";

  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [customer, setCustomer] = useState(null);

  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [wtns] = useState([]); // still not wired (no fields/tables yet)

  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  const [actionMsg, setActionMsg] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyInvoiceJobId, setBusyInvoiceJobId] = useState(null);

  async function load() {
    if (!customerId) return;
    if (checking) return;

    if (!user) {
      setLoading(false);
      setErrorMsg("You must be signed in.");
      return;
    }

    if (!subscriberId) {
      setLoading(false);
      setErrorMsg("No subscriber found for this user.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setActionMsg("");
    setActionErr("");
    setJobs([]);
    setInvoices([]);
    setDebugInfo(null);

    // Customer
    const { data: cust, error: custErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, company_name, email, phone, account_code")
      .eq("subscriber_id", subscriberId)
      .eq("id", customerId)
      .single();

    if (custErr) {
      console.error(custErr);
      setErrorMsg("Could not load customer.");
      setCustomer(null);
      setLoading(false);
      return;
    }
    setCustomer(cust);

    // Jobs
    const { data: jobsRaw, error: jobsErr } = await supabase
      .from("jobs")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (jobsErr) {
      console.error(jobsErr);
      setErrorMsg("Could not load jobs.");
      setJobs([]);
      setInvoices([]);
      setLoading(false);
      return;
    }

    const mappedJobs = (jobsRaw || []).map(mapJobRow);

    // Invoices derived from jobs (your real fields are xero_invoice_*)
    const derivedInvoices = uniqBy(
      (jobsRaw || [])
        .map((j) => {
          const hasInv = j.xero_invoice_id || j.xero_invoice_number || j.xero_invoice_status;
          if (!hasInv) return null;
          return {
            id: j.xero_invoice_id || j.xero_invoice_number || j.id,
            synced_at: j.xero_synced_at || j.created_at || null,
            number: j.xero_invoice_number || "—",
            status: j.xero_invoice_status || j.xero_sync_status || "—",
            total_inc_vat: j.price_inc_vat ?? null,
            job_number: j.job_number || "—",
            job_id: j.id,
          };
        })
        .filter(Boolean),
      (x) => safeStr(x.id)
    );

    const sample = jobsRaw && jobsRaw.length ? jobsRaw[0] : null;
    setDebugInfo({
      jobs_loaded: jobsRaw?.length || 0,
      sample_keys: sample ? Object.keys(sample).sort() : [],
      sample_row: sample,
    });

    setJobs(mappedJobs);
    setInvoices(derivedInvoices);
    setLoading(false);
  }

  async function syncInvoiceForJob(jobId, jobNumber) {
    setActionMsg("");
    setActionErr("");
    setBusyInvoiceJobId(jobId);

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw new Error(sessionErr.message || "Could not read session");
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("No auth session token found. Try signing out and back in.");

      const res = await fetch("/api/xero/xero_sync_invoice_for_job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ job_id: jobId }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        console.error("xero_sync_invoice_for_job failed:", res.status, json);
        throw new Error(json?.error || `Failed to sync invoice (HTTP ${res.status}).`);
      }

      setActionMsg(`Invoice sync queued/complete for ${jobNumber || "job"}.`);
      // Reload to pull updated xero_invoice_* fields
      await load();
    } catch (e) {
      setActionErr(e?.message || "Failed to sync invoice.");
    } finally {
      setBusyInvoiceJobId(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, checking, user, subscriberId]);

  const jobsSorted = useMemo(() => {
    const arr = [...jobs];
    arr.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return arr;
  }, [jobs]);

  const invoicesSorted = useMemo(() => {
    const arr = [...invoices];
    arr.sort((a, b) => String(b.synced_at || "").localeCompare(String(a.synced_at || "")));
    return arr;
  }, [invoices]);

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
          <h1 style={{ margin: "10px 0 0" }}>History: {displayCustomerTitle(customer)}</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Jobs, invoices and waste paperwork for this customer.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button style={btnSecondary} onClick={load}>
            Refresh
          </button>
          <button style={btnSecondary} onClick={() => setShowDebug((v) => !v)}>
            {showDebug ? "Hide debug" : "Show debug"}
          </button>
          <button style={btnPrimary} onClick={() => router.push(`/app/customers/${customerId}`)}>
            View / Edit customer
          </button>
        </div>
      </header>

      {(authError || errorMsg) && (
        <section style={{ ...cardStyle, borderColor: "#ffd1d1", background: "#fff5f5" }}>
          <p style={{ color: "#8a1f1f", margin: 0, fontWeight: 800 }}>{authError || errorMsg}</p>
        </section>
      )}

      {(actionMsg || actionErr) && (
        <section
          style={{
            ...cardStyle,
            borderColor: actionErr ? "#ffd1d1" : "#c7f9cc",
            background: actionErr ? "#fff5f5" : "#f0fff4",
          }}
        >
          {actionMsg ? <p style={{ margin: 0, color: "#0f5132", fontWeight: 800 }}>{actionMsg}</p> : null}
          {actionErr ? <p style={{ margin: 0, color: "#8a1f1f", fontWeight: 800 }}>{actionErr}</p> : null}
        </section>
      )}

      {showDebug && (
        <section style={{ ...cardStyle, borderColor: "#dbeafe", background: "#eff6ff" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Debug</div>
          <div style={{ fontSize: 12, color: "#1e3a8a", marginBottom: 6 }}>
            Jobs loaded: <b>{debugInfo?.jobs_loaded ?? 0}</b>
          </div>
          <div style={{ fontSize: 12, color: "#1e3a8a", marginBottom: 6 }}>Sample job keys:</div>
          <pre style={preStyle}>{(debugInfo?.sample_keys || []).join(", ") || "—"}</pre>
          <div style={{ fontSize: 12, color: "#1e3a8a", marginBottom: 6 }}>Sample raw row:</div>
          <pre style={preStyle}>{debugInfo?.sample_row ? JSON.stringify(debugInfo.sample_row, null, 2) : "—"}</pre>
        </section>
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>Jobs</h2>
        {jobsSorted.length === 0 ? (
          <p style={{ margin: 0, color: "#666" }}>No jobs found for this customer.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Ref</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Postcode</th>
                  <th style={thStyle}>Value</th>
                </tr>
              </thead>
              <tbody>
                {jobsSorted.map((j) => (
                  <tr key={j.id || `${j.ref}-${Math.random()}`}>
                    <td style={tdStyle}>{fmtDate(j.date)}</td>
                    <td style={tdStyle}>{j.type || "—"}</td>
                    <td style={tdStyle}>{j.ref || "—"}</td>
                    <td style={tdStyle}>{j.status || "—"}</td>
                    <td style={tdStyle}>{j.postcode || "—"}</td>
                    <td style={tdStyle}>{moneyGBP(j.value)}</td>
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
          <p style={{ margin: 0, color: "#666" }}>No invoices linked yet (no xero_invoice_number on jobs).</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Synced</th>
                  <th style={thStyle}>Invoice</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Job ref</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoicesSorted.map((inv) => (
                  <tr key={safeStr(inv.id) || `${inv.number}-${Math.random()}`}>
                    <td style={tdStyle}>{fmtDate(inv.synced_at)}</td>
                    <td style={tdStyle}>{inv.number || "—"}</td>
                    <td style={tdStyle}>{inv.status || "—"}</td>
                    <td style={tdStyle}>{moneyGBP(inv.total_inc_vat)}</td>
                    <td style={tdStyle}>{inv.job_number || "—"}</td>
                    <td style={tdStyle}>
                      <button
                        style={btnSmall}
                        onClick={() => syncInvoiceForJob(inv.job_id, inv.job_number)}
                        disabled={!inv.job_id || busyInvoiceJobId === inv.job_id}
                        title={!inv.job_id ? "Missing job id" : "Re-sync invoice for this job in Xero"}
                      >
                        {busyInvoiceJobId === inv.job_id ? "Working…" : "Resend invoice"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ margin: "10px 0 0", color: "#666", fontSize: 12 }}>
          Note: “Resend invoice” currently re-syncs the invoice for the job in Xero (via xero_sync_invoice_for_job). If you also
          want it to **email the customer**, we can add that as a second action once you confirm the preferred method (Xero “Email”
          API vs sending from SkipLogic).
        </p>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Waste Transfer Notes</h2>
        {wtns.length === 0 ? (
          <p style={{ margin: 0, color: "#666" }}>
            WTNs not wired yet. Your schema doesn’t have a WTN table under the names we tried, and there are no WTN fields on jobs.
            Tell me where WTNs are generated/stored and we’ll list + resend them here.
          </p>
        ) : (
          <p style={{ margin: 0 }}>—</p>
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
  marginTop: 6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 12,
  background: "#fff",
  border: "1px solid #c7ddff",
  padding: 10,
  borderRadius: 10,
  color: "#111",
};
