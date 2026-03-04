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
        </svg>
      );
    case "import":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 3v12" />
          <path {...stroke} d="M7 8l5-5 5 5" />
        </svg>
      );
    case "admin":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4z" />
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
      return null;
  }
}

function NavGroup({ title, items, router }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={styles.groupTitle}>{title}</div>

      {items.map((it) => {
        const active =
          router.pathname === it.href ||
          (it.activeStartsWith && router.pathname.startsWith(it.activeStartsWith));

        return (
          <Link
            key={it.href}
            href={it.href}
            style={{
              ...styles.navItem,
              ...(active ? styles.navItemActive : null),
            }}
          >
            <span style={styles.iconWrap}>
              <Icon name={it.icon} />
            </span>

            <span style={styles.label}>{it.label}</span>

            {it.badge && <span style={styles.badge}>{it.badge}</span>}
          </Link>
        );
      })}
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

        {isPlatformAdmin && <NavGroup title={adminGroup.title} items={adminGroup.items} router={router} />}
      </div>

      <div style={styles.footer}>
        Signed in as <b>{profile?.email || "—"}</b>
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
    background: "#0c1222",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    marginBottom: 12,
  },

  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: "linear-gradient(135deg,#37f59b,#3ab5ff)",
    color: "#071013",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 13,
  },

  brandName: {
    fontWeight: 900,
    color: "#eaf0ff",
  },

  brandSub: {
    fontSize: 12,
    color: "rgba(234,240,255,0.65)",
  },

  nav: {
    flex: 1,
    overflowY: "auto",
    paddingRight: 4,
  },

  groupTitle: {
    fontSize: 11,
    fontWeight: 900,
    color: "rgba(234,240,255,0.55)",
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
    color: "rgba(234,240,255,0.85)",
    border: "1px solid transparent",
  },

  navItemActive: {
    background: "rgba(58,181,255,0.15)",
    border: "1px solid rgba(58,181,255,0.30)",
  },

  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    background: "rgba(255,255,255,0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  label: {
    fontWeight: 700,
    fontSize: 13,
  },

  badge: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: 900,
    padding: "3px 8px",
    borderRadius: 999,
    background: "rgba(55,245,155,0.20)",
    border: "1px solid rgba(55,245,155,0.30)",
    color: "#37f59b",
  },

  footer: {
    paddingTop: 10,
    borderTop: "1px solid rgba(255,255,255,0.08)",
    fontSize: 12,
    color: "rgba(234,240,255,0.65)",
  },
};
