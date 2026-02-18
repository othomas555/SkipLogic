// components/AppShell.js
import { useRouter } from "next/router";
import AppSidebar from "./AppSidebar";

export default function AppShell({ children, profile, title, subtitle, right }) {
  const router = useRouter();

  return (
    <div style={styles.wrap}>
      <AppSidebar profile={profile} />

      <div style={styles.main}>
        <header style={styles.header}>
          <div>
            <div style={styles.titleRow}>
              <h1 style={styles.h1}>{title || "Dashboard"}</h1>
              <div style={{ marginLeft: 10, color: "#6b7280", fontSize: 12 }}>
                {subtitle || "Everything you need for day-to-day ops."}
              </div>
            </div>

            <div style={styles.meta}>
              <span style={styles.metaPill}>
                Path: <b>{router.pathname}</b>
              </span>
              {profile?.subscriber_id ? (
                <span style={styles.metaPill}>
                  Subscriber: <b>{profile.subscriber_id}</b>
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{right}</div>
        </header>

        <div style={styles.content}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    background: "#f7f7f7",
  },
  main: {
    marginLeft: 270,
    minHeight: "100vh",
    padding: 18,
  },
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
  titleRow: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
  },
  h1: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "#111827",
  },
  meta: {
    marginTop: 10,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  metaPill: {
    fontSize: 12,
    color: "#374151",
    background: "#f9fafb",
    border: "1px solid #eef2f7",
    padding: "6px 10px",
    borderRadius: 999,
  },
  content: {
    marginTop: 14,
  },
};
