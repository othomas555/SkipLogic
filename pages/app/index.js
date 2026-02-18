// pages/app/index.js
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuthProfile } from "../../lib/useAuthProfile";

function QuickAction({ href, title, desc, badge }) {
  return (
    <Link href={href} style={styles.action}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 13, color: "#111827" }}>{title}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", lineHeight: 1.35 }}>{desc}</div>
        </div>
        {badge ? <span style={styles.badge}>{badge}</span> : null}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: "#2563eb", textDecoration: "underline" }}>Open →</div>
    </Link>
  );
}

function Stat({ label, value, tone = "neutral" }) {
  const toneStyle =
    tone === "warn"
      ? { background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" }
      : tone === "good"
      ? { background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534" }
      : { background: "#f9fafb", border: "1px solid #eef2f7", color: "#374151" };

  return (
    <div style={{ ...styles.stat, ...toneStyle }}>
      <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.9 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section style={{ marginTop: 14 }}>
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 14 }}>{title}</h2>
        {subtitle ? <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>{subtitle}</div> : null}
      </div>
      <div style={styles.grid}>{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { checking, user, subscriberId, profile, errorMsg } = useAuthProfile();

  // NOTE: auth guarding is now in pages/_app.js for /app routes,
  // but keeping this safe in case you visit /app directly during dev.
  if (checking) {
    return (
      <main style={styles.center}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={styles.center}>
        <div style={styles.card}>
          <h1 style={{ margin: 0 }}>SkipLogic</h1>
          <p style={{ marginTop: 8, color: "#6b7280" }}>You must be signed in.</p>
          <button style={styles.btnPrimary} onClick={() => router.push("/login")}>
            Go to login
          </button>
        </div>
      </main>
    );
  }

  return (
    <div>
      <div style={styles.topCard}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Today</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
              Quick access to the pages you’ll use all day.
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
              Subscriber: <b style={{ color: "#111827" }}>{subscriberId || "—"}</b> • User:{" "}
              <b style={{ color: "#111827" }}>{profile?.email || user?.email || "—"}</b>
            </div>
            {errorMsg ? <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 12 }}>{errorMsg}</div> : null}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <button style={styles.btnSecondary} onClick={() => router.push("/app/jobs/book")}>
              + Book job
            </button>
            <button style={styles.btnSecondary} onClick={() => router.push("/app/jobs/day-planner")}>
              Day planner
            </button>
            <button style={styles.btnSecondary} onClick={() => router.push("/app/jobs/scheduler")}>
              Scheduler
            </button>
          </div>
        </div>

        {/* Placeholder stats (wire these up later) */}
        <div style={styles.statsRow}>
          <Stat label="Jobs today" value="—" />
          <Stat label="Deliveries" value="—" />
          <Stat label="Collections" value="—" />
          <Stat label="Overdue vehicle items" value="—" tone="warn" />
        </div>
      </div>

      <Section title="Quick actions" subtitle="Most-used pages. Keep this tight.">
        <QuickAction href="/app/jobs/book" title="Book a job" desc="Create a new delivery booking." badge="Start here" />
        <QuickAction href="/app/jobs" title="Jobs" desc="All jobs with filters/sorting." />
        <QuickAction href="/app/jobs/day-planner" title="Day planner" desc="Plan the day by work date." />
        <QuickAction href="/app/jobs/scheduler" title="Scheduler" desc="Schedule deliveries / collections." />
        <QuickAction href="/app/routes" title="Route map" desc="Map view for routes / stops." />
        <QuickAction href="/app/drivers/run" title="Runs (staff)" desc="Group jobs into driver runs." />
      </Section>

      <Section title="Customers & accounts" subtitle="Customer records, credit and history.">
        <QuickAction href="/app/customers" title="Customers" desc="Search, create and edit customers." />
        <QuickAction href="/app/customers/new" title="Add customer" desc="Create a customer record." />
        <QuickAction href="/app/settings/invoicing" title="Invoicing" desc="Invoice behaviour + Xero wiring." />
        <QuickAction href="/app/xero-accounts" title="Xero accounts" desc="View Xero accounts/bank accounts." badge="Ref" />
      </Section>

      <Section title="Fleet, drivers & waste" subtitle="Compliance, vehicles, driver setup and reporting.">
        <QuickAction href="/app/vehicles" title="Vehicles" desc="Fleet list + compliance badges." />
        <QuickAction href="/app/drivers" title="Drivers" desc="Manage drivers." />
        <QuickAction href="/app/driver" title="Driver portal" desc="Driver work list (deliver / collect / swap)." />
        <QuickAction href="/app/waste/out" title="Waste out" desc="Waste movements (outbound loads)." />
        <QuickAction href="/app/waste/returns" title="Waste returns" desc="Returns / quarterly reporting." />
        <QuickAction href="/app/settings/vehicles" title="Vehicle alerts" desc="Daily compliance alert settings." />
      </Section>

      <Section title="Setup & tools" subtitle="Lower-frequency tools and configuration.">
        <QuickAction href="/app/settings" title="Settings home" desc="All settings sections." />
        <QuickAction href="/app/settings/waste" title="Waste settings" desc="Outlets, EWC codes, waste config." />
        <QuickAction href="/app/settings/emails" title="Emails" desc="Email templates / sending configuration." />
        <QuickAction href="/app/skip-types" title="Skip types" desc="Manage skip types." />
        <QuickAction href="/app/postcodes-served" title="Postcodes served" desc="Coverage rules by postcode." />
        <QuickAction href="/app/import/bookings" title="Import bookings" desc="Import historical bookings from CSV." />
      </Section>
    </div>
  );
}

const styles = {
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "#f7f7f7",
    padding: 20,
  },
  card: {
    width: "min(520px, 100%)",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  topCard: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  statsRow: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  stat: {
    borderRadius: 14,
    padding: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
  action: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 14,
    textDecoration: "none",
    color: "inherit",
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  badge: {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    background: "#eef6ff",
    color: "#0b3d91",
    border: "1px solid #b6d7ff",
    whiteSpace: "nowrap",
  },
  btnPrimary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
  },
  btnSecondary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    color: "#111827",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
  },
};
