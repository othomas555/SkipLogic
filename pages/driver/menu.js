import Link from "next/link";
import { useMemo, useState } from "react";

function ymdTodayLocal() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function IconToday() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvg} aria-hidden="true">
      <path
        d="M7 2v3M17 2v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvg} aria-hidden="true">
      <path
        d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChecks() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvg} aria-hidden="true">
      <path
        d="M9 11l3 3L20 6M5 6h4M5 12h4M5 18h4M4 4h16v16H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconReminder() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvg} aria-hidden="true">
      <path
        d="M12 3a5 5 0 0 0-5 5v2.3c0 .5-.2 1-.5 1.4L5 14h14l-1.5-2.3c-.3-.4-.5-.9-.5-1.4V8a5 5 0 0 0-5-5Zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
      window.location.href = `/driver?t=${Date.now()}`;
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />

      <div style={styles.shell}>
        <section style={styles.hero}>
          <div style={styles.heroTopRow}>
            <div style={styles.brandWrap}>
              <div style={styles.brandBadge}>SL</div>
              <div>
                <div style={styles.brandTitle}>SkipLogic Driver</div>
                <div style={styles.brandSub}>Runs, work updates and vehicle checks</div>
              </div>
            </div>

            <button onClick={doLogout} style={styles.logoutBtn} disabled={loggingOut}>
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>

          <div style={styles.heroBody}>
            <div>
              <div style={styles.eyebrow}>Driver portal</div>
              <h1 style={styles.h1}>Ready for today’s run.</h1>
              <p style={styles.heroText}>
                Open your work, check your vehicle and keep the office updated throughout the day.
              </p>
            </div>

            <div style={styles.todayPanel}>
              <div style={styles.todayLabel}>Today</div>
              <div style={styles.todayValue}>{today}</div>
              <div style={styles.todayHint}>Tap a tile below to get started</div>
            </div>
          </div>
        </section>

        <section style={styles.grid}>
          <Link href="/driver/run" style={{ ...styles.tile, ...styles.tilePrimary }}>
            <div style={styles.tileIconPrimary}>
              <IconToday />
            </div>
            <div style={styles.tileTitle}>Today’s work</div>
            <div style={styles.tileDesc}>View your assigned run, yard returns and job order for today.</div>
          </Link>

          <Link href="/driver/work" style={styles.tile}>
            <div style={styles.tileIcon}>
              <IconList />
            </div>
            <div style={styles.tileTitle}>Work list</div>
            <div style={styles.tileDesc}>Check outstanding jobs for a selected date.</div>
          </Link>

          <Link href="/driver/checks" style={styles.tile}>
            <div style={styles.tileIcon}>
              <IconChecks />
            </div>
            <div style={styles.tileTitle}>Vehicle checks</div>
            <div style={styles.tileDesc}>Complete daily walkaround checks before heading out.</div>
          </Link>

          <div style={{ ...styles.tile, cursor: "default" }}>
            <div style={styles.tileIcon}>
              <IconReminder />
            </div>
            <div style={styles.tileTitle}>Quick reminders</div>
            <ul style={styles.list}>
              <li>Photos first, then mark complete</li>
              <li>If signal is bad, do photos first and retry completion after</li>
              <li>Blocked access: take photos, add notes, then call the office</li>
            </ul>
          </div>
        </section>

        <div style={styles.footerNote}>
          Tip: add this page to the iPad Home Screen as <b>SkipLogic Driver</b>.
        </div>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
    padding: 20,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    background:
      "radial-gradient(circle at top left, rgba(43,108,255,0.16), transparent 28%), linear-gradient(180deg, #081224 0%, #0e172a 52%, #eef3fb 52%, #f5f8fc 100%)",
  },
  bgGlowA: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 320,
    height: 320,
    borderRadius: "50%",
    background: "rgba(66, 153, 225, 0.20)",
    filter: "blur(60px)",
    pointerEvents: "none",
  },
  bgGlowB: {
    position: "absolute",
    bottom: 80,
    left: -120,
    width: 280,
    height: 280,
    borderRadius: "50%",
    background: "rgba(59, 130, 246, 0.14)",
    filter: "blur(60px)",
    pointerEvents: "none",
  },
  shell: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 980,
    margin: "0 auto",
  },
  hero: {
    background: "linear-gradient(135deg, rgba(9,18,39,0.96), rgba(15,23,42,0.92))",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 26,
    padding: 22,
    boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
    marginBottom: 18,
  },
  heroTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 22,
  },
  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  brandBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    letterSpacing: "0.05em",
    background: "linear-gradient(135deg, #2563eb, #60a5fa)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: 800,
  },
  brandSub: {
    marginTop: 2,
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
  },
  eyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#93c5fd",
    marginBottom: 10,
  },
  h1: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.05,
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  heroBody: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.3fr) minmax(220px, 0.7fr)",
    gap: 18,
    alignItems: "stretch",
  },
  heroText: {
    margin: "12px 0 0 0",
    maxWidth: 540,
    fontSize: 15,
    lineHeight: 1.55,
    color: "rgba(255,255,255,0.78)",
  },
  todayPanel: {
    borderRadius: 22,
    padding: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))",
    border: "1px solid rgba(255,255,255,0.1)",
    alignSelf: "stretch",
  },
  todayLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.7)",
    fontWeight: 700,
  },
  todayValue: {
    marginTop: 10,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  todayHint: {
    marginTop: 8,
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
  },
  logoutBtn: {
    fontSize: 14,
    fontWeight: 700,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    padding: "11px 14px",
    cursor: "pointer",
    backdropFilter: "blur(4px)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  tile: {
    minHeight: 182,
    border: "1px solid rgba(15,23,42,0.08)",
    borderRadius: 22,
    padding: 18,
    textDecoration: "none",
    color: "#0f172a",
    background: "linear-gradient(180deg, #ffffff, #f8fbff)",
    boxShadow: "0 14px 36px rgba(15,23,42,0.08)",
    display: "flex",
    flexDirection: "column",
  },
  tilePrimary: {
    background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
    border: "1px solid rgba(37,99,235,0.18)",
  },
  tileIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#eef4ff",
    color: "#1d4ed8",
    marginBottom: 16,
  },
  tileIconPrimary: {
    width: 46,
    height: 46,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #2563eb, #60a5fa)",
    color: "#fff",
    marginBottom: 16,
    boxShadow: "0 10px 24px rgba(37,99,235,0.28)",
  },
  iconSvg: {
    width: 22,
    height: 22,
    display: "block",
  },
  tileTitle: {
    fontSize: 19,
    fontWeight: 800,
    marginBottom: 8,
    letterSpacing: "-0.02em",
  },
  tileDesc: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 1.45,
  },
  list: {
    margin: "6px 0 0 18px",
    padding: 0,
    color: "#475569",
    fontSize: 14,
    lineHeight: 1.7,
  },
  footerNote: {
    marginTop: 16,
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
  },
};
