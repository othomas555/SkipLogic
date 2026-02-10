// pages/app/index.js
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AppDashboardPage() {
  const { checking, user, subscriberId, errorMsg } = useAuthProfile();
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    if (!subscriberId) return;

    async function loadAlerts() {
      const { data, error } = await supabase
        .from("v_vehicle_compliance")
        .select("reg, item, due_date")
        .eq("subscriber_id", subscriberId)
        .lte("due_date", today());

      if (!error) setAlerts(data || []);
    }

    loadAlerts();
  }, [subscriberId]);

  if (checking) {
    return <p style={{ padding: 16 }}>Checking your session…</p>;
  }

  if (!user) {
    return (
      <div style={{ padding: 16 }}>
        <p>You need to be logged in to view the app.</p>
        <Link href="/login">Go to login</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>SkipLogic Dashboard</h1>

      {alerts.length > 0 && (
        <div style={alertBanner}>
          <strong>⚠ Vehicle compliance issues</strong>
          <p style={{ margin: "6px 0" }}>
            {alerts.length} compliance item(s) are overdue.
          </p>
          <Link href="/app/vehicles">View vehicles</Link>
        </div>
      )}

      {errorMsg && <p style={{ color: "red" }}>{errorMsg}</p>}

      <p style={{ marginBottom: 24 }}>
        Welcome back{user.email ? `, ${user.email}` : ""}.
      </p>

      <div style={grid}>
        <Card title="Vehicles" desc="Fleet & compliance" href="/app/vehicles" />
        <Card title="Waste Out" desc="Record waste transfers" href="/app/waste/out" />
        <Card title="Waste Returns" desc="Quarterly NRW / EA totals" href="/app/waste/returns" />
        <Card title="Jobs" desc="View and manage skip jobs" href="/app/jobs" />
        <Card title="Settings" desc="Company, billing, emails" href="/app/settings" />
      </div>
    </div>
  );
}

function Card({ title, desc, href }) {
  return (
    <Link href={href} style={card}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p style={{ margin: 0, color: "#555" }}>{desc}</p>
    </Link>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

const card = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: 16,
  textDecoration: "none",
  color: "inherit",
};

const alertBanner = {
  border: "1px solid #b30000",
  background: "#ffecec",
  borderRadius: 8,
  padding: 12,
  marginBottom: 16,
};
