// pages/subscribe.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export default function SubscribePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");

      const { data } = await supabase.auth.getSession();
      if (!data?.session?.user) {
        router.replace("/signin");
        return;
      }

      // Only show plans that are active AND have a Stripe price ID
      // IMPORTANT: your plan_variants table does NOT have a "description" column
      const { data: pv, error: pvErr } = await supabase
        .from("plan_variants")
        .select("id, name, is_active, stripe_price_id")
        .eq("is_active", true)
        .not("stripe_price_id", "is", null)
        .order("name", { ascending: true });

      if (pvErr) {
        setError(`Could not load plans: ${pvErr.message || String(pvErr)}`);
        setPlans([]);
        setLoading(false);
        return;
      }

      setPlans(Array.isArray(pv) ? pv : []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCheckout(planVariantId) {
    setError("");
    setWorkingId(planVariantId);

    try {
      const token = await getAccessToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      const resp = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan_variant_id: planVariantId }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json?.ok || !json?.url) {
        setError(json?.error || json?.detail || "Could not start checkout. Please try again.");
        setWorkingId(null);
        return;
      }

      window.location.href = json.url;
    } catch (e) {
      setError("Could not start checkout. Please try again.");
      setWorkingId(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fafafa" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", paddingTop: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.2 }}>Choose your plan</div>
        <div style={{ color: "#555", marginTop: 8, lineHeight: 1.5 }}>
          Start a <b>30-day free trial</b>. Card is required now so the account continues automatically after the trial.
        </div>

        {router.query?.checkout === "cancel" ? (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid #ffe58f", background: "#fffbe6" }}>
            Checkout cancelled. Choose a plan to try again.
          </div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid #ffccc7", background: "#fff1f0" }}>
            <b style={{ color: "#8a1f1f" }}>Error:</b> {error}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {loading ? (
            <div style={{ padding: 14, borderRadius: 12, border: "1px solid #e6e6e6", background: "#fff" }}>
              Loading plans…
            </div>
          ) : plans.length === 0 ? (
            <div style={{ padding: 14, borderRadius: 12, border: "1px solid #e6e6e6", background: "#fff" }}>
              No plans are available yet. (Plans must be active and have a Stripe Price ID.)
            </div>
          ) : (
            plans.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: "1px solid #e6e6e6",
                  background: "#fff",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 950 }}>{p.name}</div>

                <button
                  type="button"
                  onClick={() => startCheckout(p.id)}
                  disabled={!!workingId}
                  style={{
                    width: "100%",
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "none",
                    background: workingId ? "#999" : "#1677ff",
                    color: "#fff",
                    fontWeight: 950,
                    cursor: workingId ? "default" : "pointer",
                  }}
                >
                  {workingId === p.id ? "Redirecting…" : "Start 30-day trial"}
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 14, fontSize: 13, color: "#666", lineHeight: 1.5 }}>
          Need to change plan later? You can manage billing inside the app once subscribed.
        </div>
      </div>
    </main>
  );
}
