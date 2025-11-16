// pages/app/index.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function AppDashboard() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [role, setRole] = useState(null);
  const [subscriberName, setSubscriberName] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function loadData() {
      // 1) Check auth
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      setUserEmail(user.email ?? null);

      // 2) Get profile row for this user
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("subscriber_id, role")
        .single();

      if (profileError) {
        console.error("Profile error:", profileError);
        setErrorMsg("Could not load your profile.");
        setChecking(false);
        return;
      }

      setRole(profile.role || null);

      // 3) Get subscriber row (company) for this profile
      const { data: subscriber, error: subscriberError } = await supabase
        .from("subscribers")
        .select("name")
        .eq("id", profile.subscriber_id)
        .single();

      if (subscriberError) {
        console.error("Subscriber error:", subscriberError);
        setErrorMsg("Could not load your subscriber.");
        setChecking(false);
        return;
      }

      setSubscriberName(subscriber.name || null);
      setChecking(false);
    }

    loadData();
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
        <p>Loading your account…</p>
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
          <p style={{ fontSize: 14, color: "#555" }}>
            Signed in as {userEmail}
          </p>
        )}
        {subscriberName && (
          <p style={{ fontSize: 14, color: "#555" }}>
            Subscriber: {subscriberName}
          </p>
        )}
        {role && (
          <p style={{ fontSize: 14, color: "#555" }}>Role: {role}</p>
        )}
      </header>

      {errorMsg && (
        <p style={{ color: "red", marginBottom: 16 }}>{errorMsg}</p>
      )}

      <section>
        <p>This is your Phase 1 placeholder dashboard.</p>
        <p>
          Next steps will be: show customers, jobs, and basic multi-tenant data
          here.
        </p>
      </section>
    </main>
  );
}
