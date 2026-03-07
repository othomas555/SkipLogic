import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function AppSidebar({ profile }) {
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside style={styles.sidebar}>
      <div>
        <div style={styles.logo}>
          <div style={styles.logoMark} />
          <div style={styles.logoText}>SkipLogic</div>
        </div>

        <nav style={styles.nav}>
          <SidebarLink href="/app" label="Dashboard" router={router} />
          <SidebarLink href="/app/jobs" label="Jobs" router={router} />
          <SidebarLink href="/app/customers" label="Customers" router={router} />
          <SidebarLink href="/app/scheduler" label="Scheduler" router={router} />
          <SidebarLink href="/app/drivers" label="Drivers" router={router} />
          <SidebarLink href="/app/vehicles" label="Vehicles" router={router} />
          <SidebarLink href="/app/settings" label="Settings" router={router} />
        </nav>
      </div>

      <div style={styles.userSection}>
        <div style={styles.userName}>
          {profile?.full_name || "User"}
        </div>

        <div style={styles.userEmail}>
          {profile?.email}
        </div>

        <button onClick={logout} style={styles.logout}>
          Log out
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({ href, label, router }) {
  const active = router.pathname === href;

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
    padding: 18,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
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
    letterSpacing: "-0.01em",
  },

  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
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
    paddingTop: 12,
  },

  userName: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
  },

  userEmail: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 10,
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
