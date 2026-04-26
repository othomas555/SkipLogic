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

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [hideCollected, setHideCollected] = useState(true);
  const [sortKey, setSortKey] = useState("job_number_desc");

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

    let qy = supabase
      .from("jobs")
      .select(`
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
      `)
      .eq("subscriber_id", subscriberId);

    if (status && status !== "all") {
      qy = qy.eq("job_status", status);
    }

    if (hideCollected) {
      qy = qy.neq("job_status", "collected");
    }

    if (sortKey === "job_number_desc") {
      qy = qy.order("job_number", { ascending: false }).order("created_at", { ascending: false });
    } else if (sortKey === "scheduled_date_asc") {
      qy = qy.order("scheduled_date", { ascending: true }).order("job_number", { ascending: false });
    } else if (sortKey === "scheduled_date_desc") {
      qy = qy.order("scheduled_date", { ascending: false }).order("job_number", { ascending: false });
    } else if (sortKey === "created_at_desc") {
      qy = qy.order("created_at", { ascending: false }).order("job_number", { ascending: false });
    }

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
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button style={btnSecondary} onClick={load}>Refresh</button>
          <button style={btnPrimary} onClick={() => router.push("/app/jobs/book")}>
            + New job
          </button>
        </div>
      </header>

      <section style={cardStyle}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          style={inputStyle}
        />
      </section>

      <section style={{ ...cardStyle, marginTop: 14, padding: 0 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Job #</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Scheduled</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Site</th>
              <th style={thStyle}>Price</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((j) => {
              const cust = j.customers;
              const site = [j.site_address_line1, j.site_address_line2, j.site_town, j.site_postcode]
                .filter(Boolean)
                .join(", ");

              return (
                <tr
                  key={j.id}
                  onClick={() => router.push(`/app/jobs/${j.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={tdStyle}>{j.job_number}</td>
                  <td style={tdStyle}>{STATUS_LABELS[j.job_status]}</td>
                  <td style={tdStyle}>{fmtDate(j.scheduled_date)}</td>
                  <td style={tdStyle}>{displayCustomer(cust)}</td>
                  <td style={tdStyle}>{site}</td>
                  <td style={tdStyle}>{moneyGBP(j.price_inc_vat)}</td>
                  <td style={tdStyle}>
                    <button
                      style={btnRow}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/app/jobs/${j.id}`);
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}

// ===== STYLES (unchanged) =====

const pageStyle = { padding: 16 };
const centerStyle = { minHeight: "60vh", display: "grid", placeItems: "center" };

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 14,
};

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
};

const linkStyle = {
  color: "#2563eb",
  textDecoration: "none",
  fontSize: 14,
};

const inputStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 12px",
};

const btnPrimary = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#111827",
  color: "#fff",
  cursor: "pointer",
};

const btnSecondary = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#fff",
  cursor: "pointer",
};

const btnRow = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "6px 10px",
  background: "#fff",
  cursor: "pointer",
};

const tableStyle = { width: "100%", borderCollapse: "collapse" };
const thStyle = { textAlign: "left", padding: "12px", borderBottom: "1px solid #e5e7eb" };
const tdStyle = { padding: "12px", borderBottom: "1px solid #f1f5f9" };
