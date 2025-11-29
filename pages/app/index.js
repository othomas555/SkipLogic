// pages/app/index.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

export default function AppDashboard() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } =
    useAuthProfile();

  const [driverWarnings, setDriverWarnings] = useState([]);
  const [showDriverModal, setShowDriverModal] = useState(true);
  const [loadingWarnings, setLoadingWarnings] = useState(false);

  useEffect(() => {
    async function loadWarnings() {
      if (!user || !subscriberId) return;
      setLoadingWarnings(true);

      const { data, error } = await supabase
        .from("drivers")
        .select(
          `
          id,
          name,
          callsign,
          licence_check_due,
          driver_card_expiry,
          cpc_expiry,
          medical_expiry,
          expiry_notifications_enabled,
          expiry_warning_days,
          is_active
        `
        )
        .eq("subscriber_id", subscriberId)
        .eq("is_active", true)
        .eq("expiry_notifications_enabled", true);

      if (error) {
        console.error("Error loading driver expiries:", error);
        setDriverWarnings([]);
        setLoadingWarnings(false);
        return;
      }

      const warnings = buildDriverWarnings(data || []);
      setDriverWarnings(warnings);
      setShowDriverModal(warnings.length > 0);
      setLoadingWarnings(false);
    }

    if (!checking && user && subscriberId) {
      loadWarnings();
    }
  }, [checking, user, subscriberId]);

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
        <p>Loading SkipLogic dashboard…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: 24,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1>SkipLogic</h1>
        <p>You must be signed in to view the dashboard.</p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid #ccc",
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        maxWidth: 800,
        margin: "0 auto",
        position: "relative",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>SkipLogic Dashboard</h1>

      {authError && (
        <p style={{ color: "red", marginBottom: 12 }}>{authError}</p>
      )}

      <p style={{ marginBottom: 4 }}>
        Signed in as <strong>{user.email}</strong>
      </p>

      {subscriberId && (
        <p style={{ marginBottom: 16 }}>
          Subscriber ID: <code>{subscriberId}</code>
        </p>
      )}

      {/* Main nav tiles */}
      <section
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <DashboardLink href="/app/customers" title="Customers">
          Add and manage your customers.
        </DashboardLink>

        <DashboardLink href="/app/jobs" title="Jobs">
          Create and view skip hire jobs.
        </DashboardLink>

        <DashboardLink href="/app/jobs/scheduler" title="Scheduler">
          Plan daily runs and assign jobs to drivers.
        </DashboardLink>

        <DashboardLink href="/app/drivers" title="Drivers">
          Manage driver details and currencies.
        </DashboardLink>
      </section>

      {/* Driver expiry modal */}
      {showDriverModal && driverWarnings.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: 16,
              maxWidth: 600,
              width: "90%",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18 }}>
                Driver expiry warnings
              </h2>
              <button
                type="button"
                onClick={() => setShowDriverModal(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 16,
                }}
                title="Close"
              >
                ✕
              </button>
            </div>
            <p style={{ marginTop: 0, fontSize: 13, color: "#555" }}>
              These drivers have licence / card / CPC / medical expiries that
              are within their warning window or already overdue.
            </p>

            <ul style={{ paddingLeft: 18, marginTop: 8, marginBottom: 12 }}>
              {driverWarnings.map((w) => (
                <li key={w.id} style={{ marginBottom: 4, fontSize: 13 }}>
                  <strong>{w.driverLabel}</strong> – {w.itemLabel} on{" "}
                  <strong>{w.date}</strong>{" "}
                  <span style={{ color: w.daysUntil < 0 ? "#d32029" : "#fa8c16" }}>
                    ({formatDaysText(w.daysUntil)})
                  </span>
                </li>
              ))}
            </ul>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setShowDriverModal(false)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  background: "#f5f5f5",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Dismiss for now
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDriverModal(false);
                  router.push("/app/drivers");
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "none",
                  background: "#0070f3",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Go to drivers
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function DashboardLink({ href, title, children }) {
  return (
    <a
      href={href}
      style={{
        display: "block",
        padding: 12,
        borderRadius: 8,
        border: "1px solid #ddd",
        textDecoration: "none",
        color: "#222",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: 4,
          fontSize: 16,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 13, color: "#555" }}>{children}</div>
    </a>
  );
}

function buildDriverWarnings(drivers) {
  const warnings = [];
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();

  const fields = [
    { key: "licence_check_due", label: "Licence check due" },
    { key: "driver_card_expiry", label: "Driver card expiry" },
    { key: "cpc_expiry", label: "CPC expiry" },
    { key: "medical_expiry", label: "Medical expiry" },
  ];

  for (const d of drivers) {
    const driverLabel = d.callsign || d.name;
    const warningWindow = d.expiry_warning_days ?? 30;

    for (const field of fields) {
      const raw = d[field.key];
      if (!raw) continue;

      const dateObj = new Date(raw);
      const startOfTarget = new Date(
        dateObj.getFullYear(),
        dateObj.getMonth(),
        dateObj.getDate()
      ).getTime();

      const diffDays = Math.round(
        (startOfTarget - startOfToday) / (1000 * 60 * 60 * 24)
      );

      // Show if within window OR already overdue
      if (diffDays <= warningWindow) {
        warnings.push({
          id: `${d.id}-${field.key}`,
          driverId: d.id,
          driverLabel,
          itemKey: field.key,
          itemLabel: field.label,
          date: raw,
          daysUntil: diffDays,
        });
      }
    }
  }

  // Sort: overdue first, then nearest
  warnings.sort((a, b) => a.daysUntil - b.daysUntil);

  return warnings;
}

function formatDaysText(days) {
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? "1 day overdue" : `${n} days overdue`;
  }
  if (days === 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}
