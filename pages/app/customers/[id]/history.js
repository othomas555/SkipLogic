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

function pick(obj, keys) {
  for (const k of keys) {
    if (!obj) continue;
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return null;
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

export default function CustomerHistoryPage() {
  const router = useRouter();
  const customerId = router.query?.id ? String(router.query.id) : "";

  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [warnings, setWarnings] = useState([]);

  const [customer, setCustomer] = useState(null);

  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [wtns, setWtns] = useState([]);

  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  async function tryTable(tableName, buildQuery) {
    try {
      const q = buildQuery(supabase.from(tableName));
      const { data, error } = await q;
      if (error) {
        return { ok: false, data: [], warning: `${tableName}: ${error.message}` };
      }
      return { ok: true, data: data || [], warning: null };
    } catch (e) {
      return { ok: false, data: [], warning: `${tableName}: ${e?.message || String(e)}` };
    }
  }

  function mapJobRow(j) {
    // Keep this mapping very tolerant: try lots of names, no assumptions.
    const id = pick(j, ["id", "job_id"]);
    const createdAt = pick(j, ["created_at", "createdAt"]);
    const date = pick(j, ["job_date", "date", "delivery_date", "collection_date", "run_date", "created_at"]);

    const type = pick(j, ["job_type", "type", "job_kind", "kind", "event_type", "work_type"]);
    const ref = pick(j, ["job_ref", "ref", "booking_ref", "booking_number", "reference", "job_number", "job_no"]);
    const status = pick(j, ["status", "job_status", "state", "current_status"]);

    const postcode = pick(j, ["postcode", "delivery_postcode", "site_postcode", "address_postcode"]);
    const siteOrAddr =
      pick(j, ["site_name", "site", "address", "delivery_address", "collection_address", "address_line1"]) || null;

    const value =
      pick(j, [
        "total_inc_vat",
        "price_inc_vat",
        "total",
        "amount",
        "amount_inc_vat",
        "grand_total",
        "invoice_total_inc_vat",
      ]) ?? null;

    // Invoice-ish fields (common patterns in SkipLogic builds)
    const invoiceId = pick(j, ["xero_invoice_id", "invoice_id"]);
    const invoiceNumber = pick(j, ["xero_invoice_number", "invoice_number", "invoice_no", "invoice_ref"]);
    const invoiceStatus = pick(j, ["xero_status", "invoice_status", "invoice_state"]);
    const invoiceUrl = pick(j, ["invoice_url", "xero_invoice_url", "xero_url", "xero_invoice_link"]);
    const invoiceIssuedAt = pick(j, ["invoice_issued_at", "issued_at", "invoice_date"]);

    // WTN-ish fields (if you store them on jobs)
    const wtnNumber = pick(j, ["wtn_number", "waste_transfer_note_number", "waste_note_number"]);
    const wtnUrl = pick(j, ["wtn_url", "waste_transfer_note_url", "waste_note_url"]);
    const wtnCreatedAt = pick(j, ["wtn_created_at", "wtn_issued_at"]);

    return {
      id,
      createdAt,
      date,
      type,
      ref,
      status,
      postcode,
      siteOrAddr,
      value,
      invoice: {
        invoiceId,
        invoiceNumber,
        invoiceStatus,
        invoiceUrl,
        invoiceIssuedAt,
        invoiceTotal: value,
      },
      wtn: {
        wtnNumber,
        wtnUrl,
        wtnCreatedAt,
      },
      raw: j,
    };
  }

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
    setWarnings([]);
    setJobs([]);
    setInvoices([]);
    setWtns([]);
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

    const warns = [];

    // Jobs
    let jobsData = [];
    {
      const r = await tryTable("jobs", (t) =>
        t
          .select("*")
          .eq("subscriber_id", subscriberId)
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(500)
      );

      if (r.warning) warns.push(r.warning);
      jobsData = r.data || [];
    }

    // Keep your earlier warnings about missing tables (so we don't forget)
    {
      const rInv = await tryTable("invoices", (t) => t.select("*").limit(1));
      if (rInv.warning) warns.push(rInv.warning);

      const rX = await tryTable("xero_invoices", (t) => t.select("*").limit(1));
      if (rX.warning) warns.push(rX.warning);

      const rWo = await tryTable("waste_out", (t) => t.select("*").limit(1));
      if (rWo.warning) warns.push(rWo.warning);

      const rWtn = await tryTable("waste_transfer_notes", (t) => t.select("*").limit(1));
      if (rWtn.warning) warns.push(rWtn.warning);
    }

    // Map jobs → display rows
    const mappedJobs = (jobsData || []).map(mapJobRow);

    // Derive invoices from jobs (if any invoice fields exist)
    const derivedInvoices = uniqBy(
      mappedJobs
        .map((mj) => {
          const inv = mj.invoice;
          const hasAnything = inv.invoiceId || inv.invoiceNumber || inv.invoiceStatus || inv.invoiceUrl;
          if (!hasAnything) return null;
          return {
            id: inv.invoiceId || inv.invoiceNumber || mj.id,
            date: inv.invoiceIssuedAt || mj.date || mj.createdAt,
            number: inv.invoiceNumber || "—",
            status: inv.invoiceStatus || "—",
            total_inc_vat: inv.invoiceTotal,
            url: inv.invoiceUrl || null,
            source_job_id: mj.id || null,
            source_job_ref: mj.ref || null,
          };
        })
        .filter(Boolean),
      (x) => safeStr(x.id)
    );

    // Derive WTNs from jobs (if any WTN fields exist)
    const derivedWtns = uniqBy(
      mappedJobs
        .map((mj) => {
          const w = mj.wtn;
          const hasAnything = w.wtnNumber || w.wtnUrl;
          if (!hasAnything) return null;
          return {
            id: `${w.wtnNumber || ""}-${mj.id || ""}` || mj.id,
            date: w.wtnCreatedAt || mj.date || mj.createdAt,
            number: w.wtnNumber || "—",
            description: mj.ref ? `Job ${mj.ref}` : "—",
            url: w.wtnUrl || null,
            source_job_id: mj.id || null,
          };
        })
        .filter(Boolean),
      (x) => safeStr(x.id)
    );

    // Debug info: show keys + sample row + mapping example
    const sampleRaw = jobsData && jobsData.length ? jobsData[0] : null;
    const sampleMapped = mappedJobs && mappedJobs.length ? mappedJobs[0] : null;

    setDebugInfo({
      job_count: jobsData?.length || 0,
      sample_job_keys: sampleRaw ? Object.keys(sampleRaw).sort() : [],
      sample_job_raw: sampleRaw,
      sample_job_mapped: sampleMapped
        ? {
            date: sampleMapped.date,
            type: sampleMapped.type,
            ref: sampleMapped.ref,
            status: sampleMapped.status,
            postcode: sampleMapped.postcode,
            siteOrAddr: sampleMapped.siteOrAddr,
            value: sampleMapped.value,
            invoiceFields: sampleMapped.invoice,
            wtnFields: sampleMapped.wtn,
          }
        : null,
      note:
        "If Type/Ref/Status/Postcode are still blank, send me sample_job_keys (or the raw sample row) and I’ll add the exact column names.",
    });

    setWarnings(warns);
    setJobs(mappedJobs);
    setInvoices(derivedInvoices);
    setWtns(derivedWtns);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, checking, user, subscriberId]);

  const jobsSorted = useMemo(() => {
    const arr = [...jobs];
    arr.sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
    return arr;
  }, [jobs]);

  const invoicesSorted = useMemo(() => {
    const arr = [...invoices];
    arr.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return arr;
  }, [invoices]);

  const wtnsSorted = useMemo(() => {
    const arr = [...wtns];
    arr.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return arr;
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

      {warnings.length > 0 && (
        <section style={{ ...cardStyle, borderColor: "#ffe7b5", background: "#fffaf0" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Wiring warnings</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#7a5a00", fontSize: 12 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {showDebug && (
        <section style={{ ...cardStyle, borderColor: "#dbeafe", background: "#eff6ff" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Debug</div>
          <div style={{ fontSize: 12, color: "#1e3a8a", marginBottom: 8 }}>{debugInfo?.note || "—"}</div>

          <div style={{ fontSize: 12, color: "#1e3a8a", marginBottom: 6 }}>
            Jobs loaded: <b>{debugInfo?.job_count ?? 0}</b>
          </div>

          <div style={{ fontSize: 12, color: "#1e3a8a", marginBottom: 6 }}>
            Sample job keys:
          </div>
          <pre style={preStyle}>{(debugInfo?.sample_job_keys || []).join(", ") || "—"}</pre>

          <div style={{ fontSize: 12, color: "#1e3a8a", marginBottom: 6 }}>
            Sample mapped fields:
          </div>
          <pre style={preStyle}>{debugInfo?.sample_job_mapped ? JSON.stringify(debugInfo.sample_job_mapped, null, 2) : "—"}</pre>

          <div style={{ fontSize: 12, color: "#1e3a8a", marginBottom: 6 }}>
            Sample raw row:
          </div>
          <pre style={preStyle}>{debugInfo?.sample_job_raw ? JSON.stringify(debugInfo.sample_job_raw, null, 2) : "—"}</pre>
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
                  <tr key={j.id || `${j.createdAt || Math.random()}`}>
                    <td style={tdStyle}>{fmtDate(j.date || j.createdAt)}</td>
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
          <p style={{ margin: 0, color: "#666" }}>
            No invoice fields detected on jobs yet. If invoices exist in your system, they’re likely stored under a different
            table name — turn on <b>Show debug</b> and paste me the keys, or tell me where invoices live.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Invoice</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Job ref</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoicesSorted.map((inv) => (
                  <tr key={safeStr(inv.id) || `${inv.date}-${Math.random()}`}>
                    <td style={tdStyle}>{fmtDate(inv.date)}</td>
                    <td style={tdStyle}>{inv.number || "—"}</td>
                    <td style={tdStyle}>{inv.status || "—"}</td>
                    <td style={tdStyle}>{moneyGBP(inv.total_inc_vat)}</td>
                    <td style={tdStyle}>{inv.source_job_ref || "—"}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <button style={btnSmall} disabled title="Next: wire to your existing resend invoice endpoint">
                          Resend invoice
                        </button>
                        {inv.url ? (
                          <a href={inv.url} target="_blank" rel="noreferrer" style={actionLink}>
                            Open
                          </a>
                        ) : (
                          <span style={{ color: "#999", fontSize: 12 }}>—</span>
                        )}
                      </div>
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
          <p style={{ margin: 0, color: "#666" }}>
            No WTN fields detected on jobs yet, and your schema doesn’t have <code>waste_out</code> / <code>waste_transfer_notes</code>.
            Once we identify the real WTN storage (table or job fields), we’ll list them here + add “Resend WTN”.
          </p>
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
                  <tr key={safeStr(w.id) || `${w.date}-${Math.random()}`}>
                    <td style={tdStyle}>{fmtDate(w.date)}</td>
                    <td style={tdStyle}>{w.number || "—"}</td>
                    <td style={tdStyle}>{w.description || "—"}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <button style={btnSmall} disabled title="Next: wire resend WTN">
                          Resend WTN
                        </button>
                        {w.url ? (
                          <a href={w.url} target="_blank" rel="noreferrer" style={actionLink}>
                            Open
                          </a>
                        ) : (
                          <span style={{ color: "#999", fontSize: 12 }}>—</span>
                        )}
                      </div>
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

const actionLink = { fontSize: 12, textDecoration: "underline", color: "#0070f3" };

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
