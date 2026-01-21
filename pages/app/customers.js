// pages/app/customers.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function displayName(c) {
  const base = `${c.first_name || ""} ${c.last_name || ""}`.trim();
  if (c.company_name) return `${c.company_name}${base ? ` – ${base}` : ""}`;
  return base || "—";
}

function shortAddr(c) {
  const parts = [c.address_line1, c.address_line2, c.address_line3]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return parts.join(", ") || "—";
}

function moneyGBP(n) {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(x);
}

export default function CustomersPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

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

    const { data, error } = await supabase
      .from("customers")
      .select(`
        id,
        first_name,
        last_name,
        company_name,
        phone,
        email,
        address_line1,
        address_line2,
        address_line3,
        postcode,
        is_credit_account,
        account_code,
        credit_limit,
        term_hire_exempt,
        term_hire_days_override
      `)
      .eq("subscriber_id", subscriberId)
      .order("company_name", { ascending: true });

    if (error) {
      console.error(error);
      setErrorMsg("Could not load customers.");
      setLoading(false);
      return;
    }

    setCustomers(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId]);

  const filtered = useMemo(() => {
    const needle = norm(q);
    if (!needle) return customers;

    return customers.filter((c) => {
      const hay = [
        displayName(c),
        c.company_name,
        c.first_name,
        c.last_name,
        c.phone,
        c.email,
        c.postcode,
        c.address_line1,
        c.address_line2,
        c.address_line3,
        c.account_code,
      ]
        .map(norm)
        .join(" ");
      return hay.includes(needle);
    });
  }, [customers, q]);

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading customers…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Customers</h1>
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
          <h1 style={{ margin: "10px 0 0" }}>Customers</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Full customer details + credit account + term hire settings.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={load}>Refresh</button>
          <button style={btnPrimary} onClick={() => router.push("/app/customers/new")}>
            + Add customer
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
            placeholder="Search (name, company, phone, email, postcode, address, account code)…"
            style={{ ...inputStyle, minWidth: 420 }}
          />
          <div style={{ fontSize: 12, color: "#666" }}>
            Showing <b>{filtered.length}</b> of <b>{customers.length}</b>
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        {filtered.length === 0 ? (
          <p style={{ margin: 0 }}>No customers found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1300 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Phone / Email</th>
                  <th style={thStyle}>Address</th>
                  <th style={thStyle}>Postcode</th>
                  <th style={thStyle}>Credit</th>
                  <th style={thStyle}>Account code</th>
                  <th style={thStyle}>Credit limit</th>
                  <th style={thStyle}>Term hire</th>
                  <th style={thStyle}>Override days</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td style={tdStyle}>{displayName(c)}</td>
                    <td style={tdStyle}>
                      <div>{c.phone || "—"}</div>
                      <div style={{ color: "#666" }}>{c.email || "—"}</div>
                    </td>
                    <td style={tdStyle}>{shortAddr(c)}</td>
                    <td style={tdStyle}>{c.postcode || "—"}</td>
                    <td style={tdStyle}>
                      {c.is_credit_account ? <span style={pillBlue}>Credit</span> : <span style={pillGrey}>No</span>}
                    </td>
                    <td style={tdStyle}>{c.account_code || "—"}</td>
                    <td style={tdStyle}>{moneyGBP(c.credit_limit)}</td>
                    <td style={tdStyle}>
                      {c.term_hire_exempt ? <span style={pillRed}>Exempt</span> : <span style={pillGreen}>Applies</span>}
                    </td>
                    <td style={tdStyle}>{c.term_hire_days_override ?? "—"}</td>
                    <td style={tdStyle}>
                      <Link href={`/app/customers/${c.id}`} style={actionLink}>
                        View / Edit
                      </Link>
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

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
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
  fontWeight: 700,
  border: "1px solid transparent",
};

const pillGreen = { ...pillBase, background: "#ecfdf3", color: "#0f5132", borderColor: "#b7ebc6" };
const pillRed = { ...pillBase, background: "#fff5f5", color: "#8a1f1f", borderColor: "#f0b4b4" };
const pillBlue = { ...pillBase, background: "#eef6ff", color: "#0b3d91", borderColor: "#b6d7ff" };
const pillGrey = { ...pillBase, background: "#f2f2f2", color: "#444", borderColor: "#ddd" };
