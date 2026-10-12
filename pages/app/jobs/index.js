
// pages/app/jobs/index.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

const PAGE_SIZE = 50;

function moneyGBP(n) {
  if (n == null || n === "") return "—";
  const x = Number(n);
  return Number.isFinite(x)
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(x)
    : String(n);
}

function fmtDate(iso) {
  const s = String(iso || "").trim();
  if (!s) return "—";
  const dt = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(dt.getTime()) ? s : dt.toLocaleDateString("en-GB");
}

function displayCustomer(c) {
  if (!c) return "—";
  const base = `${c.first_name || ""} ${c.last_name || ""}`.trim();
  return c.company_name
    ? `${c.company_name}${base ? ` – ${base}` : ""}`
    : base || "—";
}

const STATUS_LABELS = {
  booked: "Booked",
  delivered: "Delivered",
  collected: "Collected",
  swapped: "Swap",
  cancelled: "Cancelled",
};

function safeSearch(s) {
  return String(s || "")
    .trim()
    .replace(/[%_(),.\\"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function JobsIndexPage() {
  const router = useRouter();
  const {
    checking,
    user,
    subscriberId,
    errorMsg: authError,
  } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("active");
  const [sortKey, setSortKey] = useState("job_number_desc");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      setSearch(q.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (checking) return;

    if (!user || !subscriberId) {
      setLoading(false);
      setJobs([]);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMsg("");

      try {
        const term = safeSearch(search);
        let matchingCustomerIds = [];

        if (term) {
          const pattern = `%${term}%`;

          const { data: customers, error: customerError } =
            await supabase
              .from("customers")
              .select("id")
              .eq("subscriber_id", subscriberId)
              .or(
                `first_name.ilike.${pattern},last_name.ilike.${pattern},company_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`
              );

          if (customerError) throw customerError;

          matchingCustomerIds = (customers || [])
            .map((c) => c.id)
            .filter(Boolean);
        }

        let query = supabase
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
          `,
            { count: "exact" }
          )
          .eq("subscriber_id", subscriberId);

        if (view === "active") {
          query = query.neq("job_status", "collected");
        }

        if (view === "collected") {
          query = query.eq("job_status", "collected");
        }

        if (term) {
          const pattern = `%${term}%`;

          const clauses = [
            `site_postcode.ilike.${pattern}`,
            `site_address_line1.ilike.${pattern}`,
            `site_address_line2.ilike.${pattern}`,
            `site_town.ilike.${pattern}`,
            `job_status.ilike.${pattern}`,
          ];

          if (/^\d+$/.test(term)) {
            clauses.push(`job_number.eq.${term}`);
          }

          if (matchingCustomerIds.length) {
            clauses.push(
              `customer_id.in.(${matchingCustomerIds.join(",")})`
            );
          }

          query = query.or(clauses.join(","));
        }

        if (sortKey === "job_number_desc") {
          query = query
            .order("job_number", { ascending: false })
            .order("created_at", { ascending: false });
        } else if (sortKey === "scheduled_date_asc") {
          query = query
            .order("scheduled_date", { ascending: true })
            .order("job_number", { ascending: false });
        } else if (sortKey === "scheduled_date_desc") {
          query = query
            .order("scheduled_date", { ascending: false })
            .order("job_number", { ascending: false });
        } else {
          query = query
            .order("created_at", { ascending: false })
            .order("job_number", { ascending: false });
        }

        const { data, count, error } = await query.range(
          page * PAGE_SIZE,
          (page + 1) * PAGE_SIZE - 1
        );

        if (error) throw error;

        if (!cancelled) {
          setJobs(data || []);
          setTotal(count || 0);
        }
      } catch (err) {
        console.error("Jobs search failed:", err);

        if (!cancelled) {
          setJobs([]);
          setTotal(0);
          setErrorMsg(err?.message || "Could not load jobs.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [
    checking,
    user,
    subscriberId,
    search,
    view,
    sortKey,
    page,
    refresh,
  ]);

  if (checking) {
    return <main style={centerStyle}>Checking sign-in…</main>;
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Jobs</h1>
        <p>You must be signed in.</p>
        <button
          style={btnSecondary}
          onClick={() => router.push("/login")}
        >
          Go to login
        </button>
      </main>
    );
  }

  if (!subscriberId) {
    return (
      <main style={pageStyle}>
        <h1>Jobs</h1>
        <p>{authError || "No subscriber found for this user."}</p>
      </main>
    );
  }

  const pages = Math.ceil(total / PAGE_SIZE);

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
          <button
            style={btnSecondary}
            onClick={() => setRefresh((n) => n + 1)}
          >
            Refresh
          </button>

          <button
            style={btnPrimary}
            onClick={() => router.push("/app/jobs/book")}
          >
            + New job
          </button>
        </div>
      </header>

      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {[
            ["active", "Active Jobs"],
            ["collected", "Collected Jobs"],
            ["all", "All Jobs"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setView(value);
                setPage(0);
              }}
              style={view === value ? btnPrimary : btnSecondary}
              aria-pressed={view === value}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search job #, customer, postcode, address, phone, email…"
            style={{
              ...inputStyle,
              flex: "1 1 280px",
              minWidth: 0,
            }}
            aria-label="Search jobs"
          />

          <select
            aria-label="Sort jobs"
            style={inputStyle}
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value);
              setPage(0);
            }}
          >
            <option value="job_number_desc">
              Newest job number
            </option>
            <option value="scheduled_date_desc">
              Delivery date (newest)
            </option>
            <option value="scheduled_date_asc">
              Delivery date (oldest)
            </option>
            <option value="created_at_desc">
              Recently created
            </option>
          </select>
        </div>

        <p
          style={{
            color: "#64748b",
            fontSize: 13,
            marginBottom: 0,
          }}
        >
          {loading
            ? "Searching…"
            : `${total.toLocaleString("en-GB")} matching job${
                total === 1 ? "" : "s"
              }`}
        </p>

        {errorMsg ? (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {errorMsg}
          </p>
        ) : null}
      </section>

      <section
        style={{
          ...cardStyle,
          marginTop: 14,
          padding: 0,
          overflowX: "auto",
        }}
      >
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
            {!loading && jobs.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={7}>
                  No jobs found.
                </td>
              </tr>
            ) : null}

            {jobs.map((j) => {
              const site = [
                j.site_address_line1,
                j.site_address_line2,
                j.site_town,
                j.site_postcode,
              ]
                .filter(Boolean)
                .join(", ");

              return (
                <tr
                  key={j.id}
                  onClick={() =>
                    router.push(`/app/jobs/${j.id}`)
                  }
                  style={{ cursor: "pointer" }}
                >
                  <td style={tdStyle}>{j.job_number}</td>

                  <td style={tdStyle}>
                    {STATUS_LABELS[j.job_status] ||
                      j.job_status ||
                      "—"}
                  </td>

                  <td style={tdStyle}>
                    {fmtDate(j.scheduled_date)}
                  </td>

                  <td style={tdStyle}>
                    {displayCustomer(j.customers)}
                  </td>

                  <td style={tdStyle}>{site}</td>

                  <td style={tdStyle}>
                    {moneyGBP(j.price_inc_vat)}
                  </td>

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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 14,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            color: "#64748b",
            fontSize: 14,
          }}
        >
          {total
            ? `Showing ${page * PAGE_SIZE + 1}–${Math.min(
                (page + 1) * PAGE_SIZE,
                total
              )} of ${total}`
            : "No results"}
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button
            style={btnSecondary}
            disabled={loading || page === 0}
            onClick={() =>
              setPage((p) => Math.max(0, p - 1))
            }
          >
            ← Previous
          </button>

          <span style={{ fontSize: 14 }}>
            Page {pages ? page + 1 : 0} of {pages}
          </span>

          <button
            style={btnSecondary}
            disabled={loading || page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </main>
  );
}

const pageStyle = { padding: 16 };

const centerStyle = {
  minHeight: "60vh",
  display: "grid",
  placeItems: "center",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 14,
  flexWrap: "wrap",
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

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle = {
  padding: "12px",
  borderBottom: "1px solid #f1f5f9",
};
