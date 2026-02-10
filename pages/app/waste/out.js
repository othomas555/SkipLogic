// pages/app/waste/out.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function clampText(v) {
  return String(v ?? "").trim();
}
function clampNum(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  return x;
}
function toIso(dtLocal) {
  // dtLocal like "2026-02-10T14:30"
  if (!dtLocal) return null;
  const d = new Date(dtLocal);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
function fromIsoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function nowLocalInput() {
  const d = new Date();
  return fromIsoToLocalInput(d.toISOString());
}

export default function WasteOutPage() {
  const { checking, user, subscriberId } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [outlets, setOutlets] = useState([]);
  const [ewc, setEwc] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);

  // form
  const [wtnNumber, setWtnNumber] = useState("");
  const [transferLocal, setTransferLocal] = useState(nowLocalInput());
  const [outletId, setOutletId] = useState("");
  const [ewcId, setEwcId] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [driverId, setDriverId] = useState("");
  const [quantityTonnes, setQuantityTonnes] = useState("0.000");
  const [quantitySource, setQuantitySource] = useState("weighbridge");
  const [containerType, setContainerType] = useState("skip");
  const [notes, setNotes] = useState("");

  const [recent, setRecent] = useState([]);
  const [search, setSearch] = useState("");

  const filteredRecent = useMemo(() => {
    const q = clampText(search).toLowerCase();
    if (!q) return recent;
    return recent.filter((r) => {
      const hay = [
        r.wtn_number,
        r.vehicle_reg,
        r.outlet_name_snapshot,
        r.ewc_code_snapshot,
        r.ewc_description_snapshot,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [recent, search]);

  async function loadAll({ silent = false } = {}) {
    if (!subscriberId) return;

    if (!silent) {
      setBusy(true);
      setErr("");
      setOk("");
    }

    try {
      const [oRes, eRes, vRes, dRes, rRes] = await Promise.all([
        supabase
          .from("waste_outlets")
          .select("id, name, town, postcode, is_active")
          .eq("subscriber_id", subscriberId)
          .eq("is_active", true)
          .order("name", { ascending: true }),

        supabase
          .from("ewc_codes")
          .select("id, code, description, is_hazardous, is_active")
          .eq("subscriber_id", subscriberId)
          .eq("is_active", true)
          .order("code", { ascending: true }),

        // Vehicles: adjust select fields to match your vehicles table if different.
        supabase
          .from("vehicles")
          .select("id, reg, name, is_active, subscriber_id")
          .eq("subscriber_id", subscriberId)
          .eq("is_active", true)
          .order("reg", { ascending: true }),

        supabase
          .from("drivers")
          .select("id, name, callsign, is_active")
          .eq("subscriber_id", subscriberId)
          .eq("is_active", true)
          .order("name", { ascending: true }),

        supabase
          .from("waste_transfers_out")
          .select(
            "id, wtn_number, transfer_datetime, vehicle_reg, quantity_tonnes, quantity_source, container_type, notes, outlet_name_snapshot, ewc_code_snapshot, ewc_description_snapshot, hazardous_snapshot, created_at"
          )
          .eq("subscriber_id", subscriberId)
          .order("transfer_datetime", { ascending: false })
          .limit(50),
      ]);

      if (oRes.error) throw oRes.error;
      if (eRes.error) throw eRes.error;
      if (vRes.error) throw vRes.error;
      if (dRes.error) throw dRes.error;
      if (rRes.error) throw rRes.error;

      setOutlets(oRes.data || []);
      setEwc(eRes.data || []);
      setVehicles(vRes.data || []);
      setDrivers(dRes.data || []);
      setRecent(rRes.data || []);

      // sensible defaults
      if (!outletId && (oRes.data || []).length) setOutletId(String(oRes.data[0].id));
      if (!ewcId && (eRes.data || []).length) setEwcId(String(eRes.data[0].id));
      if (!vehicleReg && (vRes.data || []).length) setVehicleReg(String(vRes.data[0].reg || ""));
      if (!driverId && (dRes.data || []).length) setDriverId("");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to load waste out page.");
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    async function boot() {
      if (checking) return;
      if (!user) {
        setLoading(false);
        return;
      }
      if (!subscriberId) {
        setErr("No subscriber found for this user.");
        setLoading(false);
        return;
      }

      setLoading(true);
      await loadAll({ silent: true });
      setLoading(false);
    }
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId]);

  async function createTransfer() {
    if (!subscriberId) return;

    setBusy(true);
    setErr("");
    setOk("");

    try {
      const wtn = clampText(wtnNumber);
      if (!wtn) throw new Error("WTN number is required.");
      if (!outletId) throw new Error("Select an outlet.");
      if (!ewcId) throw new Error("Select an EWC code.");

      const transferIso = toIso(transferLocal);
      if (!transferIso) throw new Error("Transfer date/time is required.");

      const qty = clampNum(quantityTonnes);
      if (qty == null || qty <= 0) throw new Error("Quantity tonnes must be > 0.");

      const outlet = outlets.find((x) => String(x.id) === String(outletId));
      const e = ewc.find((x) => String(x.id) === String(ewcId));

      const payload = {
        subscriber_id: subscriberId,
        wtn_number: wtn,
        transfer_datetime: transferIso,
        vehicle_reg: clampText(vehicleReg) || null,
        driver_id: driverId ? String(driverId) : null,
        outlet_id: String(outletId),
        ewc_code_id: String(ewcId),

        outlet_name_snapshot: outlet?.name || null,
        ewc_code_snapshot: e?.code || null,
        ewc_description_snapshot: e?.description || null,
        hazardous_snapshot: !!e?.is_hazardous,

        quantity_tonnes: qty,
        quantity_source: clampText(quantitySource) || null,
        container_type: clampText(containerType) || null,
        notes: clampText(notes) || null,

        created_by_profile_id: user?.id || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("waste_transfers_out").insert([payload]);
      if (error) throw error;

      setOk("Waste transfer recorded.");
      setWtnNumber("");
      setNotes("");
      setQuantityTonnes("0.000");
      setTransferLocal(nowLocalInput());

      await loadAll({ silent: true });
    } catch (e) {
      setErr(e?.message || "Failed to create transfer.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTransfer(id) {
    if (!subscriberId || !id) return;
    const yes = confirm("Delete this waste transfer record?");
    if (!yes) return;

    setBusy(true);
    setErr("");
    setOk("");

    try {
      const { error } = await supabase
        .from("waste_transfers_out")
        .delete()
        .eq("id", id)
        .eq("subscriber_id", subscriberId);

      if (error) throw error;

      setOk("Deleted.");
      await loadAll({ silent: true });
    } catch (e) {
      setErr(e?.message || "Failed to delete.");
    } finally {
      setBusy(false);
    }
  }

  async function quickEdit(id, patch) {
    if (!subscriberId || !id) return;
    setErr("");
    setOk("");

    try {
      const { error } = await supabase
        .from("waste_transfers_out")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("subscriber_id", subscriberId);

      if (error) throw error;
      setOk("Saved.");
      await loadAll({ silent: true });
    } catch (e) {
      setErr(e?.message || "Failed to save.");
    }
  }

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading waste out…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Waste out</h1>
        <p>You must be signed in.</p>
        <Link href="/login" style={linkStyle}>Go to login</Link>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app" style={linkStyle}>← Back to dashboard</Link>
          <h1 style={{ margin: "10px 0 0" }}>Waste out</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Record each waste transfer (one EWC per transfer, tonnes only).
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={() => loadAll()} disabled={busy}>
            {busy ? "Working…" : "Refresh"}
          </button>
          <Link href="/app/settings/waste" style={{ ...btnPrimaryDark, textDecoration: "none" }}>
            Waste settings
          </Link>
        </div>
      </header>

      {(err || ok) ? (
        <div style={{ marginBottom: 14 }}>
          {err ? <p style={{ color: "red", margin: 0 }}>{err}</p> : null}
          {ok ? <p style={{ color: "green", margin: 0 }}>{ok}</p> : null}
        </div>
      ) : null}

      <section style={cardStyle}>
        <h2 style={h2Style}>Add transfer</h2>

        <div style={gridStyle}>
          <label style={labelStyle}>
            WTN number *
            <input value={wtnNumber} onChange={(e) => setWtnNumber(e.target.value)} style={inputStyle} placeholder="e.g. AROC-WTN-000123" />
          </label>

          <label style={labelStyle}>
            Transfer date/time *
            <input type="datetime-local" value={transferLocal} onChange={(e) => setTransferLocal(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Outlet *
            <select value={outletId} onChange={(e) => setOutletId(e.target.value)} style={inputStyle}>
              <option value="">Select…</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}{o.town ? ` (${o.town})` : ""}{o.postcode ? ` ${o.postcode}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            EWC *
            <select value={ewcId} onChange={(e) => setEwcId(e.target.value)} style={inputStyle}>
              <option value="">Select…</option>
              {ewc.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} — {x.description}{x.is_hazardous ? " (Haz)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Vehicle reg
            <select value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} style={inputStyle}>
              <option value="">(none)</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.reg || ""}>
                  {v.reg || v.name || v.id}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Driver
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} style={inputStyle}>
              <option value="">(office / unknown)</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.callsign ? `${d.callsign} — ` : ""}{d.name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Quantity (tonnes) *
            <input type="number" step="0.001" value={quantityTonnes} onChange={(e) => setQuantityTonnes(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Quantity source
            <select value={quantitySource} onChange={(e) => setQuantitySource(e.target.value)} style={inputStyle}>
              <option value="weighbridge">weighbridge</option>
              <option value="estimate">estimate</option>
              <option value="ticket">ticket</option>
            </select>
          </label>

          <label style={labelStyle}>
            Container type
            <select value={containerType} onChange={(e) => setContainerType(e.target.value)} style={inputStyle}>
              <option value="skip">skip</option>
              <option value="rorro">rorro</option>
              <option value="bags">bags</option>
              <option value="loose">loose</option>
            </select>
          </label>

          <label style={labelStyle}>
            Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} placeholder="Optional" />
          </label>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btnPrimaryDark} onClick={createTransfer} disabled={busy}>
            {busy ? "Saving…" : "Record transfer"}
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={h2Style}>Recent transfers</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search WTN / outlet / EWC / reg…"
              style={{ ...inputStyle, minWidth: 280 }}
            />
          </div>
        </div>

        {filteredRecent.length === 0 ? (
          <div style={{ fontSize: 13, color: "#666" }}>No transfers recorded yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredRecent.map((r) => (
              <div key={r.id} style={subCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>
                    {r.wtn_number} — {r.quantity_tonnes} t
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={btnDanger} onClick={() => deleteTransfer(r.id)} disabled={busy}>
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 6, fontSize: 13, color: "#333", lineHeight: 1.5 }}>
                  <div>
                    <b>When:</b>{" "}
                    <input
                      type="datetime-local"
                      defaultValue={fromIsoToLocalInput(r.transfer_datetime)}
                      onBlur={(e) => {
                        const iso = toIso(e.target.value);
                        if (!iso || iso === r.transfer_datetime) return;
                        quickEdit(r.id, { transfer_datetime: iso });
                      }}
                      style={{ ...inputStyle, padding: "6px 8px", display: "inline-block", width: 220 }}
                    />
                  </div>
                  <div><b>Outlet:</b> {r.outlet_name_snapshot || "—"}</div>
                  <div><b>EWC:</b> {r.ewc_code_snapshot || "—"} — {r.ewc_description_snapshot || "—"}{r.hazardous_snapshot ? " (Haz)" : ""}</div>
                  <div><b>Vehicle:</b> {r.vehicle_reg || "—"} | <b>Source:</b> {r.quantity_source || "—"} | <b>Container:</b> {r.container_type || "—"}</div>
                  {r.notes ? <div><b>Notes:</b> {r.notes}</div> : null}
                </div>

                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <label style={labelStyle}>
                    Quantity (t)
                    <input
                      type="number"
                      step="0.001"
                      defaultValue={String(r.quantity_tonnes)}
                      onBlur={(e) => {
                        const v = clampNum(e.target.value);
                        if (v == null || v <= 0 || Number(v) === Number(r.quantity_tonnes)) return;
                        quickEdit(r.id, { quantity_tonnes: v });
                      }}
                      style={inputStyle}
                    />
                    <div style={tinyHint}>Edit then click away to save</div>
                  </label>

                  <label style={labelStyle}>
                    Vehicle reg
                    <input
                      type="text"
                      defaultValue={r.vehicle_reg || ""}
                      onBlur={(e) => {
                        const v = clampText(e.target.value) || null;
                        if (v === (r.vehicle_reg || null)) return;
                        quickEdit(r.id, { vehicle_reg: v });
                      }}
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelStyle}>
                    Notes
                    <input
                      type="text"
                      defaultValue={r.notes || ""}
                      onBlur={(e) => {
                        const v = clampText(e.target.value) || null;
                        if (v === (r.notes || null)) return;
                        quickEdit(r.id, { notes: v });
                      }}
                      style={inputStyle}
                    />
                  </label>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                  Created: {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f7f7f7",
};

const centerStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const linkStyle = {
  textDecoration: "underline",
  color: "#0070f3",
  fontSize: 13,
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const subCard = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
};

const h2Style = { fontSize: 16, margin: "0 0 10px" };

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "#333",
};

const tinyHint = {
  fontSize: 11,
  color: "#666",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
};

const btnPrimaryDark = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};

const btnSecondary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontSize: 13,
};

const btnDanger = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #8a1f1f",
  background: "#8a1f1f",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};
