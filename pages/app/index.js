// pages/app/index.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

export default function AppDashboard() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    async function checkAuth() {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        // Not logged in → go back to login
        router.replace("/login");
        return;
      }

      setUserEmail(data.user.email ?? null);
      setChecking(false);
    }

    checkAuth();
  }, [router]);

  if (checking) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p>Checking your login…</p>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>SkipLogic Dashboard</h1>
        {userEmail && (
          <p style={{ fontSize: 14, color: "#555" }}>Signed in as {userEmail}</p>
        )}
      </header>

      <section>
       <p>This is your Phase 1 placeholder dashboard.</p>
  <p>
    Next steps will be: show customers, jobs, and basic multi-tenant data here.
  </p>
  <p style={{ marginTop: 16 }}>
    <a href="/app/customers">Go to Customers →</a>
  </p>
      <p>
  <a href="/app/jobs">Go to jobs</a>
</p>
<p>
  <a href="/app/skip-types">Manage skip types</a>
</p>
        <p>
  <a href="/app/drivers">Go to drivers</a>
</p>
      </section>
    </main>
  );
}
