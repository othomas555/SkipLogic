// pages/app/index.js
import { useRouter } from "next/router";
import { useAuthProfile } from "../../lib/useAuthProfile";

export default function AppDashboard() {
  const router = useRouter();
  const { checking, user, subscriberId, role, errorMsg: authError } =
    useAuthProfile();

  if (checking) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p>Loading SkipLogic dashboard…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: 24,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1>SkipLogic</h1>
        <p>You must be signed in to view the dashboard.</p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid #ccc",
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        maxWidth: 800,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>SkipLogic Dashboard</h1>

      {authError && (
        <p style={{ color: "red", marginBottom: 12 }}>{authError}</p>
      )}

      <p style={{ marginBottom: 4 }}>
        Signed in as <strong>{user.email}</strong>
      </p>

      {subscriberId && (
        <p style={{ marginBottom: 4 }}>
          Subscriber ID: <code>{subscriberId}</code>
        </p>
      )}

      {role && (
        <p style={{ marginBottom: 16 }}>
          Role: <strong>{role}</strong>
        </p>
      )}

      <section
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <DashboardLink href="/app/customers" title="Customers">
          Add and manage your customers.
        </DashboardLink>

        <DashboardLink href="/app/jobs" title="Jobs">
          Create and view skip hire jobs.
        </DashboardLink>

        <DashboardLink href="/app/jobs/scheduler" title="Scheduler">
          Plan daily runs and assign jobs to drivers.
        </DashboardLink>

        <DashboardLink href="/app/drivers" title="Drivers">
          Manage driver details and currencies.
        </DashboardLink>
      </section>
    </main>
  );
}

function DashboardLink({ href, title, children }) {
  return (
    <a
      href={href}
      style={{
        display: "block",
        padding: 12,
        borderRadius: 8,
        border: "1px solid #ddd",
        textDecoration: "none",
        color: "#222",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: 4,
          fontSize: 16,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 13, color: "#555" }}>{children}</div>
    </a>
  );
}
