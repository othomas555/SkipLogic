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

    // 1) Load customer (tenant scoped)
    const { data: cust, error: custErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, company_name, email, phone")
      .eq("subscriber_id", subscriberId)
      .eq("id", customerId)
      .single();

    if (custErr) {
      console.error(custErr);
      setErrorMsg("Could not load customer.");
      setCustomer(null);
      setJobs([]);
      setInvoices([]);
      setWtns([]);
      setLoading(false);
      return;
    }

    setCustomer(cust);

    const warns = [];

    // 2) Jobs (try common tables)
    let jobsData = [];
    {
      const attempts = [
        ["jobs", (t) => t.select("*").eq("subscriber_id", subscriberId).eq("customer_id", customerId).limit(500)],
        [
          "delivery_jobs",
          (t) => t.select("*").eq("subscriber_id", subscriberId).eq("customer_id", customerId).limit(500),
        ],
        ["skip_jobs", (t) => t.select("*").eq("subscriber_id", subscriberId).eq("customer_id", customerId).limit(500)],
      ];

      for (const [name, fn] of attempts) {
        // eslint-disable-next-line no-await-in-loop
        const r = await tryTable(name, fn);
        if (r.warning) warns.push(r.warning);
        if (r.ok && r.data.length) {
          jobsData = r.data;
          break;
        }
      }

      if (!jobsData.length) warns.push("Jobs: no rows returned from jobs/delivery_jobs/skip_jobs (may be a different table/column).");
    }

    // 3) Invoices (try common tables)
    let invoicesData = [];
    {
      const attempts = [
        ["invoices", (t) => t.select("*").eq("subscriber_id", subscriberId).eq("customer_id", customerId).limit(500)],
        [
          "xero_invoices",
          (t) => t.select("*").eq("subscriber_id", subscriberId).eq("customer_id", customerId).limit(500),
        ],
      ];

      for (const [name, fn] of attempts) {
        // eslint-disable-next-line no-await-in-loop
        const r = await tryTable(name, fn);
        if (r.warning) warns.push(r.warning);
        if (r.ok && r.data.length) {
          invoicesData = r.data;
          break;
        }
      }
    }

    // 4) WTNs (try common tables)
    let wtnsData = [];
    {
      const attempts = [
        [
          "waste_out",
          (t) => t.select("*").eq("subscriber_id", subscriberId).eq("customer_id", customerId).limit(500),
        ],
        [
          "waste_transfer_notes",
          (t) => t.select("*").eq("subscriber_id", subscriberId).eq("customer_id", customerId).limit(500),
        ],
      ];

      for (const [name, fn] of attempts) {
        // eslint-disable-next-line no-await-in-loop
        const r = await tryTable(name, fn);
        if (r.warning) warns.push(r.warning);
        if (r.ok && r.data.length) {
          wtnsData = r.data;
          break;
        }
      }
    }

    setWarnings(warns);
    setJobs(jobsData);
    setInvoices(invoicesData);
    setWtns(wtnsData);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, checking, user, subscriberId]);

  const jobsSorted = useMemo(() => {
    const arr = [...jobs];
    arr.sort((a, b) =>
      String(b.job_date || b.date || b.created_at || "").localeCompare(String(a.job_date || a.date || a.created_at || ""))
    );
    return arr;
  }, [jobs]);

  const invoicesSorted = useMemo(() => {
    const arr = [...invoices];
    arr.sort((a, b) =>
      String(b.issued_at || b.date || b.created_at || "").localeCompare(String(a.issued_at || a.date || a.created_at || ""))
    );
    return arr;
  }, [invoices]);

  const wtnsSorted = useMemo(() => {
    const arr = [...wtns];
    arr.sort((a, b) => String(b.date || b.created_at || "").localeCompare(String(a.date || a.created_at || "")));
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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={load}>
            Refresh
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
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Wiring warnings (paste these back to me)</div>
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
          <p style={{ margin: 0, color: "#666" }}>No jobs found (or not wired to the right table/columns yet).</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Ref</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobsSorted.map((j) => (
                  <tr key={j.id || `${j.ref || j.job_ref || "job"}-${j.created_at || Math.random()}`}>
                    <td style={tdStyle}>{fmtDate(j.job_date || j.date || j.created_at)}</td>
                    <td style={tdStyle}>{j.job_type || j.type || "—"}</td>
                    <td style={tdStyle}>{j.job_ref || j.ref || j.booking_ref || "—"}</td>
                    <td style={tdStyle}>{j.status || "—"}</td>
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
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
                  <tr key={inv.id || inv.invoice_id || inv.number || `${inv.created_at || Math.random()}`}>
                    <td style={tdStyle}>{fmtDate(inv.issued_at || inv.date || inv.created_at)}</td>
                    <td style={tdStyle}>{inv.invoice_number || inv.number || inv.xero_invoice_number || "—"}</td>
                    <td style={tdStyle}>{inv.status || inv.xero_status || "—"}</td>
                    <td style={tdStyle}>{moneyGBP(inv.total_inc_vat ?? inv.total ?? inv.amount)}</td>
                    <td style={tdStyle}>
                      <button style={btnSmall} disabled title="Next: wire to your existing resend invoice endpoint">
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
                  <tr key={w.id || `${w.created_at || Math.random()}`}>
                    <td style={tdStyle}>{fmtDate(w.date || w.created_at)}</td>
                    <td style={tdStyle}>{w.wtn_number || w.number || "—"}</td>
                    <td style={tdStyle}>{w.description || w.notes || "—"}</td>
                    <td style={tdStyle}>
                      <button style={btnSmall} disabled title="Next: wire resend WTN">
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
