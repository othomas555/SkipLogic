// pages/driver/checks.js
import { useRouter } from "next/router";

export default function DriverChecksPage() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/driver/logout", { method: "POST" }).catch(() => {});
    router.replace("/driver");
  }

  return (
    <main style={pageStyle}>
      <div style={topNav}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => router.push("/driver/work")} style={navBtn}>
            Run
          </button>
          <button type="button" onClick={() => router.push("/driver/checks")} style={navBtnActive}>
            Vehicle checks
          </button>
        </div>

        <button type="button" onClick={logout} style={navBtnDanger}>
          Logout
        </button>
      </div>

      <div style={cardStyle}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Vehicle checks</h1>
        <p style={{ marginTop: 8, color: "#555" }}>
          Coming next: daily walkaround checks (tyres, lights, beacons, mirrors, chains, load security, etc.)
        </p>

        <div style={hintBox}>
          When you’re ready, tell me:
          <ul style={{ marginTop: 8 }}>
            <li>What checks you want (tick list)</li>
            <li>Do you want photos required for certain items?</li>
            <li>Does it need to be per-vehicle, per-driver, or both?</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 14,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f6f6f6",
};

const topNav = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 12,
  flexWrap: "wrap",
};

const navBtn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};

const navBtnActive = {
  ...navBtn,
  border: "1px solid #111",
};

const navBtnDanger = {
  padding: "10px 12px",
  borderRadius: 12,
  border: 0,
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const cardStyle = {
  background: "#fff",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};

const hintBox = {
  marginTop: 12,
  borderRadius: 12,
  border: "1px solid #eee",
  background: "#fafafa",
  padding: 12,
  color: "#333",
};
