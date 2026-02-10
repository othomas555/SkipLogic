// pages/app/platform/subscribers/[id].js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuthProfile } from "../../../../lib/useAuthProfile";

function fmt(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return d.toLocaleString();
}

function Section({ title, children }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

export default function PlatformSubscriberDetail() {
  const router = useRouter();
  const { id } = router.query;

  const { profile, loading } = useAuthProfile();
  const canAccess = profile?.role === "platform_admin";

  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    if (!id) return;
    setBusy(true);
    setErr("");
    try {
      const raw = localStorage.getItem("skiplogic-auth");
      const token = raw ? JSON.parse(raw)?.access_token : null;

      const res = await fetch(`/api/platform/subscribers/get?subscriber_id=${encodeURIComponent(id)}`, {
        headers: { Authorization: token ? "Bearer " + token : "" },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load subscriber");
      setData(json);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function postUpdate(payload) {
    const raw = localStorage.getItem("skiplogic-auth");
    const token = raw ? JSON.parse(raw)?.access_token : null;

    const res = await fetch("/api/platform/subscribers/update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token ? "Bearer " + token : "" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Update failed");
    return json;
  }

  async function setStatus(status) {
    try {
      setBusy(true);
      setErr("");
      await postUpdate({ action: "set_status", subscriber_id: id, status });
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  }

  async function extendTrial(days) {
    try {
      setBusy(true);
      setErr("");
      await postUpdate({ action: "extend_trial", subscriber_id: id, days });
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!canAccess) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, id]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!canAccess) return <div style={{ padding: 16 }}>Forbidden: platform_admin only.</div>;

  const s = data?.subscriber;

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{s?.display_company || "Subscriber"}</div>
          <div style={{ color: "#666", fontSize: 12 }}>{s?.subscriber_id || s?.id || id}</div>
        </div>
        <button
          onClick={() => router.push("/app/platform/subscribers")}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc", background: "white" }}
        >
          Back
        </button>
      </div>

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, border: "1px solid #f3c2c2", background: "#fff5f5", borderRadius: 8 }}>
          {err}
        </div>
      ) : null}

      <Section title="Status & actions">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <strong>Status:</strong> {s?.status || "—"} · <strong>Billing:</strong> {s?.billing_status || "—"} ·{" "}
            <strong>Health:</strong> {s?.health_state || "—"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button disabled={busy} onClick={() => setStatus("active")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", background: "white" }}>
            Set Active
          </button>
          <button disabled={busy} onClick={() => setStatus("trial")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", background: "white" }}>
            Set Trial
          </button>
          <button disabled={busy} onClick={() => setStatus("suspended")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", background: "white" }}>
            Suspend
          </button>
          <button disabled={busy} onClick={() => setStatus("cancelled")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", background: "white" }}>
            Cancelled
          </button>

          <div style={{ width: 1, background: "#eee", margin: "0 6px" }} />

          <button disabled={busy} onClick={() => extendTrial(7)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", background: "white" }}>
            Extend trial +7d
          </button>
          <button disabled={busy} onClick={() => extendTrial(30)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", background: "white" }}>
            Extend trial +30d
          </button>
        </div>
      </Section>

      <Section title="Billing">
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 8, fontSize: 13 }}>
          <div>Plan</div>
          <div><strong>{s?.plan || "—"}</strong></div>

          <div>Trial ends</div>
          <div>{fmt(s?.trial_ends_at)}</div>

          <div>Billing status</div>
          <div>{s?.billing_status || "—"}</div>

          <div>Current period end</div>
          <div>{fmt(s?.current_period_end)}</div>

          <div>Last payment</div>
          <div>{fmt(s?.last_payment_at)}</div>

          <div>Stripe customer</div>
          <div style={{ fontFamily: "monospace", fontSize: 12 }}>{s?.stripe_customer_id || "—"}</div>

          <div>Stripe subscription</div>
          <div style={{ fontFamily: "monospace", fontSize: 12 }}>{s?.stripe_subscription_id || "—"}</div>

          <div>Stripe price</div>
          <div style={{ fontFamily: "monospace", fontSize: 12 }}>{s?.stripe_price_id || "—"}</div>
        </div>
      </Section>

      <Section title="Usage & health signals">
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 8, fontSize: 13 }}>
          <div>Active users</div>
          <div>{s?.active_users ?? 0}</div>

          <div>Active drivers</div>
          <div>{s?.active_drivers ?? 0}</div>

          <div>Jobs created (7d / 30d)</div>
          <div>
            {s?.jobs_created_7d ?? 0} / {s?.jobs_created_30d ?? 0}
          </div>

          <div>Invoices created (30d)</div>
          <div>{s?.invoices_created_30d ?? 0}</div>

          <div>Errors (7d)</div>
          <div>{s?.errors_7d ?? 0}</div>

          <div>Last activity</div>
          <div>{fmt(s?.last_activity_at || s?.last_seen_at)}</div>

          <div>Xero connected</div>
          <div>{fmt(s?.xero_connected_at)}</div>
        </div>
      </Section>

      <Section title="Users">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {["Email", "Name", "Role", "Active", "Last seen"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.users || []).map((u) => (
                <tr key={u.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{u.email || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{u.full_name || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{u.role || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{u.is_active ? "Yes" : "No"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{fmt(u.last_seen_at)}</td>
                </tr>
              ))}
              {(data?.users || []).length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 10, color: "#666" }}>
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Recent activity events (last 50)">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {["When", "Type", "Entity", "Meta"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.events || []).map((ev) => (
                <tr key={ev.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{fmt(ev.created_at)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{ev.event_type}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {ev.entity_type || "—"} {ev.entity_id ? `(${ev.entity_id})` : ""}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2", fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
                    {ev.meta ? JSON.stringify(ev.meta, null, 2) : "{}"}
                  </td>
                </tr>
              ))}
              {(data?.events || []).length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 10, color: "#666" }}>
                    No activity events yet. Next step is to log “login” and “job_created” so this fills up.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
