// pages/app/settings/waste.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function clampBool(v) {
  return !!v;
}

function clampText(v) {
  return String(v ?? "").trim();
}

function clampCode(v) {
  // allow "20 03 01" or "200301" - keep as typed but trimmed
  return String(v ?? "").trim();
}

export default function WasteSettingsPage() {
  const { checking, user, subscriberId } = useAuthProfile();

  const [tab, setTab] = useState("outlets"); // outlets | ewc | regulator

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // regulator
  const [regulator, setRegulator] = useState("NRW");

  // outlets
  const [outlets, setOutlets] = useState([]);
  const [newOutlet, setNewOutlet] = useState({
    name: "",
    postcode: "",
    town: "",
    permit_or_licence_number: "",
    permit_type: "",
    is_active: true,
  });

  // ewc
  const [ewc, setEwc] = useState([]);
  const [newEwc, setNewEwc] = useState({
    code: "",
    description: "",
    is_hazardous: false,
    is_active: true,
  });

  useEffect(() => {
    async function load() {
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
      setErr("");
      setOk("");

      try {
        // regulator from subscribers
        const { data: sub, error: sErr } = await supabase
          .from("subscribers")
          .select("id, regulator_agency")
          .eq("id", subscriberId)
          .maybeSingle();

        if (sErr) throw sErr;
        setRegulator(sub?.regulator_agency || "NRW");

        // outlets
        const { data: o, error: oErr } = await supabase
          .from("waste_outlets")
          .select("id, name, town, postcode, permit_or_licence_number, permit_type, is_active, created_at, updated_at")
          .eq("subscriber_id", subscriberId)
          .order("name", { ascending: true });

        if (oErr) throw oErr;
        setOutlets(o || []);

        // ewc
        const { data: e, error: eErr } = await supabase
          .from("ewc_codes")
          .select("id, code, description, is_hazardous, is_active, created_at, updated_at")
          .eq("subscriber_id", subscriberId)
          .order("code", { ascending: true });

        if (eErr) throw eErr;
        setEwc(e || []);
      } catch (e) {
        console.error(e);
        setErr(e?.message || "Failed to load waste settings.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [checking, user, subscriberId]);

  async function refresh() {
    if (!subscriberId) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const { data: o, error: oErr } = await supabase
        .from("waste_outlets")
        .select("id, name, town, postcode, permit_or_licence_number, permit_type, is_active, created_at, updated_at")
        .eq("subscriber_id", subscriberId)
        .order("name", { ascending: true });
      if (oErr) throw oErr;
      setOutlets(o || []);

      const { data: e, error: eErr } = await supabase
        .from("ewc_codes")
        .select("id, code, description, is_hazardous, is_active, created_at, updated_at")
        .eq("subscriber_id", subscriberId)
        .order("code", { ascending: true });
      if (eErr) throw eErr;
      setEwc(e || []);

      const { data: sub, error: sErr } = await supabase
        .from("subscribers")
        .select("regulator_agency")
        .eq("id", subscriberId)
        .maybeSingle();
      if (sErr) throw sErr;
      setRegulator(sub?.regulator_agency || "NRW");

      setOk("Refreshed.");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Refresh failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRegulator() {
    if (!subscriberId) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const v = regulator === "EA" ? "EA" : "NRW";
      const { error } = await supabase.from("subscribers").update({ regulator_agency: v }).eq("id", subscriberId);
      if (error) throw error;
      setOk("Saved.");
    } catch (e) {
      setErr(e?.message || "Failed to save regulator.");
    } finally {
      setBusy(false);
    }
  }

  async function createOutlet() {
    if (!subscriberId) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const name = clampText(newOutlet.name);
      if (!name) throw new Error("Outlet name is required.");

      const payload = {
        subscriber_id: subscriberId,
        name,
        town: clampText(newOutlet.town),
        postcode: clampText(newOutlet.postcode),
        permit_or_licence_number: clampText(newOutlet.permit_or_licence_number),
        permit_type: clampText(newOutlet.permit_type),
        is_active: clampBool(newOutlet.is_active),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("waste_outlets").insert([payload]);
      if (error) throw error;

      setNewOutlet({ name: "", postcode: "", town: "", permit_or_licence_number: "", permit_type: "", is_active: true });
      await refresh();
      setOk("Outlet created.");
    } catch (e) {
      setErr(e?.message || "Failed to create outlet.");
    } finally {
      setBusy(false);
    }
  }

  async function updateOutlet(id, patch) {
    if (!subscriberId || !id) return;
    setErr("");
    setOk("");
    try {
      const { error } = await supabase
        .from("waste_outlets")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("subscriber_id", subscriberId);
      if (error) throw error;
      setOk("Saved.");
    } catch (e) {
      setErr(e?.message || "Failed to update outlet.");
    }
  }

  async function deleteOutlet(id) {
    if (!subscriberId || !id) return;
    const yes = confirm("Delete this waste outlet? (Historical transfers will still reference it, so only delete if you’re sure.)");
    if (!yes) return;

    setBusy(true);
    setErr("");
    setOk("");
    try {
      const { error } = await supabase.from("waste_outlets").delete().eq("id", id).eq("subscriber_id", subscriberId);
      if (error) throw error;
      await refresh();
      setOk("Deleted.");
    } catch (e) {
      setErr(e?.message || "Failed to delete outlet.");
    } finally {
      setBusy(false);
    }
  }

  async function createEwc() {
    if (!subscriberId) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const code = clampCode(newEwc.code);
      const description = clampText(newEwc.description);
      if (!code) throw new Error("EWC code is required (e.g. 20 03 01).");
      if (!description) throw new Error("EWC description is required.");

      const payload = {
        subscriber_id: subscriberId,
        code,
        description,
        is_hazardous: clampBool(newEwc.is_hazardous),
        is_active: clampBool(newEwc.is_active),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("ewc_codes").insert([payload]);
      if (error) throw error;

      setNewEwc({ code: "", description: "", is_hazardous: false, is_active: true });
      await refresh();
      setOk("EWC created.");
    } catch (e) {
      setErr(e?.message || "Failed to create EWC.");
    } finally {
      setBusy(false);
    }
  }

  async function updateEwc(id, patch) {
    if (!subscriberId || !id) return;
    setErr("");
    setOk("");
    try {
      const { error } = await supabase
        .from("ewc_codes")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("subscriber_id", subscriberId);
      if (error) throw error;
      setOk("Saved.");
    } catch (e) {
      setErr(e?.message || "Failed to update EWC.");
    }
  }

  async function deleteEwc(id) {
    if (!subscriberId || !id) return;
    const yes = confirm("Delete this EWC code? (If it’s already used in transfers, you should set inactive instead.)");
    if (!yes) return;

    setBusy(true);
    setErr("");
    setOk("");
    try {
      const { error } = await supabase.from("ewc_codes").delete().eq("id", id).eq("subscriber_id", subscriberId);
      if (error) throw error;
      await refresh();
      setOk("Deleted.");
    } catch (e) {
      setErr(e?.message || "Failed to delete EWC.");
    } finally {
      setBusy(false);
    }
  }

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading waste settings…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Waste settings</h1>
        <p>You must be signed in.</p>
        <Link href="/login" style={linkStyle}>Go to login</Link>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app/settings" style={linkStyle}>← Back to settings</Link>
          <h1 style={{ margin: "10px 0 0" }}>Waste settings</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Destinations (outlets) + EWC codes + regulator (NRW/EA).
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={refresh} disabled={busy}>
            {busy ? "Working…" : "Refresh"}
          </button>
        </div>
      </header>

      {(err || ok) ? (
        <div style={{ marginBottom: 14 }}>
          {err ? <p style={{ color: "red", margin: 0 }}>{err}</p> : null}
          {ok ? <p style={{ color: "green", margin: 0 }}>{ok}</p> : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button style={tab === "outlets" ? btnTabActive : btnTab} onClick={() => setTab("outlets")}>Outlets</button>
        <button style={tab === "ewc" ? btnTabActive : btnTab} onClick={() => setTab("ewc")}>EWC codes</button>
        <button style={tab === "regulator" ? btnTabActive : btnTab} onClick={() => setTab("regulator")}>Regulator</button>
      </div>

      {tab === "regulator" ? (
        <section style={cardStyle}>
          <h2 style={h2Style}>Regulator</h2>
          <p style={{ marginTop: 0, color: "#666", fontSize: 13 }}>
            Used to format returns/export later.
          </p>

          <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
            <label style={labelStyle}>
              Agency
              <select value={regulator} onChange={(e) => setRegulator(e.target.value)} style={inputStyle}>
                <option value="NRW">NRW (Wales)</option>
                <option value="EA">Environment Agency (England)</option>
              </select>
            </label>

            <button style={btnPrimaryDark} onClick={saveRegulator} disabled={busy}>
              {busy ? "Saving…" : "Save regulator"}
            </button>
          </div>
        </section>
      ) : null}

      {tab === "outlets" ? (
        <section style={cardStyle}>
          <h2 style={h2Style}>Waste outlets (destinations)</h2>

          <div style={subCard}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Add outlet</div>

            <div style={gridStyle}>
              <label style={labelStyle}>
                Name *
                <input value={newOutlet.name} onChange={(e) => setNewOutlet((s) => ({ ...s, name: e.target.value }))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Town
                <input value={newOutlet.town} onChange={(e) => setNewOutlet((s) => ({ ...s, town: e.target.value }))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Postcode
                <input value={newOutlet.postcode} onChange={(e) => setNewOutlet((s) => ({ ...s, postcode: e.target.value }))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Permit / Licence no.
                <input value={newOutlet.permit_or_licence_number} onChange={(e) => setNewOutlet((s) => ({ ...s, permit_or_licence_number: e.target.value }))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Permit type
                <input value={newOutlet.permit_type} onChange={(e) => setNewOutlet((s) => ({ ...s, permit_type: e.target.value }))} style={inputStyle} placeholder="Environmental Permit / Exemption" />
              </label>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={!!newOutlet.is_active} onChange={(e) => setNewOutlet((s) => ({ ...s, is_active: e.target.checked }))} />
                Active
              </label>

              <button style={btnPrimaryDark} onClick={createOutlet} disabled={busy}>
                {busy ? "Creating…" : "Create outlet"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Existing outlets</div>
            {outlets.length === 0 ? (
              <div style={{ fontSize: 13, color: "#666" }}>No outlets yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {outlets.map((o) => (
                  <div key={o.id} style={subCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900 }}>{o.name}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={!!o.is_active}
                            onChange={(e) => updateOutlet(o.id, { is_active: e.target.checked })}
                          />
                          Active
                        </label>
                        <button style={btnDanger} onClick={() => deleteOutlet(o.id)} disabled={busy}>
                          Delete
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                      <label style={labelStyle}>
                        Name
                        <input
                          type="text"
                          defaultValue={o.name || ""}
                          onBlur={(e) => {
                            const v = clampText(e.target.value);
                            if (!v || v === o.name) return;
                            updateOutlet(o.id, { name: v });
                          }}
                          style={inputStyle}
                        />
                        <div style={tinyHint}>Edit then click away to save</div>
                      </label>

                      <label style={labelStyle}>
                        Town
                        <input
                          type="text"
                          defaultValue={o.town || ""}
                          onBlur={(e) => updateOutlet(o.id, { town: clampText(e.target.value) })}
                          style={inputStyle}
                        />
                      </label>

                      <label style={labelStyle}>
                        Postcode
                        <input
                          type="text"
                          defaultValue={o.postcode || ""}
                          onBlur={(e) => updateOutlet(o.id, { postcode: clampText(e.target.value) })}
                          style={inputStyle}
                        />
                      </label>

                      <label style={labelStyle}>
                        Permit / Licence no.
                        <input
                          type="text"
                          defaultValue={o.permit_or_licence_number || ""}
                          onBlur={(e) => updateOutlet(o.id, { permit_or_licence_number: clampText(e.target.value) })}
                          style={inputStyle}
                        />
                      </label>

                      <label style={labelStyle}>
                        Permit type
                        <input
                          type="text"
                          defaultValue={o.permit_type || ""}
                          onBlur={(e) => updateOutlet(o.id, { permit_type: clampText(e.target.value) })}
                          style={inputStyle}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {tab === "ewc" ? (
        <section style={cardStyle}>
          <h2 style={h2Style}>EWC codes</h2>

          <div style={subCard}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Add EWC</div>

            <div style={gridStyle}>
              <label style={labelStyle}>
                Code *
                <input value={newEwc.code} onChange={(e) => setNewEwc((s) => ({ ...s, code: e.target.value }))} style={inputStyle} placeholder="e.g. 20 03 01" />
              </label>
              <label style={labelStyle}>
                Description *
                <input value={newEwc.description} onChange={(e) => setNewEwc((s) => ({ ...s, description: e.target.value }))} style={inputStyle} placeholder="e.g. Mixed municipal waste" />
              </label>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={!!newEwc.is_hazardous} onChange={(e) => setNewEwc((s) => ({ ...s, is_hazardous: e.target.checked }))} />
                Hazardous
              </label>

              <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={!!newEwc.is_active} onChange={(e) => setNewEwc((s) => ({ ...s, is_active: e.target.checked }))} />
                Active
              </label>

              <button style={btnPrimaryDark} onClick={createEwc} disabled={busy}>
                {busy ? "Creating…" : "Create EWC"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Existing EWC codes</div>

            {ewc.length === 0 ? (
              <div style={{ fontSize: 13, color: "#666" }}>No EWC codes yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {ewc.map((x) => (
                  <div key={x.id} style={subCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900 }}>{x.code} — {x.description}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                          <input type="checkbox" checked={!!x.is_hazardous} onChange={(e) => updateEwc(x.id, { is_hazardous: e.target.checked })} />
                          Hazardous
                        </label>

                        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                          <input type="checkbox" checked={!!x.is_active} onChange={(e) => updateEwc(x.id, { is_active: e.target.checked })} />
                          Active
                        </label>

                        <button style={btnDanger} onClick={() => deleteEwc(x.id)} disabled={busy}>
                          Delete
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                      <label style={labelStyle}>
                        Code
                        <input
                          type="text"
                          defaultValue={x.code || ""}
                          onBlur={(e) => {
                            const v = clampCode(e.target.value);
                            if (!v || v === x.code) return;
                            updateEwc(x.id, { code: v });
                          }}
                          style={inputStyle}
                        />
                        <div style={tinyHint}>Edit then click away to save</div>
                      </label>

                      <label style={labelStyle}>
                        Description
                        <input
                          type="text"
                          defaultValue={x.description || ""}
                          onBlur={(e) => {
                            const v = clampText(e.target.value);
                            if (!v || v === x.description) return;
                            updateEwc(x.id, { description: v });
                          }}
                          style={inputStyle}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
            Tip: If an EWC is already used historically, set it inactive instead of deleting.
          </div>
        </section>
      ) : null}
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

const btnTab = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnTabActive = {
  ...btnTab,
  border: "1px solid #111",
  fontWeight: 900,
};
