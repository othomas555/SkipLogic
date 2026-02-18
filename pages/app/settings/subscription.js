// pages/app/settings/subscription.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function Badge({ children }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        background: "#eef2ff",
        color: "#3730a3",
        border: "1px solid #c7d2fe",
        marginLeft: 8,
      }}
    >
      {children}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

export default function SubscriptionSettingsPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useAuthProfile();

  const [subscriber, setSubscriber] = useState(null);
  const [variants, setVariants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const subscriberId = profile?.subscriber_id || null;

  async function loadAll() {
    if (!subscriberId) return;

    setErr(null);

    const [
      { data: subData, error: subErr },
      { data: planData, error: planErr },
      { data: varData, error: varErr },
    ] = await Promise.all([
      supabase
        .from("subscribers")
        .select("id, plan_variant_id, subscription_status, trial_ends_at, grace_ends_at, locked_at")
        .eq("id", subscriberId)
        .single(),
      supabase.from("plans").select("id, name, slug, is_active").eq("is_active", true).order("name"),
      supabase
        .from("plan_variants")
        .select("id, plan_id, name, slug, stripe_price_id, monthly_price_display, is_active")
        .eq("is_active", true)
        .order("name"),
    ]);

    if (subErr) return setErr(subErr.message);
    if (planErr) return setErr(planErr.message);
    if (varErr) return setErr(varErr.message);

    setSubscriber(subData);
    setPlans(planData || []);
    setVariants(varData || []);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriberId]);

  // After Checkout returns (?checkout=success), refresh from DB
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.checkout === "success") {
      // Give Stripe/webhook a moment, then refresh
      const t1 = setTimeout(() => loadAll(), 1200);
      const t2 = setTimeout(() => loadAll(), 3000);

      // Clean URL (remove query params) so it doesn't keep reloading
      const t3 = setTimeout(() => {
        router.replace("/app/settings/subscription", undefined, { shallow: true });
      }, 3500);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [router.isReady, router.query.checkout]); // eslint-disable-line react-hooks/exhaustive-deps

  const planById = useMemo(() => {
    const m = new Map();
    (plans || []).forEach((p) => m.set(p.id, p));
    return m;
  }, [plans]);

  const variantById = useMemo(() => {
    const m = new Map();
    (variants || []).forEach((v) => m.set(v.id, v));
    return m;
  }, [variants]);

  const currentVariant = subscriber?.plan_variant_id ? variantById.get(subscriber.plan_variant_id) : null;
  const currentPlan = currentVariant?.plan_id ? planById.get(currentVariant.plan_id) : null;

  const variantsGrouped = useMemo(() => {
    const g = new Map(); // plan_id -> variants[]
    (variants || []).forEach((v) => {
      const arr = g.get(v.plan_id) || [];
      arr.push(v);
      g.set(v.plan_id, arr);
    });
    return g;
  }, [variants]);

  async function startCheckout(plan_variant_id) {
    setBusy(true);
    setErr(null);
    try {
      const raw = localStorage.getItem("skiplogic-auth");
      const token = raw ? JSON.parse(raw)?.access_token : null;
      if (!token) throw new Error("No auth token. Please sign in again.");

      const r = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ plan_variant_id }),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || j?.error || "Checkout failed");

      if (j?.url) window.location.href = j.url;
      else throw new Error("No checkout URL returned");
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
      const raw = localStorage.getItem("skiplogic-auth");
      const token = raw ? JSON.parse(raw)?.access_token : null;
      if (!token) throw new Error("No auth token. Please sign in again.");

      const r = await fetch("/api/stripe/create-billing-portal-session", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || j?.error || "Portal failed");

      if (j?.url) window.location.href = j.url;
      else throw new Error("No portal URL returned");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (profileLoading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!subscriberId) return <div style={{ padding: 16 }}>No subscriber linked to your profile.</div>;

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <h1 style={{ margin: "0 0 8px" }}>Subscription</h1>
      <div style={{ color: "#555", marginBottom: 16 }}>
        Manage your plan and billing.
        {subscriber?.subscription_status ? <Badge>{subscriber.subscription_status}</Badge> : null}
        {subscriber?.locked_at ? <Badge>LOCKED</Badge> : null}
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

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
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

      <Section title="Current plan">
        {currentVariant ? (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {currentPlan?.name || "—"} <Badge>{currentVariant.name}</Badge>
            </div>
            <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
              Plan slug: <code>{currentPlan?.slug}</code> · Variant slug: <code>{currentVariant.slug}</code>
            </div>
          </div>
        ) : (
          <div style={{ color: "#666" }}>
            No plan selected yet. Choose a plan below to start your trial / subscription.
          </div>
        )}
      </Section>

      <div style={{ height: 14 }} />

      <div style={{ display: "grid", gap: 14 }}>
        {(plans || []).map((p) => {
          const vars = variantsGrouped.get(p.id) || [];
          return (
            <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ color: "#666", fontSize: 13 }}>{p.slug}</div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {vars.map((v) => {
                  const isCurrent = subscriber?.plan_variant_id === v.id;
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
                        <div style={{ fontWeight: 650 }}>
                          {v.name} {isCurrent ? <Badge>Current</Badge> : null}
                        </div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          <code>{v.slug}</code>
                          {!v.stripe_price_id ? <Badge>Needs stripe_price_id</Badge> : null}
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
                        {isCurrent ? "Current" : "Switch to this"}
                      </button>
                    </div>
                  );
                })}
                {!vars.length ? <div style={{ color: "#666" }}>No variants configured.</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 18, color: "#777", fontSize: 12 }}>
        Note: if a plan shows “Needs stripe_price_id”, set the Stripe Price ID in the <code>plan_variants</code> table.
      </div>
    </div>
  );
}
