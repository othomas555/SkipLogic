// pages/app/jobs/index.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function moneyGBP(n) {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(x);
}

function fmtDate(iso) {
  const s = String(iso || "").trim();
  if (!s) return "—";
  // iso date "YYYY-MM-DD"
  const dt = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString("en-GB");
}

function displayCustomer(c) {
  if (!c) return "—";
  const base = `${c.first_name || ""} ${c.last_name || ""}`.trim();
  if (c.company_name) return `${c.company_name}${base ? ` – ${base}` : ""}`;
  return base || "—";
}

const STATUS_LABELS = {
  booked: "Booked",
  delivered: "Delivered",
  collected: "Collected",
  swapped: "Swap",
  cancelled: "Cancelled",
};

export default function JobsIndexPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

  // Filters / sorting
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [hideCollected, setHideCollected] = useState(true);
  const [sortKey, setSortKey] = useState("job_number_desc"); // default: most recent booking at top

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

    // Base query
    let qy = supabase
      .from("jobs")
      .select(
        `
        id,
        subscriber_id,
        job_number,
        job_status,
        scheduled_date,
        created_at,
        site_postcode,
        site_address_line1,
        site_address_line2,
        site_town,
        placement_type,
        price_inc_vat,
        customer_id,
        customers:customer_id (
          id,
          first_name,
          last_name,
          company_name,
          phone,
          email
        )
      `
      )
      .eq("subscriber_id", subscriberId);

    // Status filter
    if (status && status !== "all") {
      qy = qy.eq("job_status", status);
    }

    // Hide collected
    if (hideCollected) {
      qy = qy.neq("job_status", "collected");
    }

    // Sorting
    if (sortKey === "job_number_desc") {
      // Your job numbers are zero padded (AROC-00066) so string sort works fine.
      qy = qy.order("job_number", { ascending: false }).order("created_at", { ascending: false });
    } else if (sortKey === "scheduled_date_asc") {
      qy = qy.order("scheduled_date", { ascending: true, nullsFirst: false }).order("job_number", { ascending: false });
    } else if (sortKey === "scheduled_date_desc") {
      qy = qy.order("scheduled_date", { ascending: false, nullsLast: true }).order("job_number", { ascending: false });
    } else if (sortKey === "created_at_desc") {
      qy = qy.order("created_at", { ascending: false }).order("job_number", { ascending: false });
    } else {
      qy = qy.order("job_number", { ascending: false }).order("created_at", { ascending: false });
    }

    // Limit (keeps page snappy)
    qy = qy.limit(500);

    const { data, error } = await qy;

    if (error) {
      console.error(error);
      setErrorMsg("Could not load jobs.");
      setJobs([]);
      setLoading(false);
      return;
    }

    setJobs(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId, status, hideCollected, sortKey]);

  const filtered = useMemo(() => {
    const needle = norm(q);
    if (!needle) return jobs;

    return jobs.filter((j) => {
      const cust = j.customers;
      const hay = [
        j.job_number,
        j.job_status,
        j.site_postcode,
        j.site_address_line1,
        j.site_address_line2,
        j.site_town,
        displayCustomer(cust),
        cust?.email,
        cust?.phone,
      ]
        .map(norm)
        .join(" ");
      return hay.includes(needle);
    });
  }, [jobs, q]);

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading jobs…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Jobs</h1>
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
          <Link href="/app" style={linkStyle}>
            ← Back to dashboard
          </Link>
          <h1 style={{ margin: "10px 0 0" }}>Jobs</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Filter and sort to find the newest bookings and the oldest uncollected skips.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={load}>
            Refresh
          </button>
          <button style={btnPrimary} onClick={() => router.push("/app/jobs/book")}>
            + New job
          </button>
        </div>
      </header>

      {(authError || errorMsg) && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ color: "red", margin: 0 }}>{authError || errorMsg}</p>
        </div>
      )}

      <section style={cardStyle}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search (job #, customer, postcode, address, phone, email)…"
            style={{ ...inputStyle, minWidth: 420 }}
          />

          <label style={labelStyle}>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
              <option value="all">All</option>
              <option value="booked">Booked</option>
              <option value="delivered">Delivered</option>
              <option value="collected">Collected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <label style={labelStyle}>
            Sort
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={selectStyle}>
              <option value="job_number_desc">Job # (most recent first)</option>
              <option value="scheduled_date_asc">Scheduled date (oldest first)</option>
              <option value="scheduled_date_desc">Scheduled date (newest first)</option>
              <option value="created_at_desc">Created (newest first)</option>
            </select>
          </label>

          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={hideCollected}
              onChange={(e) => setHideCollected(e.target.checked)}
            />
            Hide collected
          </label>

          <div style={{ fontSize: 12, color: "#666", marginLeft: "auto" }}>
            Showing <b>{filtered.length}</b> of <b>{jobs.length}</b>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Tip: set <b>Status = Delivered</b> and <b>Sort = Scheduled date (oldest first)</b> to work through the oldest uncollected skips.
        </div>
      </section>

      <section style={cardStyle}>
        {filtered.length === 0 ? (
          <p style={{ margin: 0 }}>No jobs found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Job #</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Scheduled</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Postcode</th>
                  <th style={thStyle}>Address</th>
                  <th style={thStyle}>Value</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => {
                  const cust = j.customers;
                  const addr = [j.site_address_line1, j.site_address_line2, j.site_town]
                    .map((x) => String(x || "").trim())
                    .filter(Boolean)
                    .join(", ");

                  const statusLabel = STATUS_LABELS[j.job_status] || j.job_status || "—";

                  return (
                    <tr key={j.id}>
                      <td style={tdStyle}>
                        <b>{j.job_number || "—"}</b>
                      </td>
                      <td style={tdStyle}>
                        <span style={pillForStatus(j.job_status)}>{statusLabel}</span>
                      </td>
                      <td style={tdStyle}>{fmtDate(j.scheduled_date)}</td>
                      <td style={tdStyle}>{displayCustomer(cust)}</td>
                      <td style={tdStyle}>{j.site_postcode || "—"}</td>
                      <td style={tdStyle}>{addr || "—"}</td>
                      <td style={tdStyle}>{moneyGBP(j.price_inc_vat)}</td>
                      <td style={tdStyle}>
                        <Link href={`/app/jobs/${j.id}`} style={actionLink}>
                          View
                        </Link>
                        <span style={{ margin: "0 8px", color: "#ccc" }}>|</span>
                        <Link href={`/app/customers/${j.customer_id}`} style={actionLink}>
                          Customer
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function pillForStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "collected") return pillGreen;
  if (s === "delivered") return pillBlue;
  if (s === "booked") return pillGrey;
  if (s === "cancelled") return pillRed;
  return pillGrey;
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

const thStyle = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "10px 8px",
  fontSize: 12,
  fontWeight: 800,
  color: "#333",
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: "10px 8px",
  fontSize: 12,
  color: "#111",
  verticalAlign: "top",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
};

const labelStyle = {
  fontSize: 12,
  color: "#333",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const selectStyle = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
  minWidth: 190,
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

const actionLink = { fontSize: 12, textDecoration: "underline", color: "#0070f3" };

const pillBase = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  border: "1px solid transparent",
};

const pillGreen = { ...pillBase, background: "#ecfdf3", color: "#0f5132", borderColor: "#b7ebc6" };
const pillRed = { ...pillBase, background: "#fff5f5", color: "#8a1f1f", borderColor: "#f0b4b4" };
const pillBlue = { ...pillBase, background: "#eef6ff", color: "#0b3d91", borderColor: "#b6d7ff" };
const pillGrey = { ...pillBase, background: "#f2f2f2", color: "#444", borderColor: "#ddd" };
