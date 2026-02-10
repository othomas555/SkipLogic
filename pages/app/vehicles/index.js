// pages/app/vehicles/index.js
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function todayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function statusForDate(dateYmd, warnDays = 14) {
  if (!dateYmd) return { label: "—", color: "#999" };
  const today = new Date(todayYmd());
  const due = new Date(dateYmd);
  const warn = new Date(due);
  warn.setDate(warn.getDate() - warnDays);

  if (today > due) return { label: "EXPIRED", color: "#8a1f1f" };
  if (today >= warn) return { label: "DUE SOON", color: "#b36b00" };
  return { label: "OK", color: "#1f6b2a" };
}

export default function VehiclesPage() {
  const { checking, user, subscriberId } = useAuthProfile();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // new vehicle form
  const [reg, setReg] = useState("");
  const [type, setType] = useState("skip_lorry");

  async function load() {
    if (!subscriberId) return;
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .order("reg", { ascending: true });

    if (error) setErr(error.message);
    else setVehicles(data || []);

    setLoading(false);
  }

  useEffect(() => {
    if (!checking && user && subscriberId) load();
  }, [checking, user, subscriberId]);

  async function createVehicle() {
    if (!subscriberId || !reg) return;
    setBusy(true);
    setErr("");
    setOk("");

    const { error } = await supabase.from("vehicles").insert({
      subscriber_id: subscriberId,
      reg: reg.trim().toUpperCase(),
      vehicle_type: type,
    });

    setBusy(false);

    if (error) setErr(error.message);
    else {
      setOk("Vehicle added.");
      setReg("");
      await load();
    }
  }

  if (checking || loading) {
    return <p style={{ padding: 16 }}>Loading vehicles…</p>;
  }

  return (
    <main style={{ padding: 24 }}>
      <Link href="/app">← Back to dashboard</Link>
      <h1 style={{ marginTop: 10 }}>Vehicles</h1>

      {(err || ok) && (
        <div style={{ marginBottom: 12 }}>
          {err && <p style={{ color: "red" }}>{err}</p>}
          {ok && <p style={{ color: "green" }}>{ok}</p>}
        </div>
      )}

      {/* Add vehicle */}
      <section style={card}>
        <h2>Add vehicle</h2>
        <div style={grid}>
          <input
            placeholder="Registration (e.g. CX12 ABC)"
            value={reg}
            onChange={(e) => setReg(e.target.value)}
            style={input}
          />
          <select value={type} onChange={(e) => setType(e.target.value)} style={input}>
            <option value="skip_lorry">Skip lorry</option>
            <option value="roro">RoRo</option>
            <option value="tipper">Tipper</option>
            <option value="van">Van</option>
            <option value="grab">Grab</option>
            <option value="plant">Plant</option>
            <option value="trailer">Trailer</option>
          </select>
          <button onClick={createVehicle} disabled={busy} style={btn}>
            Add
          </button>
        </div>
      </section>

      {/* Vehicles list */}
      <section style={card}>
        <h2>Fleet</h2>
        {vehicles.length === 0 ? (
          <p>No vehicles yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {vehicles.map((v) => {
              const mot = statusForDate(v.mot_due_at);
              const service = statusForDate(v.service_due_at);

              return (
                <div key={v.id} style={subCard}>
                  <div style={{ fontWeight: 900 }}>{v.reg}</div>
                  <div style={{ fontSize: 13, color: "#555" }}>
                    {v.make || "—"} {v.model || ""}
                  </div>

                  <div style={{ marginTop: 6, display: "flex", gap: 10 }}>
                    <span style={{ color: mot.color }}>MOT: {mot.label}</span>
                    <span style={{ color: service.color }}>Service: {service.label}</span>
                  </div>

                  <Link href={`/app/vehicles/${v.id}`} style={{ fontSize: 13 }}>
                    View / edit
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

const card = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
};

const subCard = {
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 12,
  background: "#fafafa",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr auto",
  gap: 8,
};

const input = {
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const btn = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
