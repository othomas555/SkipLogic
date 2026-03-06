// pages/app/index.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

import AppCard from "../../components/ui/AppCard";
import AppButton from "../../components/ui/AppButton";

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { checking, user, subscriberId } = useAuthProfile();

  const [stats, setStats] = useState({
    jobsToday: 0,
    deliveriesToday: 0,
    collectionsToday: 0,
    activeDrivers: 0,
  });

  useEffect(() => {
    if (!subscriberId) return;

    async function loadStats() {
      const today = new Date().toISOString().slice(0, 10);

      const [
        jobsToday,
        deliveriesToday,
        collectionsToday,
        drivers,
      ] = await Promise.all([
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("subscriber_id", subscriberId)
          .eq("work_date", today),

        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("subscriber_id", subscriberId)
          .eq("delivery_actual_date", today),

        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("subscriber_id", subscriberId)
          .eq("collection_actual_date", today),

        supabase
          .from("drivers")
          .select("id", { count: "exact", head: true })
          .eq("subscriber_id", subscriberId)
          .eq("is_active", true),
      ]);

      setStats({
        jobsToday: jobsToday.count || 0,
        deliveriesToday: deliveriesToday.count || 0,
        collectionsToday: collectionsToday.count || 0,
        activeDrivers: drivers.count || 0,
      });
    }

    loadStats();
  }, [subscriberId]);

  if (checking) {
    return <p>Loading…</p>;
  }

  if (!user) {
    return <p>You must be signed in.</p>;
  }

  return (
    <div style={styles.page}>
      <AppCard
        title="Today"
        subtitle="Operational overview for today."
        right={
          <div style={styles.actions}>
            <AppButton onClick={() => router.push("/app/jobs/book")}>
              + Book job
            </AppButton>

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
        <div style={styles.statsGrid}>
          <Stat label="Jobs today" value={stats.jobsToday} />
          <Stat label="Deliveries completed" value={stats.deliveriesToday} />
          <Stat label="Collections completed" value={stats.collectionsToday} />
          <Stat label="Active drivers" value={stats.activeDrivers} />
        </div>
      </AppCard>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },

  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 14,
  },

  stat: {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r-md)",
    padding: 16,
  },

  statLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 800,
  },

  statValue: {
    fontSize: 26,
    fontWeight: 900,
    marginTop: 6,
  },
};
