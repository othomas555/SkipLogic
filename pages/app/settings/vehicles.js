// pages/app/settings/vehicles.js
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function VehicleSettingsPage() {
  const { checking, user, subscriberId } = useAuthProfile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [email, setEmail] = useState("");
  const [daysBefore, setDaysBefore] = useState(14);

  useEffect(() => {
    if (checking || !subscriberId) return;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("subscribers")
        .select("transport_manager_email, vehicle_alert_days_before")
        .eq("id", subscriberId)
        .maybeSingle();

      if (error) setErr(error.message);
      else {
        setEmail(data?.transport_manager_email || "");
        setDaysBefore(data?.vehicle_alert_days_before ?? 14);
      }
      setLoading(false);
    }

    load();
  }, [checking, subscriberId]);

  async function save() {
    if (!subscriberId) return;
    setSaving(true);
    setErr("");
    setOk("");

    const { error } = await supabase
      .from("subscribers")
      .update({
        transport_manager_email: email || null,
        vehicle_alert_days_before: Number(daysBefore) || 14,
      })
      .eq("id", subscriberId);

    setSaving(false);

    if (error) setErr(error.message);
    else setOk("Vehicle alert settings saved.");
  }

  if (checking || loading) {
    return <p style={{ padding: 16 }}>Loading vehicle settings…</p>;
  }

  if (!user) {
    return (
      <div style={{ padding: 16 }}>
        <p>You must be logged in.</p>
        <Link href="/login">Go to login</Link>
      </div>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <Link href="/app/settings">← Back to settings</Link>
      <h1 style={{ marginTop: 10 }}>Vehicle alerts</h1>

      {(err || ok) && (
        <div style={{ marginBottom: 12 }}>
          {err && <p style={{ color: "red" }}>{err}</p>}
          {ok && <p style={{ color: "green" }}>{ok}</p>}
        </div>
      )}

      <section style={card}>
        <h2>Transport manager</h2>

        <label style={label}>
          Alert email address
          <input
            type="email"
            placeholder="transport@company.co.uk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />
        </label>

        <label style={label}>
          Alert days before due
          <input
            type="number"
            min={1}
            max={90}
            value={daysBefore}
            onChange={(e) => setDaysBefore(e.target.value)}
            style={input}
          />
          <small style={{ color: "#666" }}>
            Example: 14 → alerts start 14 days before expiry
          </small>
        </label>

        <button onClick={save} disabled={saving} style={btnPrimary}>
          {saving ? "Saving…" : "Save"}
        </button>
      </section>
    </main>
  );
}

const card = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
};

const label = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 12,
  fontSize: 13,
};

const input = {
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const btnPrimary = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
