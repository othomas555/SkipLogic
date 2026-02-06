// pages/driver/index.js
import Link from "next/link";

function ymdTodayLocal() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DriverHomeMenu() {
  const today = ymdTodayLocal();

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.h1}>Driver</h1>
            <div style={styles.sub}>Today: {today}</div>
          </div>

          <div style={styles.headerRight}>
            {/* If you have a driver logout route, keep it. If not, remove this link. */}
            <Link href="/driver/logout" style={styles.linkSmall}>
              Log out
            </Link>
          </div>
        </div>

        <div style={styles.grid}>
          <Link href="/driver/run" style={styles.tile}>
            <div style={styles.tileTitle}>Today’s work</div>
            <div style={styles.tileDesc}>
              View your run and complete deliveries, collections & swaps.
            </div>
          </Link>

          <Link href="/driver/work" style={styles.tile}>
            <div style={styles.tileTitle}>Work list</div>
            <div style={styles.tileDesc}>
              Outstanding jobs for a selected date (and completed-today later).
            </div>
          </Link>

          <Link href="/driver/checks" style={styles.tile}>
            <div style={styles.tileTitle}>Vehicle checks</div>
            <div style={styles.tileDesc}>Daily walkaround checks before heading out.</div>
          </Link>

          <a href="tel:+440000000000" style={styles.tile}>
            <div style={styles.tileTitle}>Call the office</div>
            <div style={styles.tileDesc}>
              If access is blocked, customer issues, breakdowns, etc.
            </div>
          </a>

          <div style={{ ...styles.tile, cursor: "default" }}>
            <div style={styles.tileTitle}>Quick reminders</div>
            <ul style={styles.list}>
              <li>Take required photos first, then mark complete</li>
              <li>If signal is bad: get photos done, retry completion</li>
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
  headerRight: { display: "flex", gap: 10, alignItems: "center" },
  h1: { margin: 0, fontSize: 22 },
  sub: { marginTop: 4, color: "#666", fontSize: 13 },
  linkSmall: { fontSize: 14, color: "#0b57d0", textDecoration: "none" },
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
  tileTitle: { fontSize: 16, fontWeight: 700, marginBottom: 6 },
  tileDesc: { fontSize: 13, color: "#555", lineHeight: 1.35 },
  list: { margin: "8px 0 0 16px", padding: 0, color: "#555", fontSize: 13, lineHeight: 1.5 },
  footerNote: { marginTop: 14, fontSize: 12, color: "#777" },
};
