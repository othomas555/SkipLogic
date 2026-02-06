// pages/driver/menu.js
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function ymdTodayLocal() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DriverMenuPage() {
  const today = useMemo(() => ymdTodayLocal(), []);
  const [loggingOut, setLoggingOut] = useState(false);

  async function doLogout(e) {
    e?.preventDefault?.();
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await fetch("/api/driver/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // ignore
    } finally {
      // Force reload onto login page
      window.location.href = `/driver?t=${Date.now()}`;
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.h1}>Driver</h1>
            <div style={styles.sub}>Today: {today}</div>
          </div>

          <button onClick={doLogout} style={styles.logoutBtn} disabled={loggingOut}>
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>

        <div style={styles.grid}>
          <Link href="/driver/run" style={{ ...styles.tile, ...styles.tilePrimary }}>
            <div style={styles.tileTitle}>Today’s work</div>
            <div style={styles.tileDesc}>View your run and complete jobs.</div>
          </Link>

          <Link href="/driver/work" style={styles.tile}>
            <div style={styles.tileTitle}>Work list</div>
            <div style={styles.tileDesc}>Outstanding jobs for a selected date.</div>
          </Link>

          <Link href="/driver/checks" style={styles.tile}>
            <div style={styles.tileTitle}>Vehicle checks</div>
            <div style={styles.tileDesc}>Daily walkaround checks before heading out.</div>
          </Link>

          <div style={{ ...styles.tile, cursor: "default" }}>
            <div style={styles.tileTitle}>Quick reminders</div>
            <ul style={styles.list}>
              <li>Photos first, then mark complete</li>
              <li>If signal is bad: do photos, then retry completion</li>
              <li>Blocked access: photo it + notes, then call office</li>
            </ul>
          </div>
        </div>

        <div style={styles.footerNote}>
          Tip: add this page to the iPad Home Screen as “SkipLogic Driver”.
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
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    background: "#f5f5f5",
  },
  card: {
    width: "100%",
    maxWidth: 760,
    background: "#fff",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 8px 22px rgba(0,0,0,0.08)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  h1: { margin: 0, fontSize: 22 },
  sub: { marginTop: 4, color: "#666", fontSize: 13 },
  logoutBtn: {
    fontSize: 14,
    borderRadius: 10,
    border: "1px solid #e6e6e6",
    background: "#fafafa",
    padding: "10px 12px",
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  tile: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 14,
    textDecoration: "none",
    color: "inherit",
    background: "#fafafa",
  },
  tilePrimary: {
    border: "1px solid #dbe7ff",
    background: "#f2f7ff",
  },
  tileTitle: { fontSize: 16, fontWeight: 700, marginBottom: 6 },
  tileDesc: { fontSize: 13, color: "#555", lineHeight: 1.35 },
  list: { margin: "8px 0 0 16px", padding: 0, color: "#555", fontSize: 13, lineHeight: 1.5 },
  footerNote: { marginTop: 14, fontSize: 12, color: "#777" },
};
