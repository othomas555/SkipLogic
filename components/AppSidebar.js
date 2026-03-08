import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

const NAV_SECTIONS = [
  {
    title: null,
    items: [{ href: "/app", label: "Dashboard", match: ["/app"] }],
  },

  {
    title: "Jobs",
    items: [
      { href: "/app/jobs", label: "Jobs", match: ["/app/jobs", "/app/jobs/[id]"] },
      { href: "/app/jobs/book", label: "Book Job", match: ["/app/jobs/book"] },
      { href: "/app/jobs/book-swap", label: "Book Swap", match: ["/app/jobs/book-swap"] },
      { href: "/app/jobs/scheduler", label: "Scheduler", match: ["/app/jobs/scheduler"] },
    ],
  },

  {
    title: "Customers",
    items: [
      {
        href: "/app/customers",
        label: "Customers",
        match: [
          "/app/customers",
          "/app/customers/[id]",
          "/app/customers/[id]/history",
          "/app/customers/[id]/credit-application",
        ],
      },
      { href: "/app/customers/new", label: "New Customer", match: ["/app/customers/new"] },
    ],
  },

  {
    title: "Drivers & Vehicles",
    items: [
      { href: "/app/drivers", label: "Drivers", match: ["/app/drivers"] },
      { href: "/app/drivers/run", label: "Driver Runs", match: ["/app/drivers/run"] },
      { href: "/app/vehicles", label: "Vehicles", match: ["/app/vehicles", "/app/vehicles/[id]"] },
    ],
  },

  {
    title: "Operations",
    items: [
      { href: "/app/postcodes-served", label: "Postcodes Served", match: ["/app/postcodes-served"] },
      { href: "/app/skip-types", label: "Skip Types", match: ["/app/skip-types"] },
      { href: "/app/import/bookings", label: "Import Bookings", match: ["/app/import/bookings"] },
    ],
  },

  {
    title: "Waste & Compliance",
    items: [
      { href: "/app/waste/out", label: "Waste Out", match: ["/app/waste/out"] },
      { href: "/app/waste/returns", label: "Waste Returns", match: ["/app/waste/returns"] },
    ],
  },

  {
    title: "Team",
    items: [
      { href: "/app/staff", label: "Staff", match: ["/app/staff"] },
      { href: "/app/staff-holidays", label: "Staff Holidays", match: ["/app/staff-holidays"] },
    ],
  },

  {
    title: "Finance",
    items: [{ href: "/app/xero-accounts", label: "Xero Accounts", match: ["/app/xero-accounts"] }],
  },

  {
    title: "Settings",
    items: [
      { href: "/app/settings", label: "General", match: ["/app/settings"] },
      { href: "/app/settings/emails", label: "Emails", match: ["/app/settings/emails"] },
      { href: "/app/settings/invoicing", label: "Invoicing", match: ["/app/settings/invoicing"] },
      { href: "/app/settings/subscription", label: "Subscription", match: ["/app/settings/subscription"] },
      {
        href: "/app/settings/skip-hire-extras",
        label: "Skip Hire Extras",
        match: ["/app/settings/skip-hire-extras"],
      },
      { href: "/app/settings/vehicles", label: "Vehicle Settings", match: ["/app/settings/vehicles"] },
      { href: "/app/settings/waste", label: "Waste Settings", match: ["/app/settings/waste"] },
    ],
  },

  {
    title: "Platform",
    items: [
      {
        href: "/app/platform/subscribers",
        label: "Subscribers",
        match: ["/app/platform/subscribers", "/app/platform/subscribers/[id]"],
      },
    ],
  },
];

export default function AppSidebar({ profile }) {
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.top}>
        <div style={styles.logo}>
          <div style={styles.logoMark} />
          <div>
            <div style={styles.logoText}>SkipLogic</div>
            <div style={styles.logoSub}>Operations</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {NAV_SECTIONS.map((section, idx) => (
            <div key={section.title || `section-${idx}`} style={styles.section}>
              {section.title ? <div style={styles.sectionTitle}>{section.title}</div> : null}

              <div style={styles.sectionItems}>
                {section.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    router={router}
                    match={item.match}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div style={styles.userSection}>
        <div style={styles.userCard}>
          <div style={styles.userName}>{profile?.full_name || "User"}</div>
          <div style={styles.userEmail}>{profile?.email || ""}</div>
        </div>

        <button onClick={logout} style={styles.logout}>
          Log out
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({ href, label, router, match = [] }) {
  const active = router.pathname === href || match.includes(router.pathname);

  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        style={{
          ...styles.link,
          ...(active ? styles.linkActive : {}),
        }}
      >
        {label}
      </div>
    </Link>
  );
}

const styles = {
  sidebar: {
    position: "fixed",
    left: 0,
    top: 0,
    bottom: 0,
    width: 270,
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  top: {
    flex: 1,
    overflowY: "auto",
    padding: 18,
  },

  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },

  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "linear-gradient(135deg, var(--brand-mint), var(--brand-sky))",
  },

  logoText: {
    fontWeight: 900,
    fontSize: 16,
  },

  logoSub: {
    fontSize: 12,
    color: "var(--text-muted)",
  },

  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  section: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    padding: "0 10px",
  },

  sectionItems: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  link: {
    padding: "10px 12px",
    borderRadius: 10,
    fontSize: 14,
    color: "var(--text)",
    cursor: "pointer",
  },

  linkActive: {
    background: "var(--surface-2)",
    fontWeight: 700,
  },

  userSection: {
    borderTop: "1px solid var(--border)",
    padding: 12,
  },

  userCard: {
    marginBottom: 10,
  },

  userName: {
    fontSize: 14,
    fontWeight: 700,
  },

  userEmail: {
    fontSize: 12,
    color: "var(--text-muted)",
  },

  logout: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    cursor: "pointer",
    fontSize: 13,
  },
};
