// components/AppShell.js
import AppSidebar from "./AppSidebar";

export default function AppShell({ children, profile, title, subtitle, right }) {
  return (
    <div style={styles.wrap}>
      <AppSidebar profile={profile} />

      <div style={styles.main}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.headerMark} aria-hidden="true" />
            <div>
              <div style={styles.eyebrow}>SkipLogic</div>
              <h1 style={styles.h1}>{title || "Dashboard"}</h1>
              <div style={styles.sub}>
                {subtitle || "Everything you need for day-to-day ops."}
              </div>
            </div>
          </div>

          {right ? <div style={styles.right}>{right}</div> : null}
        </header>

        <div style={styles.content}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--text)",
  },

  main: {
    marginLeft: 270,
    minHeight: "100vh",
    padding: 18,
    background:
      "radial-gradient(closest-side at 20% 10%, rgba(58,181,255,0.05), transparent 55%)," +
      "radial-gradient(closest-side at 80% 15%, rgba(55,245,155,0.05), transparent 55%)," +
      "var(--bg)",
  },

  header: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-xl)",
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    boxShadow: "var(--shadow-1)",
  },

  headerLeft: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    minWidth: 260,
  },

  headerMark: {
    width: 38,
    height: 38,
    borderRadius: "14px",
    background: "linear-gradient(135deg, var(--brand-mint), var(--brand-sky))",
    border: "1px solid rgba(15,23,42,0.06)",
    flex: "0 0 auto",
    marginTop: 2,
  },

  eyebrow: {
    fontSize: 11,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
    fontWeight: 800,
  },

  h1: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
    color: "var(--text)",
    fontWeight: 900,
  },

  sub: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 1.45,
    color: "var(--text-muted)",
  },

  right: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },

  content: {
    marginTop: 16,
  },
};
