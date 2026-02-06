// pages/driver/index.js
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/**
 * TODO: set these to real values.
 * Keep them hardcoded for now (simple + reliable for drivers).
 */
const OFFICE_PHONE_TEL = "tel:+447000000000";
const OFFICE_EMAIL = "mailto:office@yourdomain.co.uk?subject=SkipLogic%20Driver%20Issue";

/**
 * Driver jobs endpoint should already exist and be session-protected.
 * We use it as a lightweight "am I logged in?" + "how many jobs today?" check.
 */
function ymdTodayLocal() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function humanDateLocal() {
  const dt = new Date();
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DriverHomeMenu() {
  const todayYmd = useMemo(() => ymdTodayLocal(), []);
  const todayHuman = useMemo(() => humanDateLocal(), []);

  const [loading, setLoading] = useState(true);
  const [authOk, setAuthOk] = useState(true);
  const [counts, setCounts] = useState({ total: 0, outstanding: 0, completed: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/driver/jobs?date=${encodeURIComponent(todayYmd)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (res.status === 401) {
          if (!cancelled) {
            setAuthOk(false);
            setCounts({ total: 0, outstanding: 0, completed: 0 });
          }
          return;
        }

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Failed (${res.status})`);
        }

        const json = await res.json();

        // Be defensive: different shapes are fine.
        const jobs = Array.isArray(json?.jobs) ? json.jobs : Array.isArray(json) ? json : [];

        // "Outstanding" = not completed (cover common statuses)
        // We deliberately treat anything with an actual date as completed for the day.
        const completed = jobs.filter((j) => {
          // swap/delivery/collection all vary; safest is "has actual date"
          return Boolean(j?.delivery_actual_date || j?.collection_actual_date) || j?.job_status === "completed";
        });

        const outstanding = jobs.filter((j) => !completed.includes(j));

        if (!cancelled) {
          setAuthOk(true);
          setCounts({
            total: jobs.length,
            outstanding: outstanding.length,
            completed: completed.length,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Failed to load today’s jobs.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [todayYmd]);

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.h1}>Driver</h1>
            <div style={styles.sub}>
              {todayHuman} <span style={styles.muted}>({todayYmd})</span>
            </div>
          </div>

          <div style={styles.headerRight}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={styles.smallBtn}
              title="Refresh"
            >
              Refresh
            </button>

            <Link href="/driver/logout" style={styles.linkSmall}>
              Log out
            </Link>
          </div>
        </div>

        {!authOk && (
          <div style={styles.alertBad}>
            <b>Not logged in.</b> Open the driver login page and sign in again.
          </div>
        )}

        {error && <div style={styles.alertWarn}>{error}</div>}

        <div style={styles.statsRow}>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Outstanding today</div>
            <div style={styles.statValue}>{loading ? "…" : counts.outstanding}</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Completed today</div>
            <div style={styles.statValue}>{loading ? "…" : counts.completed}</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Total today</div>
            <div style={styles.statValue}>{loading ? "…" : counts.total}</div>
          </div>
        </div>

        <div style={styles.grid}>
          <Link href="/driver/run" style={{ ...styles.tile, ...styles.tilePrimary }}>
            <div style={styles.tileTitle}>Start today’s run</div>
            <div style={styles.tileDesc}>Go straight to the run list and get cracking.</div>
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

          <a href={OFFICE_PHONE_TEL} style={styles.tile}>
            <div style={styles.tileTitle}>Call the office</div>
            <div style={styles.tileDesc}>Blocked access, customer problems, breakdowns.</div>
          </a>

          <a href={OFFICE_EMAIL} style={styles.tile}>
            <div style={styles.tileTitle}>Email the office</div>
            <div style={styles.tileDesc}>Non-urgent issues, notes, photos if needed.</div>
          </a>

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
    maxWidth: 820,
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
    marginBottom: 12,
  },
  headerRight: { display: "flex", gap: 10, alignItems: "center" },
  h1: { margin: 0, fontSize: 22 },
  sub: { marginTop: 4, color: "#666", fontSize: 13 },
  muted: { color: "#888" },
  linkSmall: { fontSize: 14, color: "#0b57d0", textDecoration: "none" },
  smallBtn: {
    fontSize: 13,
    borderRadius: 10,
    border: "1px solid #e6e6e6",
    background: "#fafafa",
    padding: "8px 10px",
    cursor: "pointer",
  },
  alertBad: {
    padding: 12,
    borderRadius: 12,
    background: "#fff2f2",
    border: "1px solid #ffd3d3",
    color: "#7a1b1b",
    marginBottom: 12,
    fontSize: 13,
  },
  alertWarn: {
    padding: 12,
    borderRadius: 12,
    background: "#fff9e6",
    border: "1px solid #ffe3a6",
    color: "#6b4f00",
    marginBottom: 12,
    fontSize: 13,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  stat: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 12,
    background: "#fafafa",
  },
  statLabel: { fontSize: 12, color: "#666", marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: 800 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
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
  tileTitle: { fontSize: 16, fontWeight: 800, marginBottom: 6 },
  tileDesc: { fontSize: 13, color: "#555", lineHeight: 1.35 },
  list: { margin: "8px 0 0 16px", padding: 0, color: "#555", fontSize: 13, lineHeight: 1.5 },
  footerNote: { marginTop: 14, fontSize: 12, color: "#777" },
};
