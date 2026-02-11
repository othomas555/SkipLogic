// pages/app/index.js
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuthProfile } from "../../lib/useAuthProfile";

function CardLink({ href, title, desc }) {
  return (
    <Link href={href} style={cardLink}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: "#111" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.3 }}>{desc}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#0070f3", textDecoration: "underline" }}>
          Open →
        </div>
      </div>
    </Link>
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
            Quick links to everything in SkipLogic.
          </p>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 12 }}>
            Subscriber: <b>{subscriberId || "—"}</b> • User: <b>{profile?.email || user?.email || "—"}</b>
          </p>
          {errorMsg ? <p style={{ margin: "8px 0 0", color: "red" }}>{errorMsg}</p> : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={() => router.push("/app/settings")}>Settings</button>
        </div>
      </header>

      <section style={grid}>
        {/* Core */}
        <CardLink href="/app/jobs" title="Jobs" desc="Search, filter, sort, view and manage jobs." />
        <CardLink href="/app/jobs/book" title="Book a job" desc="Create a new delivery / collection / swap booking." />
        <CardLink href="/app/customers" title="Customers" desc="Customer records, credit settings, view history." />

        {/* Ops */}
        <CardLink href="/app/scheduler" title="Scheduler" desc="Plan deliveries/collections and driver runs." />
        <CardLink href="/app/driver" title="Driver portal" desc="Driver work list and mark jobs complete." />
        <CardLink href="/app/drivers" title="Drivers" desc="Manage drivers (active/inactive, details)." />

        {/* Fleet */}
        <CardLink href="/app/vehicles" title="Vehicles" desc="Fleet register + compliance dates and status." />

        {/* Waste */}
        <CardLink href="/app/waste/out" title="Waste out" desc="Waste movements / outbound loads (if enabled)." />
        <CardLink href="/app/settings/waste" title="Waste settings" desc="Outlets, EWC codes, waste configuration." />

        {/* Finance */}
        <CardLink href="/app/settings/invoicing" title="Invoicing settings" desc="Invoice numbering + Xero settings." />
        <CardLink href="/app/settings/emails" title="Email settings" desc="Outbound email templates/config." />

        {/* Admin / Tools */}
        <CardLink href="/app/import/bookings" title="Import bookings" desc="Import historical bookings from CSV." />
        <CardLink href="/app/staff" title="Staff" desc="Staff tools / internal pages (if enabled)." />
        <CardLink href="/app/settings/vehicles" title="Vehicle alerts" desc="Daily compliance alerts configuration." />
        <CardLink href="/app/settings/term-hire" title="Term hire" desc="Term hire reminders and rules." />
      </section>

      <section style={cardStyle}>
        <h2 style={{ margin: "0 0 10px", fontSize: 14 }}>Next step</h2>
        <p style={{ margin: 0, color: "#666", fontSize: 12 }}>
          Run <code>node scripts/list-routes.js</code> and paste the JSON here — I’ll replace this dashboard
          with an auto-curated set of links that exactly matches your repo (no dead links).
        </p>
      </section>
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
  marginBottom: 14,
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const cardLink = {
  ...cardStyle,
  textDecoration: "none",
  color: "inherit",
  display: "block",
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
