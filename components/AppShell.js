// components/AppShell.js
import AppSidebar from "./AppSidebar";

export default function AppShell({ children, profile, title, subtitle, right }) {
  return (
    <div style={styles.wrap}>
      <AppSidebar profile={profile} />

      <div style={styles.main}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.h1}>{title || "Dashboard"}</h1>
            <div style={styles.sub}>{subtitle || "Everything you need for day-to-day ops."}</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{right}</div>
        </header>

        <div style={styles.content}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  wrap: { minHeight: "100vh", background: "#f7f7f7" },
  main: { marginLeft: 270, minHeight: "100vh", padding: 18 },
  header: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  h1: { margin: 0, fontSize: 18, fontWeight: 900, color: "#111827" },
  sub: { marginTop: 6, fontSize: 12, color: "#6b7280" },
  content: { marginTop: 14 },
};
