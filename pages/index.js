// pages/app/index.js
import Link from "next/link";
import { useAuthProfile } from "../lib/useAuthProfile";

export default function AppDashboardPage() {
  const { checking, user, subscriberId, errorMsg } = useAuthProfile();

  if (checking) {
    return <p style={{ padding: "16px" }}>Loading...</p>;
  }

  if (!user) {
    return (
      <div style={{ padding: "16px" }}>
        <p>You need to be logged in to view the app.</p>
        <Link href="/login">Go to login</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ marginBottom: "8px" }}>SkipLogic Dashboard</h1>
      <p style={{ marginBottom: "24px" }}>
        Welcome back{user.email ? `, ${user.email}` : ""}.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <DashboardCard
          title="Jobs"
          description="Create and manage skip jobs, deliveries, and collections."
          href="/app/jobs"
        />
        <DashboardCard
          title="Customers"
          description="Add and edit your customer accounts."
          href="/app/customers"
        />
        <DashboardCard
          title="Drivers"
          description="View drivers and assign work (future: driver app)."
          href="/app/drivers"
        />
        <DashboardCard
          title="Staff & Holidays"
          description="Manage staff details and holidays."
          href="/app/staff"
        />
        <DashboardCard
          title="Skip Types & Pricing"
          description="Configure skip sizes and pricing."
          href="/app/skip-types"
        />
        <DashboardCard
          title="Settings"
          description="Subscriber / company settings (coming later)."
          href="/app/settings"
        />
      </div>
    </div>
  );
}

function DashboardCard({ title, description, href }) {
  return (
    <Link
      href={href}
      style={{
        border: "1px solid #ddd",
        borderRadius: "8px",
        padding: "16px",
        textDecoration: "none",
        color: "inherit",
        display: "block",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "8px" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>
        {description}
      </p>
    </Link>
  );
}
