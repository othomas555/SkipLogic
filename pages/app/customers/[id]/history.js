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

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function safeStr(x) {
  if (x == null) return "";
  return String(x);
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return null;
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

  // Debug helpers
  const [jobsByCustomerEmpty, setJobsByCustomerEmpty] = useState(false);
  const [recentJobs, setRecentJobs] = useState([]);
  const [jobLinkClues, setJobLinkClues] = useState([]);

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

  function detectJobLinkClues(rows) {
    // We look for likely customer linking fields present in the jobs rows.
    const candidateKeys = [
      "customer_id",
      "customer_uuid",
      "customer",
      "customer_ref",
      "customer_reference",
      "customer_account_id",
      "account_id",
      "account_uuid",
      "customer_profile_id",
      "customer_contact_id",
      "contact_id",
      "xero_contact_id",
      "xero_contactid",
      "account_code",
      "customer_code",
    ];

    const present = new Set();
    const examples = [];

    for (const r of rows || []) {
      for (const k of candidateKeys) {
        if (Object.prototype.hasOwnProperty.call(r, k)) {
          present.add(k);
        }
      }
    }

    const presentKeys = Array.from(present);
    for (const k of presentKeys) {
      // find first example value
      const exRow = (rows || []).find((r) => r && r[k] != null && r[k] !== "");
      if (exRow) {
        examples.push({ key: k, example: safeStr(exRow[k]) });
      }
    }

    return { presentKeys, examples };
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
    setJobsByCustomerEmpty(false);
    setRecentJobs([]);
    setJobLinkClues([]);

    // 1) Load customer (tenant scoped)
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

    // 2) Jobs: try the assumed link first
    let jobsData = [];
    {
      const r = await tryTable("jobs", (t) =>
        t.select("*").eq("subscriber_id", subscriberId).eq("customer_id", customerId).limit(500)
      );

      if (r.warning) warns.push(r.warning);
      jobsData = r.data || [];

      // If nothing, run a debug query (latest jobs for subscriber) so we can see what columns exist
      if (!jobsData.length) {
        setJobsByCustomerEmpty(true);

        const r2 = await tryTable("jobs", (t) =>
          t
            .select("*")
            .eq("subscriber_id", subscriberId)
            .order("created_at", { ascending: false })
            .limit(200)
        );

        if (r2.warning) warns.push(`jobs(debug): ${r2.warning.replace(/^jobs:\s*/, "")}`);

        const rows = r2.data || [];
        setRecentJobs(rows);

        const clues = detectJobLinkClues(rows);
        const extras = [];

        if ((clues.presentKeys || []).length) {
          extras.push(
            `Jobs link fields detected on jobs rows: ${clues.presentKeys.join(", ")}`
          );
          if ((clues.examples || []).length) {
            const ex = clues.examples.slice(0, 8).map((x) => `${x.key}=${x.example}`).join(" | ");
            extras.push(`Examples: ${ex}`);
          }
        } else {
          extras.push("No obvious customer link fields detected on jobs rows (from a set of common names).");
        }

        // Also try a client-side match using any detected keys (best-effort)
        // If we find a field that equals customerId, we can filter immediately and show jobs.
        const candidates = ["customer_id", "customer_uuid", "customer", "customer_ref", "customer_reference", "account_id", "customer_account_id"];
        const matched = rows.filter((j) => {
          for (const k of candidates) {
            if (Object.prototype.hasOwnProperty.call(j, k)) {
              if (safeStr(j[k]) === safeStr(customerId)) return true;
            }
          }
          return false;
        });

        if (matched.length) {
          jobsData = matched;
          extras.push(`Auto-match: found ${matched.length} jobs where one of the detected link fields equals this customer id.`);
        } else {
          // If customer has an account_code and jobs rows have account_code/customer_code, try that too.
          const custCode = cust?.account_code ? norm(cust.account_code) : "";
          if (custCode) {
            const matched2 = rows.filter((j) => {
              const v = pick(j, ["account_code", "customer_code", "customer_account_code"]);
              return v && norm(v) === custCode;
            });
            if (matched2.length) {
              jobsData = matched2;
              extras.push(`Auto-match: found ${matched2.length} jobs where account_code/customer_code matches the customer account_code.`);
            }
          }
        }

        setJobLinkClues(extras);
      }
    }

    // 3) Invoices + WTNs: we now know your guessed table names don't exist.
    // For now we keep this as placeholders and we’ll wire it once we identify where your invoice + WTN records actually live.
    // We still keep the warnings so you can paste them back later if needed.
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

    setWarnings(warns);
    setJobs(jobsData);
    setInvoices([]); // not wired yet
    setWtns([]); // not wired yet
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
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Wiring warnings</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#7a5a00", fontSize: 12 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {jobsByCustomerEmpty && (
        <section style={{ ...cardStyle, borderColor: "#dbeafe", background: "#eff6ff" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
            Jobs link not found yet (debug)
          </div>
          <div style={{ fontSize: 12, color: "#1e3a8a" }}>
            The jobs table exists, but <b>jobs.customer_id</b> didn’t return any rows for this customer.
            This usually means jobs link to customers via a different field (or via a join table).
          </div>
          {jobLinkClues.length > 0 && (
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "#1e3a8a" }}>
              {jobLinkClues.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 10, fontSize: 12, color: "#1e3a8a" }}>
            If you can tell me which field on jobs links to customers (or paste 1 example job row),
            I’ll wire it so this page shows the correct jobs only.
          </div>
        </section>
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>Jobs</h2>
        {jobsSorted.length === 0 ? (
          <p style={{ margin: 0, color: "#666" }}>No jobs found for this customer yet (link not wired).</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
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
                  <tr key={j.id || `${j.created_at || Math.random()}`}>
                    <td style={tdStyle}>{fmtDate(j.job_date || j.date || j.created_at)}</td>
                    <td style={tdStyle}>{j.job_type || j.type || "—"}</td>
                    <td style={tdStyle}>{j.job_ref || j.ref || j.booking_ref || "—"}</td>
                    <td style={tdStyle}>{j.status || "—"}</td>
                    <td style={tdStyle}>{j.postcode || j.delivery_postcode || "—"}</td>
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
        <p style={{ margin: 0, color: "#666" }}>
          Not wired yet — your schema doesn’t have <code>invoices</code> or <code>xero_invoices</code>.  
          Once we identify where invoice records live, we’ll list them here + add “Resend invoice”.
        </p>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Waste Transfer Notes</h2>
        <p style={{ margin: 0, color: "#666" }}>
          Not wired yet — your schema doesn’t have <code>waste_out</code> or <code>waste_transfer_notes</code>.  
          Once we identify the real WTN table/name, we’ll list them here + add “Resend WTN”.
        </p>
      </section>

      {recentJobs.length > 0 && (
        <section style={cardStyle}>
          <h2 style={h2Style}>Recent jobs (debug)</h2>
          <p style={{ margin: "0 0 10px", color: "#666", fontSize: 12 }}>
            Showing latest <b>{recentJobs.length}</b> jobs for this subscriber. Use this to spot which field links to the customer.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Ref</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Possible customer fields (values)</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.slice(0, 50).map((j) => {
                  const fields = [
                    ["customer_id", j.customer_id],
                    ["customer_uuid", j.customer_uuid],
                    ["customer_ref", j.customer_ref],
                    ["customer_reference", j.customer_reference],
                    ["account_id", j.account_id],
                    ["customer_account_id", j.customer_account_id],
                    ["account_code", j.account_code],
                    ["customer_code", j.customer_code],
                    ["xero_contact_id", j.xero_contact_id],
                  ]
                    .filter(([, v]) => v != null && v !== "")
                    .map(([k, v]) => `${k}=${safeStr(v)}`)
                    .join(" | ");

                  return (
                    <tr key={j.id || `${j.created_at || Math.random()}`}>
                      <td style={tdStyle}>{fmtDate(j.created_at)}</td>
                      <td style={tdStyle}>{j.job_ref || j.ref || j.booking_ref || "—"}</td>
                      <td style={tdStyle}>{j.job_type || j.type || "—"}</td>
                      <td style={tdStyle}>{j.status || "—"}</td>
                      <td style={tdStyle}>{fields || "— (no candidate fields present on this row)"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
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
