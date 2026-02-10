// pages/app/index.js
import Link from "next/link";
import { useAuthProfile } from "../../lib/useAuthProfile";

export default function AppDashboardPage() {
  const { checking, user, errorMsg } = useAuthProfile();

  if (checking) {
    return <p style={{ padding: "16px" }}>Checking your session…</p>;
  }

  if (!user) {
    // useAuthProfile will usually redirect to /login; this is just a fallback.
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
      {errorMsg && (
        <p style={{ color: "red", marginBottom: "16px" }}>{errorMsg}</p>
      )}
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
        {/* Jobs area */}
        <DashboardCard
          title="Jobs"
          description="View and manage skip jobs."
          href="/app/jobs"
        />
        <DashboardCard
          title="Book a Job"
          description="Create a new skip booking."
          href="/app/jobs/book"
        />
        <DashboardCard
          title="Day Planner"
          description="Plan deliveries and collections."
          href="/app/jobs/day-planner"
        />
        <DashboardCard
          title="Scheduler"
          description="Drag-and-drop runs and routes."
          href="/app/jobs/scheduler"
        />

        {/* Waste */}
        <DashboardCard
          title="Waste Out"
          description="Record waste transfers (WTN, tonnes, outlet, EWC)."
          href="/app/waste/out"
        />
        <DashboardCard
          title="Waste Returns"
          description="Quarterly totals + CSV export (coming next)."
          href="/app/waste/returns"
        />

        {/* Customers & people */}
        <DashboardCard
          title="Customers"
          description="Customer accounts and sites."
          href="/app/customers"
        />
        <DashboardCard
          title="Staff"
          description="Staff details and roles."
          href="/app/staff"
        />
        <DashboardCard
          title="Staff Holidays"
          description="Holiday requests and approvals."
          href="/app/staff-holidays"
        />
        <DashboardCard
          title="Drivers"
          description="Driver details and assignments."
          href="/app/drivers"
        />

        {/* Configuration */}
        <DashboardCard
          title="Skip Types & Pricing"
          description="Configure skip sizes and prices."
          href="/app/skip-types"
        />
        <DashboardCard
          title="Postcodes Served"
          description="Define service areas for pricing."
          href="/app/postcodes-served"
        />
        <DashboardCard
          title="Waste Settings"
          description="Manage outlets, EWC codes, regulator (NRW/EA)."
          href="/app/settings/waste"
        />
        <DashboardCard
          title="Settings"
          description="Company details, Xero, emails."
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
