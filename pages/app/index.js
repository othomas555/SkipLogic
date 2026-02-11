// pages/app/index.js
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuthProfile } from "../../lib/useAuthProfile";

function Card({ href, title, desc, badge }) {
  return (
    <Link href={href} style={cardLink}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 14, color: "#111" }}>{title}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#666", lineHeight: 1.35 }}>{desc}</div>
        </div>
        {badge ? <span style={badgeStyle}>{badge}</span> : null}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: "#0070f3", textDecoration: "underline" }}>Open →</div>
    </Link>
  );
}

function Section({ title, children, subtitle }) {
  return (
    <section style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 14 }}>{title}</h2>
        {subtitle ? <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>{subtitle}</div> : null}
      </div>
      <div style={grid}>{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { checking, user, subscriberId, profile, errorMsg } = useAuthProfile();

  if (checking) {
    return (
      <main style={centerStyle}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1 style={{ margin: 0 }}>SkipLogic</h1>
        <p style={{ color: "#666" }}>You must be signed in.</p>
        <button style={btnPrimary} onClick={() => router.push("/login")}>
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Everything you need for day-to-day ops.
          </p>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 12 }}>
            Subscriber: <b>{subscriberId || "—"}</b> • User: <b>{profile?.email || user?.email || "—"}</b>
          </p>
          {errorMsg ? <p style={{ margin: "8px 0 0", color: "red" }}>{errorMsg}</p> : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={() => router.push("/app/routes")}>Route map</button>
          <button style={btnSecondary} onClick={() => router.push("/app/settings")}>Settings</button>
        </div>
      </header>

      <Section
        title="Operations"
        subtitle="Booking, planning and running the day."
      >
        <Card href="/app/jobs/book" title="Book a job" desc="Create a new delivery booking." badge="Start here" />
        <Card href="/app/jobs" title="Jobs" desc="All jobs with filters/sorting." />
        <Card href="/app/jobs/day-planner" title="Day planner" desc="Plan the day by work date." />
        <Card href="/app/jobs/scheduler" title="Scheduler" desc="Schedule deliveries / collections." />
        <Card href="/app/staff" title="Staff" desc="Staff tools and internal pages." />
      </Section>

      <Section
        title="Customers"
        subtitle="Customers, credit, and history."
      >
        <Card href="/app/customers" title="Customers" desc="Search, create and edit customers." />
        <Card href="/app/customers/new" title="Add customer" desc="Create a customer record." />
      </Section>

      <Section
        title="Drivers"
        subtitle="Driver portal, runs and driver setup."
      >
        <Card href="/app/driver" title="Driver portal" desc="Driver work list (deliver / collect / swap)." />
        <Card href="/app/driver/run" title="Driver run" desc="Run view for the driver." />
        <Card href="/app/drivers" title="Drivers" desc="Manage drivers." />
        <Card href="/app/drivers/run" title="Drivers run" desc="Staff run view / grouping." />
      </Section>

      <Section
        title="Fleet"
        subtitle="Vehicles and compliance."
      >
        <Card href="/app/vehicles" title="Vehicles" desc="Fleet list + compliance badges." />
      </Section>

      <Section
        title="Waste"
        subtitle="Waste out + returns."
      >
        <Card href="/app/waste/out" title="Waste out" desc="Waste movements (outbound loads)." />
        <Card href="/app/waste/returns" title="Waste returns" desc="Returns / quarterly reporting." />
      </Section>

      <Section
        title="Settings"
        subtitle="Operational settings, pricing and integrations."
      >
        <Card href="/app/settings" title="Settings home" desc="All settings sections." />
        <Card href="/app/settings/invoicing" title="Invoicing" desc="Invoice behaviour + Xero wiring." />
        <Card href="/app/settings/emails" title="Emails" desc="Email templates / sending configuration." />
        <Card href="/app/settings/waste" title="Waste settings" desc="Outlets, EWC codes, waste config." />
        <Card href="/app/settings/vehicles" title="Vehicle alerts" desc="Daily compliance alert settings." />
        <Card href="/app/settings/skip-hire-extras" title="Skip hire extras" desc="Extras and rules." />
        <Card href="/app/skip-types" title="Skip types" desc="Manage skip types." />
        <Card href="/app/postcodes-served" title="Postcodes served" desc="Coverage rules by postcode." />
      </Section>

      <Section
        title="Imports"
        subtitle="Tools for bringing data in."
      >
        <Card href="/app/import/bookings" title="Import bookings" desc="Import historical bookings from CSV." />
      </Section>

      <Section
        title="Admin / Platform"
        subtitle="Multi-tenant admin pages (usually not daily use)."
      >
        <Card href="/app/platform/subscribers" title="Subscribers" desc="Platform subscriber list." badge="Admin" />
      </Section>

      <Section
        title="Finance (reference)"
        subtitle="Integration helper pages."
      >
        <Card href="/app/xero-accounts" title="Xero accounts" desc="View Xero accounts/bank accounts." />
      </Section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f7f7f7",
};

const centerStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const cardLink = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  textDecoration: "none",
  color: "inherit",
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const badgeStyle = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  background: "#eef6ff",
  color: "#0b3d91",
  border: "1px solid #b6d7ff",
  whiteSpace: "nowrap",
};

const btnPrimary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #0070f3",
  background: "#0070f3",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontSize: 13,
};
