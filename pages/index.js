// pages/index.js
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function HomePage() {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(!!data?.session);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={{ margin: 0 }}>SkipLogic</h1>
        <p style={{ color: "#555", marginTop: 8 }}>
          Office dashboard + driver portal.
        </p>

        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {hasSession ? (
            <Link href="/app" style={styles.btnPrimary}>Go to dashboard</Link>
          ) : (
            <Link href="/login" style={styles.btnPrimary}>Office login</Link>
          )}

          <Link href="/driver" style={styles.btnSecondary}>Driver login</Link>
        </div>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "#f6f6f6",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    background: "#fff",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 8px 22px rgba(0,0,0,0.08)",
    border: "1px solid #eee",
  },
  btnPrimary: {
    display: "block",
    textAlign: "center",
    padding: "10px 12px",
    borderRadius: 10,
    background: "#111",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 800,
  },
  btnSecondary: {
    display: "block",
    textAlign: "center",
    padding: "10px 12px",
    borderRadius: 10,
    background: "#f5f5f5",
    border: "1px solid #ddd",
    color: "#111",
    textDecoration: "none",
    fontWeight: 800,
  },
};
