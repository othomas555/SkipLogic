// components/AppSidebar.js
import Link from "next/link";
import { useRouter } from "next/router";

function Icon({ name }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  const stroke = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

  switch (name) {
    case "dashboard":
      return (
        <svg {...common}>
          <path {...stroke} d="M3 13h8V3H3v10zM13 21h8V11h-8v10zM13 3h8v6h-8V3zM3 17h8v4H3v-4z" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 5v14M5 12h14" />
          <path {...stroke} d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V7z" />
        </svg>
      );
    case "jobs":
      return (
        <svg {...common}>
          <path {...stroke} d="M9 6h11M9 12h11M9 18h11" />
          <path {...stroke} d="M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      );
    case "planner":
      return (
        <svg {...common}>
          <path {...stroke} d="M8 7V3m8 4V3M3 9h18" />
          <path {...stroke} d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
        </svg>
      );
    case "route":
      return (
        <svg {...common}>
          <path {...stroke} d="M5 17l4-4 4 4 6-6" />
          <path {...stroke} d="M5 7h.01M19 11h.01M13 17h.01" />
        </svg>
      );
    case "customers":
      return (
        <svg {...common}>
          <path {...stroke} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <path {...stroke} d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        </svg>
      );
    case "drivers":
      return (
        <svg {...common}>
          <path {...stroke} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <path {...stroke} d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          <path {...stroke} d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path {...stroke} d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
          <path
            {...stroke}
            d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0-.1 1 7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1l.4 2.6h4l.4-2.6a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5z"
          />
        </svg>
      );
    case "import":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 3v12" />
          <path {...stroke} d="M7 8l5-5 5 5" />
          <path {...stroke} d="M5 21h14a2 2 0 0 0 2-2v-4H3v4a2 2 0 0 0 2 2z" />
        </svg>
      );
    case "admin":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4z" />
          <path {...stroke} d="M9 12l2 2 4-4" />
        </svg>
      );
    case "finance":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 1v22" />
          <path {...stroke} d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path {...stroke} d="M12 2l10 10-10 10L2 12 12 2z" />
        </svg>
      );
  }
}

function NavGroup({ title, items, router }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={styles.groupTitle}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it) => {
          const active =
            router.pathname === it.href ||
            (it.activeStartsWith ? router.pathname.startsWith(it.activeStartsWith) : false);

          return (
            <Link key={it.href} href={it.href} style={{ ...styles.navItem, ...(active ? styles.navItemActive : null) }}>
              <span style={{ ...styles.iconWrap, ...(active ? styles.iconWrapActive : null) }}>
                <Icon name={it.icon} />
              </span>
              <span style={styles.label}>{it.label}</span>
              {it.badge ? <span style={styles.badge}>{it.badge}</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function AppSidebar({ profile }) {
  const router = useRouter();
  const isPlatformAdmin = profile?.role === "platform_admin";

  const groups = [
    {
      title: "Today",
      items: [
        { href: "/app", label: "Dashboard", icon: "dashboard" },
        { href: "/app/jobs/day-planner", label: "Day planner", icon: "planner", activeStartsWith: "/app/jobs/day-planner" },
        { href: "/app/jobs/scheduler", label: "Scheduler", icon: "planner", activeStartsWith: "/app/jobs/scheduler" },
        { href: "/app/routes", label: "Routes", icon: "route", activeStartsWith: "/app/routes" },
      ],
    },
    {
      title: "Bookings",
      items: [
        { href: "/app/jobs/book", label: "Book a job", icon: "book", badge: "Start" },
        { href: "/app/jobs/book-swap", label: "Book a swap", icon: "book" },
        { href: "/app/jobs", label: "Jobs", icon: "jobs", activeStartsWith: "/app/jobs" },
        { href: "/app/customers", label: "Customers", icon: "customers", activeStartsWith: "/app/customers" },
        { href: "/app/customers/new", label: "Add customer", icon: "customers" },
      ],
    },
    {
      title: "Drivers",
      items: [
        { href: "/app/driver", label: "Driver portal", icon: "drivers", activeStartsWith: "/app/driver" },
        { href: "/app/driver/run", label: "Driver run", icon: "drivers" },
        { href: "/app/drivers/run", label: "Runs (staff view)", icon: "drivers", badge: "Office" },
      ],
    },
    {
      title: "Setup",
      items: [
        { href: "/app/settings", label: "Settings", icon: "settings", activeStartsWith: "/app/settings" },
        { href: "/app/skip-types", label: "Skip types", icon: "settings" },
        { href: "/app/postcodes-served", label: "Postcodes served", icon: "settings" },
        { href: "/app/xero-accounts", label: "Xero accounts", icon: "finance" },
        { href: "/app/import/bookings", label: "Import bookings", icon: "import" },
      ],
    },
  ];

  const adminGroup = {
    title: "Admin / Platform",
    items: [
      { href: "/app/staff", label: "Staff tools", icon: "admin" },
      { href: "/app/staff-holidays", label: "Staff holidays", icon: "admin" },
      { href: "/app/_dev/create-invoice-test", label: "Dev: Create invoice test", icon: "admin", badge: "Dev" },
      { href: "/app/_dev/invoicing-api-test", label: "Dev: Invoicing API test", icon: "admin", badge: "Dev" },
    ],
  };

  return (
    <aside style={styles.sidebar}>
      <div style={styles.brand}>
        <div style={styles.brandMark}>SL</div>
        <div>
          <div style={styles.brandName}>SkipLogic</div>
          <div style={styles.brandSub}>Ops console</div>
        </div>
      </div>

      <div style={styles.nav}>
        {groups.map((g) => (
          <NavGroup key={g.title} title={g.title} items={g.items} router={router} />
        ))}
        {isPlatformAdmin ? <NavGroup title={adminGroup.title} items={adminGroup.items} router={router} /> : null}
      </div>

      <div style={styles.footer}>
        Signed in as <b style={{ color: "var(--d-ink)" }}>{profile?.email || "—"}</b>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: 270,
    background: "rgba(17, 28, 51, 0.95)", // lighter than before
    borderRight: "1px solid var(--d-border)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    zIndex: 20,
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 12,
    background: "rgba(241,245,255,0.05)",
    border: "1px solid rgba(241,245,255,0.10)",
    marginBottom: 12,
  },

  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: "linear-gradient(135deg, var(--brand-mint), rgba(58,181,255,0.9))",
    color: "#071013",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 13,
  },

  brandName: { fontWeight: 900, lineHeight: 1.1, color: "var(--d-ink)" },
  brandSub: { fontSize: 12, color: "var(--d-muted)", marginTop: 2 },

  nav: { flex: 1, overflowY: "auto", paddingRight: 4 },

  groupTitle: {
    fontSize: 11,
    fontWeight: 900,
    color: "rgba(241,245,255,0.62)",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    padding: "6px 8px",
  },

  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 12,
    textDecoration: "none",
    color: "rgba(241,245,255,0.86)",
    border: "1px solid transparent",
    background: "transparent",
  },

  navItemActive: {
    background: "rgba(241,245,255,0.06)",
    border: "1px solid rgba(58,181,255,0.30)",
  },

  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    background: "rgba(241,245,255,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(241,245,255,0.85)",
    flexShrink: 0,
  },

  iconWrapActive: {
    background: "rgba(58,181,255,0.18)",
    color: "rgba(241,245,255,0.95)",
  },

  label: { fontWeight: 750, fontSize: 13 },

  badge: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: 900,
    padding: "3px 8px",
    borderRadius: 999,
    background: "rgba(55,245,155,0.18)",
    border: "1px solid rgba(55,245,155,0.35)",
    color: "rgba(241,245,255,0.92)",
    whiteSpace: "nowrap",
  },

  footer: {
    paddingTop: 10,
    borderTop: "1px solid var(--d-border)",
    fontSize: 12,
    color: "var(--d-muted)",
  },
};
