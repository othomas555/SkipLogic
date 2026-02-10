// pages/app/platform/subscribers/index.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuthProfile } from "../../../../lib/useAuthProfile";

function fmt(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return d.toLocaleString();
}

function Pill({ children }) {
  return (
    <span style={{ padding: "2px 8px", border: "1px solid #ddd", borderRadius: 999, fontSize: 12 }}>
      {children}
    </span>
  );
}

export default function PlatformSubscribersIndex() {
  const { profile, loading } = useAuthProfile();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canAccess = profile?.role === "platform_admin";

  async function load() {
    setBusy(true);
    setErr("");
    try {
      const raw = localStorage.getItem("skiplogic-auth");
      const token = raw ? JSON.parse(raw)?.access_token : null;

      const res = await fetch(`/api/platform/subscribers/list?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: token ? "Bearer " + token : "" },
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load subscribers");
      setRows(json.subscribers || []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!canAccess) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  const filtered = useMemo(() => rows, [rows]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!canAccess) return <div style={{ padding: 16 }}>Forbidden: platform_admin only.</div>;

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 12px" }}>Platform · Subscribers</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company / email / status…"
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
        />
        <button
          onClick={load}
          disabled={busy}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ccc", background: "white" }}
        >
          {busy ? "Loading…" : "Search"}
        </button>
      </div>

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, border: "1px solid #f3c2c2", background: "#fff5f5", borderRadius: 8 }}>
          {err}
        </div>
      ) : null}

      <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {[
                "Company",
                "Health",
                "Status",
                "Plan",
                "Billing",
                "Users",
                "Drivers",
                "Jobs 7d",
                "Jobs 30d",
                "Errors 7d",
                "Last activity",
              ].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee", fontSize: 12, color: "#444" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.subscriber_id}>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                  <div style={{ fontWeight: 600 }}>
                    <Link href={`/app/platform/subscribers/${r.subscriber_id}`}>{r.display_company || r.company_name || r.subscriber_id}</Link>
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>{r.primary_email || "—"}</div>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                  <Pill>{r.health_state || "—"}</Pill>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{r.status || "—"}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{r.plan || "—"}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                  <div style={{ fontSize: 12 }}>
                    <div>
                      <strong>{r.billing_status || "—"}</strong>
                    </div>
                    <div>Period end: {r.current_period_end ? fmt(r.current_period_end) : "—"}</div>
                    <div>Last paid: {r.last_payment_at ? fmt(r.last_payment_at) : "—"}</div>
                  </div>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{r.active_users ?? 0}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{r.active_drivers ?? 0}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{r.jobs_created_7d ?? 0}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{r.jobs_created_30d ?? 0}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{r.errors_7d ?? 0}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                  {r.last_activity_at ? fmt(r.last_activity_at) : r.last_seen_at ? fmt(r.last_seen_at) : "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: 12, color: "#666" }}>
                  No subscribers found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        Tip: if everything shows inactive/0, we’ll add activity logging next (login + job_created) so this screen becomes meaningful.
      </div>
    </div>
  );
}
