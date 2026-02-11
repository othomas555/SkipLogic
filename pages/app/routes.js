// pages/app/routes.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

export default function RoutesPage() {
  const router = useRouter();
  const { checking, user, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState([]);
  const [q, setQ] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function load() {
    setErrorMsg("");
    setLoading(true);

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw new Error(sessionErr.message || "Could not read session");
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("No auth token (please sign in again).");

      const res = await fetch("/api/dev/routes", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed to load routes (HTTP ${res.status})`);

      setRoutes(json.routes || []);
    } catch (e) {
      setErrorMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checking) return;
    if (!user) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user]);

  const filtered = useMemo(() => {
    const needle = norm(q);
    if (!needle) return routes;
    return routes.filter((r) => norm(r).includes(needle));
  }, [routes, q]);

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading routes…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Route map</h1>
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
          <h1 style={{ margin: "10px 0 0" }}>Route map</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            This is the full list of your app pages that exist in the repo (auto-generated).
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={load}>Refresh</button>
        </div>
      </header>

      {(authError || errorMsg) && (
        <section style={{ ...cardStyle, borderColor: "#ffd1d1", background: "#fff5f5" }}>
          <p style={{ color: "#8a1f1f", margin: 0, fontWeight: 900 }}>{authError || errorMsg}</p>
        </section>
      )}

      <section style={cardStyle}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search routes (eg scheduler, staff, driver, settings)…"
            style={{ ...inputStyle, minWidth: 420 }}
          />
          <div style={{ fontSize: 12, color: "#666" }}>
            Showing <b>{filtered.length}</b> of <b>{routes.length}</b>
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        {filtered.length === 0 ? (
          <p style={{ margin: 0 }}>No routes found.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            {filtered.map((r) => (
              <Link key={r} href={r} style={routeCard}>
                <div style={{ fontWeight: 900, fontSize: 13, color: "#111" }}>{r}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: "#0070f3", textDecoration: "underline" }}>
                  Open →
                </div>
              </Link>
            ))}
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

const routeCard = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  textDecoration: "none",
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
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
