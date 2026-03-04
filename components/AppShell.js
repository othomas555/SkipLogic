// components/AppShell.js
import AppSidebar from "./AppSidebar";

export default function AppShell({ children, profile, title, subtitle, right }) {
  return (
    <div style={styles.wrap}>
      <AppSidebar profile={profile} />

      <div style={styles.main}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.brandMark} aria-hidden="true" />
            <div>
              <div style={styles.eyebrow}>SkipLogic</div>
              <h1 style={styles.h1}>{title || "Dashboard"}</h1>
              <div style={styles.sub}>{subtitle || "Everything you need for day-to-day ops."}</div>
            </div>
          </div>

          <div style={styles.headerRight}>
            {right ? <div style={styles.rightSlot}>{right}</div> : null}
          </div>
        </header>

        <div style={styles.content}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    background: "var(--d-bg)",
    color: "var(--d-ink)",
  },

  main: {
    marginLeft: 270,
    minHeight: "100vh",
    padding: 18,
    background:
      "radial-gradient(closest-side at 18% 22%, rgba(55,245,155,0.10), transparent 55%)," +
      "radial-gradient(closest-side at 78% 30%, rgba(58,181,255,0.10), transparent 55%)," +
      "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.00))",
  },

  header: {
    background: "rgba(16, 26, 46, 0.78)", // --d-panel with glass
    border: "1px solid var(--d-border)",
    borderRadius: "var(--r-lg)",
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
  },

  headerLeft: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    minWidth: 260,
  },

  brandMark: {
    width: 38,
    height: 38,
    borderRadius: "var(--r-md)",
    background:
      "linear-gradient(135deg, rgba(55,245,155,0.95), rgba(58,181,255,0.90))",
    boxShadow: "0 10px 30px rgba(0,0,0,0.30)",
    border: "1px solid rgba(255,255,255,0.12)",
    flex: "0 0 auto",
    marginTop: 2,
  },

  eyebrow: {
    fontSize: 11,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    color: "rgba(234,240,255,0.70)",
    marginBottom: 6,
  },

  h1: {
    margin: 0,
    fontSize: 20,
    fontWeight: 950,
    letterSpacing: "-0.02em",
    color: "var(--d-ink)",
    lineHeight: 1.1,
  },

  sub: {
    marginTop: 6,
    fontSize: 13,
    color: "rgba(234,240,255,0.72)",
    lineHeight: 1.35,
  },

  headerRight: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },

  rightSlot: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },

  content: {
    marginTop: 14,
  },
};
