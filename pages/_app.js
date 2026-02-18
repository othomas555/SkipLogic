// pages/_app.js
import "../styles/globals.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

function daysBetween(now, iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const d = Math.ceil((ms - now.getTime()) / (24 * 60 * 60 * 1000));
  return d;
}

function Banner({ summary, onManageBilling, onUpgrade }) {
  const sub = summary?.subscriber;
  if (!sub) return null;

  const status = sub.subscription_status || null;
  const locked = !!sub.locked_at;

  // Only show in meaningful cases
  let kind = null;
  let title = "";
  let message = "";

  const now = new Date();

  if (locked) {
    kind = "error";
    title = "Account locked";
    message = "Update your billing to regain access.";
  } else if (status === "past_due") {
    const d = daysBetween(now, sub.grace_ends_at);
    kind = "warn";
    title = "Payment failed";
    message = d != null ? `You have ${d} day(s) left before your account locks.` : "You are in a grace period.";
  } else if (status === "trialing") {
    const d = daysBetween(now, sub.trial_ends_at);
    kind = "info";
    title = "Trial active";
    message = d != null ? `Your trial ends in ${d} day(s).` : "Your trial is active.";
  } else {
    return null;
  }

  const bg = kind === "error" ? "#fff1f0" : kind === "warn" ? "#fffbe6" : "#eef5ff";
  const border = kind === "error" ? "1px solid #ffccc7" : kind === "warn" ? "1px solid #ffe58f" : "1px solid #b6d4fe";
  const color = kind === "error" ? "#8a1f1f" : kind === "warn" ? "#614700" : "#1d3b6a";

  return (
    <div style={{ padding: 10, borderBottom: "1px solid #eee", background: bg }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, color }}>{title}</div>
          <div style={{ fontSize: 13, color: "#333" }}>{message}</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onManageBilling}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Manage billing
          </button>
          <button
            type="button"
            onClick={onUpgrade}
            style={{ padding: "8px 10px", borderRadius: 10, border, background: "white", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            View plans
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [summary, setSummary] = useState(null);

  const isAppRoute = useMemo(() => router.pathname.startsWith("/app"), [router.pathname]);

  async function fetchSummary() {
    try {
      const raw = localStorage.getItem("skiplogic-auth");
      const token = raw ? JSON.parse(raw)?.access_token : null;
      if (!token) return;

      const r = await fetch("/api/subscription/summary", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      });

      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) setSummary(j);
    } catch (_) {
      // ignore
    }
  }

  async function openBillingPortal() {
    const raw = localStorage.getItem("skiplogic-auth");
    const token = raw ? JSON.parse(raw)?.access_token : null;
    if (!token) return router.push("/app/settings/subscription");

    const r = await fetch("/api/stripe/create-billing-portal-session", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.url) window.location.href = j.url;
    else router.push("/app/settings/subscription");
  }

  useEffect(() => {
    if (!isAppRoute) return;
    fetchSummary();
    // refresh on route changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAppRoute, router.asPath]);

  return (
    <>
      {isAppRoute ? (
        <Banner
          summary={summary}
          onManageBilling={openBillingPortal}
          onUpgrade={() => router.push("/app/settings/subscription")}
        />
      ) : null}

      <Component {...pageProps} />
    </>
  );
}
