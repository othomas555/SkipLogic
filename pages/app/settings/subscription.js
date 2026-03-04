// pages/app/settings/subscription.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function Badge({ children, tone = "blue" }) {
  const styles =
    tone === "red"
      ? { background: "#fff1f0", color: "#8a1f1f", border: "1px solid #ffccc7" }
      : tone === "green"
      ? { background: "#e6ffed", color: "#1f6b2a", border: "1px solid #b7eb8f" }
      : { background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe" };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        marginLeft: 8,
        ...styles,
      }}
    >
      {children}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export default function SubscriptionSettingsPage() {
  const router = useRouter();

  // IMPORTANT: useAuthProfile returns "checking"
  const { checking, profile, subscriber } = useAuthProfile();

  const [subRow, setSubRow] = useState(null);
  const [variants, setVariants] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const subscriberId = profile?.subscriber_id || null;

  async function loadAll() {
    if (!subscriberId) return;

    setErr(null);

    const [{ data: s, error: sErr }, { data: v, error: vErr }] = await Promise.all([
      supabase
        .from("subscribers")
        .select("id, plan_variant_id, subscription_status, trial_ends_at, grace_ends_at, locked_at, stripe_customer_id")
        .eq("id", subscriberId)
        .single(),
      supabase
        .from("plan_variants")
        .select("id, name, is_active, stripe_price_id")
        .eq("is_active", true)
        .order("name"),
    ]);

    if (sErr) return setErr(sErr.message);
    if (vErr) return setErr(vErr.message);

    setSubRow(s);
    setVariants(v || []);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriberId]);

  // After Checkout returns (?checkout=success), poll a few times so webhook updates can show
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.checkout !== "success") return;

    const timers = [];
    timers.push(setTimeout(() => loadAll(), 800));
    timers.push(setTimeout(() => loadAll(), 2000));
    timers.push(setTimeout(() => loadAll(), 4000));
    timers.push(setTimeout(() => loadAll(), 8000));

    // Clean URL after a moment
    timers.push(
      setTimeout(() => {
        router.replace("/app/settings/subscription", undefined, { shallow: true });
      }, 2500)
    );

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.checkout]);

  const variantById = useMemo(() => {
    const m = new Map();
    (variants || []).forEach((v) => m.set(v.id, v));
    return m;
  }, [variants]);

  const currentVariant = subRow?.plan_variant_id ? variantById.get(subRow.plan_variant_id) : null;

  async function startCheckout(plan_variant_id) {
    setBusy(true);
    setErr(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token. Please sign in again.");

      const r = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ plan_variant_id }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.detail || j?.error || "Checkout failed");
      if (!j?.url) throw new Error("No checkout URL returned");

      window.location.href = j.url;
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    setErr(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token. Please sign in again.");

      const r = await fetch("/api/stripe/create-billing-portal-session", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.detail || j?.error || "Portal failed");
      if (!j?.url) throw new Error("No portal URL returned");

      window.location.href = j.url;
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!subscriberId) return <div style={{ padding: 16 }}>No subscriber linked to your profile.</div>;

  const status = subRow?.subscription_status || "none";

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <h1 style={{ margin: "0 0 8px" }}>Subscription</h1>

      <div style={{ color: "#555", marginBottom: 16 }}>
        Manage your plan and billing.
        <Badge tone={status === "trialing" || status === "active" ? "green" : "blue"}>{status}</Badge>
        {subRow?.locked_at ? <Badge tone="red">LOCKED</Badge> : null}
      </div>

      {err ? (
        <div
          style={{
            background: "#fff1f0",
            border: "1px solid #ffccc7",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <b>Error:</b> {err}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          onClick={openPortal}
          disabled={busy}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Manage billing (Stripe portal)
        </button>

        <button
          onClick={loadAll}
          disabled={busy}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      <Section title="What SkipLogic currently knows">
        <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
          <div>
            Subscriber ID: <code>{subscriberId}</code>
          </div>
          <div>
            Stripe customer ID: <code>{subRow?.stripe_customer_id || "—"}</code>
          </div>
          <div>
            Current plan variant: <code>{subRow?.plan_variant_id || "—"}</code>{" "}
            {currentVariant ? <Badge>{currentVariant.name}</Badge> : null}
          </div>
          <div>
            trial_ends_at: <code>{subRow?.trial_ends_at || "—"}</code>
          </div>
          <div>
            grace_ends_at: <code>{subRow?.grace_ends_at || "—"}</code>
          </div>
          <div>
            locked_at: <code>{subRow?.locked_at || "—"}</code>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#666", lineHeight: 1.5 }}>
          If you completed Stripe Checkout but this still shows <code>subscription_status: none</code>, your Stripe webhook
          is not updating the <code>subscribers</code> row yet.
        </div>
      </Section>

      <div style={{ height: 14 }} />

      <Section title="Choose / switch plan">
        <div style={{ display: "grid", gap: 10 }}>
          {(variants || []).map((v) => {
            const isCurrent = subRow?.plan_variant_id === v.id;
            return (
              <div
                key={v.id}
                style={{
                  border: "1px solid " + (isCurrent ? "#4f46e5" : "#eee"),
                  background: isCurrent ? "#eef2ff" : "white",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 750 }}>
                    {v.name} {isCurrent ? <Badge>Current</Badge> : null}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    stripe_price_id: <code>{v.stripe_price_id || "—"}</code>
                    {!v.stripe_price_id ? <Badge tone="red">Missing price id</Badge> : null}
                  </div>
                </div>

                <button
                  disabled={busy || isCurrent || !v.stripe_price_id}
                  onClick={() => startCheckout(v.id)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: isCurrent ? "#f3f4f6" : "white",
                    cursor: busy || isCurrent || !v.stripe_price_id ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isCurrent ? "Current" : "Start / switch"}
                </button>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
