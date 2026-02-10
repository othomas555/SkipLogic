// pages/app/vehicles/[id].js
import Link from "next/link";
import { useRouter } from "next/router";
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

export default function VehicleDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { checking, user, subscriberId } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [v, setV] = useState(null);

  async function load() {
    if (!id || !subscriberId) return;
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", id)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (error) setErr(error.message);
    else if (!data) setErr("Vehicle not found.");
    else setV(data);

    setLoading(false);
  }

  useEffect(() => {
    if (!checking && user && subscriberId && id) load();
  }, [checking, user, subscriberId, id]);

  async function save() {
    if (!v) return;
    setSaving(true);
    setErr("");
    setOk("");

    const { error } = await supabase
      .from("vehicles")
      .update({
        ...v,
        updated_at: new Date().toISOString(),
      })
      .eq("id", v.id)
      .eq("subscriber_id", subscriberId);

    setSaving(false);

    if (error) setErr(error.message);
    else setOk("Saved.");
  }

  async function deactivate() {
    if (!v) return;
    const yes = confirm("Deactivate this vehicle? It will be hidden from selection.");
    if (!yes) return;

    setSaving(true);
    const { error } = await supabase
      .from("vehicles")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", v.id)
      .eq("subscriber_id", subscriberId);

    setSaving(false);

    if (error) setErr(error.message);
    else router.push("/app/vehicles");
  }

  const motStatus = useMemo(() => statusForDate(v?.mot_due_at), [v]);
  const serviceStatus = useMemo(() => statusForDate(v?.service_due_at), [v]);
  const tachoStatus = useMemo(() => statusForDate(v?.tacho_calibration_due_at), [v]);
  const lolerStatus = useMemo(() => statusForDate(v?.loler_due_at), [v]);
  const inspectionStatus = useMemo(() => statusForDate(v?.inspection_due_at), [v]);

  if (checking || loading) {
    return <p style={{ padding: 16 }}>Loading vehicle…</p>;
  }

  if (!user) {
    return (
      <div style={{ padding: 16 }}>
        <p>You must be logged in.</p>
        <Link href="/login">Go to login</Link>
      </div>
    );
  }

  if (!v) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "red" }}>{err || "Vehicle not found."}</p>
        <Link href="/app/vehicles">Back to vehicles</Link>
      </div>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <Link href="/app/vehicles">← Back to vehicles</Link>
      <h1 style={{ marginTop: 10 }}>{v.reg}</h1>

      {(err || ok) && (
        <div style={{ marginBottom: 12 }}>
          {err && <p style={{ color: "red" }}>{err}</p>}
          {ok && <p style={{ color: "green" }}>{ok}</p>}
        </div>
      )}

      {/* Identity */}
      <section style={card}>
        <h2>Vehicle details</h2>
        <div style={grid}>
          <Field label="Registration">
            <input value={v.reg || ""} onChange={(e) => setV({ ...v, reg: e.target.value.toUpperCase() })} style={input} />
          </Field>
          <Field label="Make">
            <input value={v.make || ""} onChange={(e) => setV({ ...v, make: e.target.value })} style={input} />
          </Field>
          <Field label="Model">
            <input value={v.model || ""} onChange={(e) => setV({ ...v, model: e.target.value })} style={input} />
          </Field>
          <Field label="Vehicle type">
            <select value={v.vehicle_type} onChange={(e) => setV({ ...v, vehicle_type: e.target.value })} style={input}>
              <option value="skip_lorry">Skip lorry</option>
              <option value="roro">RoRo</option>
              <option value="tipper">Tipper</option>
              <option value="van">Van</option>
              <option value="grab">Grab</option>
              <option value="plant">Plant</option>
              <option value="trailer">Trailer</option>
            </select>
          </Field>
          <Field label="Fleet number">
            <input value={v.fleet_number || ""} onChange={(e) => setV({ ...v, fleet_number: e.target.value })} style={input} />
          </Field>
          <Field label="Chassis number">
            <input value={v.chassis_number || ""} onChange={(e) => setV({ ...v, chassis_number: e.target.value })} style={input} />
          </Field>
          <Field label="First registration">
            <input type="date" value={v.first_registration_date || ""} onChange={(e) => setV({ ...v, first_registration_date: e.target.value })} style={input} />
          </Field>
        </div>
      </section>

      {/* Tyres */}
      <section style={card}>
        <h2>Tyres</h2>
        <div style={grid}>
          <Field label="Front tyre size">
            <input value={v.tyre_size_front || ""} onChange={(e) => setV({ ...v, tyre_size_front: e.target.value })} style={input} />
          </Field>
          <Field label="Rear tyre size">
            <input value={v.tyre_size_rear || ""} onChange={(e) => setV({ ...v, tyre_size_rear: e.target.value })} style={input} />
          </Field>
          <Field label="Spare tyre size">
            <input value={v.spare_tyre_size || ""} onChange={(e) => setV({ ...v, spare_tyre_size: e.target.value })} style={input} />
          </Field>
        </div>
      </section>

      {/* Compliance */}
      <section style={card}>
        <h2>Compliance</h2>
        <div style={grid}>
          <DateField label="MOT due" status={motStatus}>
            <input type="date" value={v.mot_due_at || ""} onChange={(e) => setV({ ...v, mot_due_at: e.target.value })} style={input} />
          </DateField>
          <DateField label="Service due" status={serviceStatus}>
            <input type="date" value={v.service_due_at || ""} onChange={(e) => setV({ ...v, service_due_at: e.target.value })} style={input} />
          </DateField>
          <DateField label="Tacho calibration due" status={tachoStatus}>
            <input type="date" value={v.tacho_calibration_due_at || ""} onChange={(e) => setV({ ...v, tacho_calibration_due_at: e.target.value })} style={input} />
          </DateField>
          <DateField label="LOLER due" status={lolerStatus}>
            <input type="date" value={v.loler_due_at || ""} onChange={(e) => setV({ ...v, loler_due_at: e.target.value })} style={input} />
          </DateField>
          <DateField label="Inspection / PMI due" status={inspectionStatus}>
            <input type="date" value={v.inspection_due_at || ""} onChange={(e) => setV({ ...v, inspection_due_at: e.target.value })} style={input} />
          </DateField>
          <Field label="Tax due">
            <input type="date" value={v.tax_due_at || ""} onChange={(e) => setV({ ...v, tax_due_at: e.target.value })} style={input} />
          </Field>
          <Field label="Insurance due">
            <input type="date" value={v.insurance_due_at || ""} onChange={(e) => setV({ ...v, insurance_due_at: e.target.value })} style={input} />
          </Field>
        </div>
      </section>

      {/* Actions */}
      <section style={{ display: "flex", gap: 10 }}>
        <button onClick={save} disabled={saving} style={btnPrimary}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={deactivate} style={btnDanger}>
          Deactivate vehicle
        </button>
      </section>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label style={field}>
      <div style={labelStyle}>{label}</div>
      {children}
    </label>
  );
}

function DateField({ label, status, children }) {
  return (
    <label style={field}>
      <div style={{ ...labelStyle, display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: status.color, fontWeight: 700 }}>{status.label}</span>
      </div>
      {children}
    </label>
  );
}

const card = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const field = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelStyle = {
  fontSize: 12,
  color: "#555",
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

const btnDanger = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #8a1f1f",
  background: "#8a1f1f",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
