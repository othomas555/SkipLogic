// pages/app/index.js
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuthProfile } from "../../lib/useAuthProfile";

import AppCard from "../../components/ui/AppCard";
import AppButton from "../../components/ui/AppButton";

function QuickAction({ href, title, desc, badge }) {
  return (
    <Link href={href} style={styles.action}>
      <div style={styles.actionTop}>
        <div>
          <div style={styles.actionTitle}>{title}</div>
          <div style={styles.actionDesc}>{desc}</div>
        </div>

        {badge ? <span style={styles.badge}>{badge}</span> : null}
      </div>

      <div style={styles.openLink}>Open →</div>
    </Link>
  );
}

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHead}>
        <h2 style={styles.sectionTitle}>{title}</h2>
        {subtitle ? <div style={styles.sectionSub}>{subtitle}</div> : null}
      </div>

      <div style={styles.grid}>{children}</div>
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { checking, user, subscriberId, profile, errorMsg } = useAuthProfile();

  if (checking) {
    return <p style={styles.loading}>Loading…</p>;
  }

  if (!user) {
    return (
      <AppCard title="Authentication required">
        <p style={styles.cardText}>You must be signed in.</p>
        <AppButton onClick={() => router.push("/login")}>Go to login</AppButton>
      </AppCard>
    );
  }

  return (
    <div style={styles.page}>
      <AppCard
        title="Today"
        subtitle="Quick access to the pages you’ll use all day."
        right={
          <div style={styles.buttonRow}>
            <AppButton onClick={() => router.push("/app/jobs/book")}>+ Book job</AppButton>

            <AppButton
              variant="secondary"
              onClick={() => router.push("/app/jobs/day-planner")}
            >
              Day planner
            </AppButton>

            <AppButton
              variant="secondary"
              onClick={() => router.push("/app/jobs/scheduler")}
            >
              Scheduler
            </AppButton>
          </div>
        }
      >
        <div style={styles.statsRow}>
          <Stat label="Jobs today" value="—" />
          <Stat label="Deliveries" value="—" />
          <Stat label="Collections" value="—" />
          <Stat label="Vehicle alerts" value="—" />
        </div>

        <div style={styles.accountRow}>
          Subscriber: <b>{subscriberId || "—"}</b> • User:{" "}
          <b>{profile?.email || user?.email || "—"}</b>
        </div>

        {errorMsg ? <div style={styles.error}>{errorMsg}</div> : null}
      </AppCard>

      <Section title="Quick actions" subtitle="Most-used pages.">
        <QuickAction href="/app/jobs/book" title="Book a job" desc="Create a new booking." badge="Start" />
        <QuickAction href="/app/jobs" title="Jobs" desc="All jobs with filters." />
        <QuickAction href="/app/jobs/day-planner" title="Day planner" desc="Plan jobs by work date." />
        <QuickAction href="/app/jobs/scheduler" title="Scheduler" desc="Schedule deliveries and collections." />
        <QuickAction href="/app/routes" title="Route map" desc="Map view for routes." />
        <QuickAction href="/app/drivers/run" title="Runs (staff)" desc="Driver run management." />
      </Section>

      <Section title="Customers & accounts" subtitle="Customer records, invoicing and account tools.">
        <QuickAction href="/app/customers" title="Customers" desc="Search and manage customers." />
        <QuickAction href="/app/customers/new" title="Add customer" desc="Create a customer." />
        <QuickAction href="/app/settings/invoicing" title="Invoicing" desc="Invoice behaviour + Xero." />
        <QuickAction href="/app/xero-accounts" title="Xero accounts" desc="View Xero accounts." badge="Ref" />
      </Section>

      <Section title="Fleet & drivers" subtitle="Vehicles, drivers and waste operations.">
        <QuickAction href="/app/vehicles" title="Vehicles" desc="Fleet and compliance." />
        <QuickAction href="/app/drivers" title="Drivers" desc="Manage drivers." />
        <QuickAction href="/app/driver" title="Driver portal" desc="Driver work list." />
        <QuickAction href="/app/waste/out" title="Waste out" desc="Outbound waste loads." />
        <QuickAction href="/app/waste/returns" title="Waste returns" desc="Quarterly reporting." />
      </Section>

      <Section title="Setup & tools" subtitle="Configuration and lower-frequency tools.">
        <QuickAction href="/app/settings" title="Settings" desc="All configuration." />
        <QuickAction href="/app/settings/waste" title="Waste settings" desc="Outlets and EWC codes." />
        <QuickAction href="/app/settings/emails" title="Emails" desc="Email templates." />
        <QuickAction href="/app/skip-types" title="Skip types" desc="Manage skip types." />
        <QuickAction href="/app/postcodes-served" title="Postcodes served" desc="Coverage rules." />
        <QuickAction href="/app/import/bookings" title="Import bookings" desc="Import bookings CSV." />
      </Section>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },

  loading: {
    color: "var(--d-ink)",
    margin: 0,
  },

  cardText: {
    marginTop: 0,
    marginBottom: 12,
    color: "var(--text)",
  },

  buttonRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 12,
  },

  stat: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    padding: 14,
  },

  statLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 800,
  },

  statValue: {
    fontSize: 22,
    fontWeight: 900,
    marginTop: 8,
    color: "var(--text)",
    lineHeight: 1,
  },

  accountRow: {
    marginTop: 14,
    fontSize: 12,
    color: "var(--text-muted)",
  },

  error: {
    marginTop: 10,
    fontSize: 12,
    color: "#b91c1c",
  },

  section: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  sectionHead: {
    paddingLeft: 2,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.15,
    color: "var(--d-ink)",
    letterSpacing: "-0.02em",
  },

  sectionSub: {
    marginTop: 4,
    fontSize: 13,
    color: "var(--d-muted)",
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
    gap: 12,
  },

  action: {
    background: "var(--d-panel)",
    border: "1px solid var(--d-border)",
    borderRadius: "var(--r-md)",
    padding: 14,
    textDecoration: "none",
    color: "var(--d-ink)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
  },

  actionTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },

  actionTitle: {
    fontWeight: 900,
    fontSize: 14,
    color: "var(--d-ink)",
  },

  actionDesc: {
    marginTop: 6,
    fontSize: 13,
    color: "var(--d-muted)",
    lineHeight: 1.45,
  },

  openLink: {
    marginTop: 12,
    fontSize: 13,
    color: "#67c3ff",
    fontWeight: 700,
  },

  badge: {
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    background: "rgba(55,245,155,0.18)",
    border: "1px solid rgba(55,245,155,0.35)",
    color: "var(--d-ink)",
    whiteSpace: "nowrap",
  },
};
