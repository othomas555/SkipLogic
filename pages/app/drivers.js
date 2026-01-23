// pages/app/drivers.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

function ymdTodayUTC() {
  const dt = new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toStr(x) {
  return String(x ?? "").trim();
}

function toInt(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function fmtDate(d) {
  return d ? String(d).slice(0, 10) : "";
}

export default function DriversPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState("");

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [showInactive, setShowInactive] = useState(false);
  const [drivers, setDrivers] = useState([]);

  // Add driver form (matches real schema)
  const [newName, setNewName] = useState("");
  const [newCallsign, setNewCallsign] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newLicenceNumber, setNewLicenceNumber] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Inline edit state per driver: { [id]: {field: value, ...} }
  const [edits, setEdits] = useState({});

  // Password UI state per driver (legacy email+password flow you already have)
  const [pwEdits, setPwEdits] = useState({}); // { [driverId]: { pw1: "", pw2: "" } }

  // NEW: Driver Code + PIN modal state per driver
  const [loginCredsByDriver, setLoginCredsByDriver] = useState({}); // { [driverId]: { login_code, pin } }
  const [showLoginPanelFor, setShowLoginPanelFor] = useState(""); // driverId

  async function loadDrivers() {
    if (checking) return;
    if (!user || !subscriberId) return;

    setLoading(true);
    setErrorMsg("");

    let q = supabase
      .from("drivers")
      .select(
        `
        id,
        subscriber_id,
        name,
        callsign,
        phone,
        email,
        licence_number,
        licence_check_due,
        driver_card_number,
        driver_card_expiry,
        cpc_expiry,
        medical_expiry,
        notes,
        is_active,
        created_at,
        updated_at,
        expiry_notifications_enabled,
        expiry_warning_days,
        staff_id,
        password_set_at,
        login_code,
        auth_user_id
      `
      )
      .eq("subscriber_id", subscriberId)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });

    if (!showInactive) q = q.eq("is_active", true);

    const { data, error } = await q;

    if (error) {
      console.error(error);
      setErrorMsg("Could not load drivers: " + (error.message || "Unknown error"));
      setDrivers([]);
      setLoading(false);
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    setDrivers(rows);

    // Seed edits with current values
    const nextEdits = {};
    const nextPw = {};
    for (const d of rows) {
      nextEdits[d.id] = {
        name: d.name ?? "",
        callsign: d.callsign ?? "",
        phone: d.phone ?? "",
        email: d.email ?? "",
        licence_number: d.licence_number ?? "",
        licence_check_due: fmtDate(d.licence_check_due),
        driver_card_number: d.driver_card_number ?? "",
        driver_card_expiry: fmtDate(d.driver_card_expiry),
        cpc_expiry: fmtDate(d.cpc_expiry),
        medical_expiry: fmtDate(d.medical_expiry),
        notes: d.notes ?? "",
        expiry_notifications_enabled: !!d.expiry_notifications_enabled,
        expiry_warning_days: toInt(d.expiry_warning_days, 30),
        staff_id: d.staff_id ?? "",
      };
      nextPw[d.id] = { pw1: "", pw2: "" };
    }
    setEdits(nextEdits);
    setPwEdits(nextPw);

    setLoading(false);
  }

  useEffect(() => {
    loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId, showInactive]);

  const signedInLabel = useMemo(() => {
    return user?.email ? `Signed in as ${user.email}` : "Signed in";
  }, [user]);

  function setEdit(driverId, key, value) {
    setEdits((prev) => ({
      ...prev,
      [driverId]: {
        ...(prev[driverId] || {}),
        [key]: value,
      },
    }));
  }

  function setPw(driverId, key, value) {
    setPwEdits((prev) => ({
      ...prev,
      [driverId]: {
        ...(prev[driverId] || { pw1: "", pw2: "" }),
        [key]: value,
      },
    }));
  }

  async function addDriver(e) {
    e?.preventDefault?.();
    if (!subscriberId) return;

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    const payload = {
      subscriber_id: subscriberId,
      name: toStr(newName),
      callsign: toStr(newCallsign) || null,
      phone: toStr(newPhone) || null,
      email: toStr(newEmail) || null,
      licence_number: toStr(newLicenceNumber) || null,
      notes: toStr(newNotes) || null,
      is_active: true,
    };

    if (!payload.name) {
      setSaving(false);
      setErrorMsg("Driver name is required.");
      return;
    }

    const { error } = await supabase.from("drivers").insert(payload);

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg("Could not add driver: " + (error.message || "Unknown error"));
      return;
    }

    setNewName("");
    setNewCallsign("");
    setNewPhone("");
    setNewEmail("");
    setNewLicenceNumber("");
    setNewNotes("");

    setSuccessMsg("Driver added.");
    await loadDrivers();
  }

  async function saveDriver(driverId) {
    if (!driverId) return;
    if (!subscriberId) return;

    const row = edits[driverId];
    if (!row) return;

    setActingId(driverId);
    setErrorMsg("");
    setSuccessMsg("");

    const patch = {
      name: toStr(row.name) || null,
      callsign: toStr(row.callsign) || null,
      phone: toStr(row.phone) || null,
      email: toStr(row.email) || null,
      licence_number: toStr(row.licence_number) || null,
      licence_check_due: row.licence_check_due || null,
      driver_card_number: toStr(row.driver_card_number) || null,
      driver_card_expiry: row.driver_card_expiry || null,
      cpc_expiry: row.cpc_expiry || null,
      medical_expiry: row.medical_expiry || null,
      notes: toStr(row.notes) || null,
      expiry_notifications_enabled: !!row.expiry_notifications_enabled,
      expiry_warning_days: Math.max(1, Math.min(365, toInt(row.expiry_warning_days, 30))),
      staff_id: toStr(row.staff_id) || null,
      updated_at: new Date().toISOString(),
    };

    if (!patch.name) {
      setActingId("");
      setErrorMsg("Name is required.");
      return;
    }

    const { error } = await supabase
      .from("drivers")
      .update(patch)
      .eq("id", driverId)
      .eq("subscriber_id", subscriberId);

    setActingId("");

    if (error) {
      console.error(error);
      setErrorMsg("Could not save driver: " + (error.message || "Unknown error"));
      return;
    }

    setSuccessMsg("Driver saved.");
    await loadDrivers();
  }

  async function setDriverPassword(driver) {
    if (!driver?.id) return;
    if (!subscriberId) return;

    const pw = pwEdits[driver.id] || { pw1: "", pw2: "" };
    const pw1 = String(pw.pw1 || "");
    const pw2 = String(pw.pw2 || "");

    setErrorMsg("");
    setSuccessMsg("");

    if (!driver.email) {
      setErrorMsg("Driver must have an email set before you can set a password.");
      return;
    }

    if (pw1.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    if (pw1 !== pw2) {
      setErrorMsg("Password and confirmation do not match.");
      return;
    }

    const ok = confirm(`Set a new password for "${driver.name}" (${driver.email})?`);
    if (!ok) return;

    setActingId(driver.id);

    try {
      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      const accessToken = sessData?.session?.access_token;

      if (sessErr || !accessToken) {
        setActingId("");
        setErrorMsg("You are not signed in (missing session). Please refresh and sign in again.");
        return;
      }

      const res = await fetch("/api/admin/drivers/set-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ driver_id: driver.id, password: pw1, subscriber_id: subscriberId }),
      });

      const json = await res.json().catch(() => ({}));

      setActingId("");

     if (!res.ok || !json.ok) {
  const msg = [json?.error || "Could not enable driver login.", json?.details].filter(Boolean).join("\n");
  setErrorMsg(msg);
  return;
}

      setPwEdits((prev) => ({
        ...prev,
        [driver.id]: { pw1: "", pw2: "" },
      }));

      setSuccessMsg("Driver password set.");
      await loadDrivers();
    } catch (e) {
      console.error(e);
      setActingId("");
      setErrorMsg("Could not set password.");
    }
  }

  // NEW: Enable Driver Code + PIN (no console)
  async function enableDriverLogin(driver) {
    if (!driver?.id) return;
    if (!subscriberId) return;

    setErrorMsg("");
    setSuccessMsg("");

    const ok = confirm(
      `Generate / reset Driver Code + PIN for "${driver.name}"?\n\nThis will create or reset their login for /login-driver.`
    );
    if (!ok) return;

    setActingId(driver.id);

    try {
      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      const accessToken = sessData?.session?.access_token;

      if (sessErr || !accessToken) {
        setActingId("");
        setErrorMsg("You are not signed in (missing session). Please refresh and sign in again.");
        return;
      }

      const res = await fetch("/api/ops/drivers/enable-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ driver_id: driver.id }),
      });

      const json = await res.json().catch(() => ({}));

      setActingId("");

      if (!res.ok || !json.ok) {
        setErrorMsg(json?.error || "Could not enable driver login.");
        return;
      }

      setLoginCredsByDriver((prev) => ({
        ...prev,
        [driver.id]: { login_code: json.login_code, pin: json.pin },
      }));
      setShowLoginPanelFor(driver.id);
      setSuccessMsg("Driver Code + PIN generated.");
      await loadDrivers();
    } catch (e) {
      console.error(e);
      setActingId("");
      setErrorMsg("Could not enable driver login.");
    }
  }

  async function deactivateDriver(driver) {
    if (!driver?.id) return;
    if (!subscriberId) return;

    const ok = confirm(
      `Deactivate "${driver.name}"?\n\nThis will unassign them from FUTURE jobs. Historic jobs remain unchanged.`
    );
    if (!ok) return;

    setActingId(driver.id);
    setErrorMsg("");
    setSuccessMsg("");

    const { error: dErr } = await supabase
      .from("drivers")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", driver.id)
      .eq("subscriber_id", subscriberId);

    if (dErr) {
      console.error(dErr);
      setActingId("");
      setErrorMsg("Could not deactivate: " + (dErr.message || "Unknown error"));
      return;
    }

    const today = ymdTodayUTC();
    const { error: jErr } = await supabase
      .from("jobs")
      .update({ assigned_driver_id: null })
      .eq("subscriber_id", subscriberId)
      .eq("assigned_driver_id", driver.id)
      .is("collection_actual_date", null)
      .gte("scheduled_date", today);

    setActingId("");

    if (jErr) {
      console.error(jErr);
      setErrorMsg("Driver deactivated, but could not unassign future jobs: " + (jErr.message || "Unknown error"));
      await loadDrivers();
      return;
    }

    setSuccessMsg("Driver deactivated and unassigned from future jobs.");
    await loadDrivers();
  }

  async function reactivateDriver(driver) {
    if (!driver?.id) return;
    if (!subscriberId) return;

    setActingId(driver.id);
    setErrorMsg("");
    setSuccessMsg("");

    const { error } = await supabase
      .from("drivers")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", driver.id)
      .eq("subscriber_id", subscriberId);

    setActingId("");

    if (error) {
      console.error(error);
      setErrorMsg("Could not reactivate: " + (error.message || "Unknown error"));
      return;
    }

    setSuccessMsg("Driver reactivated.");
    await loadDrivers();
  }

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Drivers</h1>
        <p>You must be signed in.</p>
        <button onClick={() => router.push("/login")} style={btnSecondary}>
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>Drivers</h1>
          <div style={{ marginTop: 6, color: "#444", fontSize: 13 }}>
            <b>{signedInLabel}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/app" style={btnSecondaryLink}>
            ← Back to dashboard
          </Link>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>
      </header>

      {(authError || errorMsg || successMsg) && (
        <div style={{ marginBottom: 14 }}>
          {authError || errorMsg ? <div style={alertError}>{authError || errorMsg}</div> : null}
          {successMsg ? <div style={alertOk}>{successMsg}</div> : null}
        </div>
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>Add driver</h2>
        <form onSubmit={addDriver}>
          <div style={gridForm}>
            <label style={labelStyle}>
              Name *
              <input value={newName} onChange={(e) => setNewName(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Callsign
              <input value={newCallsign} onChange={(e) => setNewCallsign(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Phone
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Email
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Licence number
              <input value={newLicenceNumber} onChange={(e) => setNewLicenceNumber(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Notes
              <input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} style={inputStyle} />
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="submit" style={btnPrimary} disabled={saving}>
              {saving ? "Saving…" : "Add driver"}
            </button>
          </div>
        </form>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Drivers</h2>

        {!drivers.length ? (
          <p style={{ margin: 0, color: "#666" }}>No drivers found.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {drivers.map((d) => {
              const inactive = d.is_active === false;
              const busy = actingId === d.id;
              const row = edits[d.id] || {};
              const pw = pwEdits[d.id] || { pw1: "", pw2: "" };

              const creds = loginCredsByDriver[d.id];
              const showCreds = showLoginPanelFor === d.id;

              return (
                <div key={d.id} style={driverCard}>
                  <div style={driverTopRow}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{d.name || "—"}</div>
                        {inactive ? <span style={pillInactive}>Inactive</span> : <span style={pillActive}>Active</span>}
                        {d.callsign ? <span style={miniMeta}>Callsign: {d.callsign}</span> : null}
                        {d.login_code ? <span style={miniMeta}>Driver Code: <b>{d.login_code}</b></span> : null}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                        <span>Created: {String(d.created_at || "").slice(0, 10) || "—"}</span>
                        {"  "}•{"  "}
                        <span>Updated: {String(d.updated_at || "").slice(0, 10) || "—"}</span>
                        {"  "}•{"  "}
                        <span>Password set: {d.password_set_at ? String(d.password_set_at).slice(0, 10) : "No"}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {!inactive ? (
                        <button style={btnDanger} disabled={busy} onClick={() => deactivateDriver(d)} type="button">
                          {busy ? "Working…" : "Deactivate"}
                        </button>
                      ) : (
                        <button style={btnSecondary} disabled={busy} onClick={() => reactivateDriver(d)} type="button">
                          {busy ? "Working…" : "Reactivate"}
                        </button>
                      )}

                      <button style={btnSecondary} disabled={busy} onClick={() => enableDriverLogin(d)} type="button">
                        {busy ? "Working…" : d.login_code ? "Reset Code + PIN" : "Enable Code + PIN"}
                      </button>

                      <button style={btnPrimary} disabled={busy} onClick={() => saveDriver(d.id)} type="button">
                        {busy ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>

                  {showCreds ? (
                    <div style={credsPanel}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900 }}>Driver app login</div>
                        <button type="button" style={btnSecondary} onClick={() => setShowLoginPanelFor("")}>
                          Close
                        </button>
                      </div>

                      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                        <div style={credsBox}>
                          <div style={credsLabel}>Driver Code</div>
                          <div style={credsValue}>{creds?.login_code || d.login_code || "—"}</div>
                        </div>
                        <div style={credsBox}>
                          <div style={credsLabel}>PIN (show once)</div>
                          <div style={credsValue}>{creds?.pin || "—"}</div>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 12, color: "#555" }}>
                        Driver logs in at <b>/login-driver</b>. Do not email them. Just give them the code + PIN.
                      </div>
                    </div>
                  ) : null}

                  <div style={gridForm}>
                    <label style={labelStyle}>
                      Name *
                      <input value={row.name ?? ""} onChange={(e) => setEdit(d.id, "name", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={labelStyle}>
                      Callsign
                      <input value={row.callsign ?? ""} onChange={(e) => setEdit(d.id, "callsign", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={labelStyle}>
                      Phone
                      <input value={row.phone ?? ""} onChange={(e) => setEdit(d.id, "phone", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={labelStyle}>
                      Email
                      <input value={row.email ?? ""} onChange={(e) => setEdit(d.id, "email", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={labelStyle}>
                      Licence number
                      <input value={row.licence_number ?? ""} onChange={(e) => setEdit(d.id, "licence_number", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={labelStyle}>
                      Licence check due
                      <input type="date" value={row.licence_check_due ?? ""} onChange={(e) => setEdit(d.id, "licence_check_due", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={labelStyle}>
                      Driver card number
                      <input value={row.driver_card_number ?? ""} onChange={(e) => setEdit(d.id, "driver_card_number", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={labelStyle}>
                      Driver card expiry
                      <input type="date" value={row.driver_card_expiry ?? ""} onChange={(e) => setEdit(d.id, "driver_card_expiry", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={labelStyle}>
                      CPC expiry
                      <input type="date" value={row.cpc_expiry ?? ""} onChange={(e) => setEdit(d.id, "cpc_expiry", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={labelStyle}>
                      Medical expiry
                      <input type="date" value={row.medical_expiry ?? ""} onChange={(e) => setEdit(d.id, "medical_expiry", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={labelStyle}>
                      Expiry notifications enabled
                      <select
                        value={row.expiry_notifications_enabled ? "yes" : "no"}
                        onChange={(e) => setEdit(d.id, "expiry_notifications_enabled", e.target.value === "yes")}
                        style={inputStyle}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </label>

                    <label style={labelStyle}>
                      Expiry warning days
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={String(row.expiry_warning_days ?? 30)}
                        onChange={(e) => setEdit(d.id, "expiry_warning_days", e.target.value)}
                        style={inputStyle}
                      />
                    </label>

                    <label style={labelStyle}>
                      Staff ID (optional)
                      <input value={row.staff_id ?? ""} onChange={(e) => setEdit(d.id, "staff_id", e.target.value)} style={inputStyle} />
                    </label>

                    <label style={{ ...labelStyle, gridColumn: "1 / -1" }}>
                      Notes
                      <textarea value={row.notes ?? ""} onChange={(e) => setEdit(d.id, "notes", e.target.value)} style={{ ...inputStyle, minHeight: 70 }} />
                    </label>

                    {/* Legacy driver password section kept as-is */}
                    <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #eee", paddingTop: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Driver portal password (legacy)</div>

                      <div style={gridForm}>
                        <label style={labelStyle}>
                          New password (min 6 chars)
                          <input
                            type="password"
                            value={pw.pw1}
                            onChange={(e) => setPw(d.id, "pw1", e.target.value)}
                            style={inputStyle}
                            placeholder="••••••"
                          />
                        </label>

                        <label style={labelStyle}>
                          Confirm password
                          <input
                            type="password"
                            value={pw.pw2}
                            onChange={(e) => setPw(d.id, "pw2", e.target.value)}
                            style={inputStyle}
                            placeholder="••••••"
                          />
                        </label>

                        <div style={{ display: "flex", alignItems: "flex-end" }}>
                          <button type="button" style={btnSecondary} disabled={busy} onClick={() => setDriverPassword(d)}>
                            {busy ? "Working…" : "Set password"}
                          </button>
                        </div>
                      </div>

                      <div style={{ marginTop: 8, color: "#666", fontSize: 12 }}>
                        (Legacy) Drivers log in using email + password. New flow is Code + PIN at <b>/login-driver</b>.
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
  background: "#fff",
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
  alignItems: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};

const cardStyle = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 14,
  marginTop: 14,
  background: "#fff",
};

const h2Style = { fontSize: 16, margin: "0 0 10px" };

const gridForm = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "#222",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
};

const btnPrimary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #0070f3",
  background: "#0070f3",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
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
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#8a1f1f",
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondaryLink = {
  ...btnSecondary,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const alertError = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#8a1f1f",
  fontSize: 13,
  whiteSpace: "pre-wrap",
};

const alertOk = {
  padding: 10,
  borderRadius: 8,
  borderRadius: 8,
  border: "1px solid #bfe7c0",
  background: "#f2fff2",
  color: "#1f6b2a",
  fontSize: 13,
};

const driverCard = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
};

const driverTopRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "flex-start",
  marginBottom: 10,
};

const miniMeta = { fontSize: 12, color: "#555" };

const pillActive = {
  display: "inline-block",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid #bfe7c0",
  background: "#f2fff2",
  color: "#1f6b2a",
  fontWeight: 700,
};

const pillInactive = {
  display: "inline-block",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid #e0e0e0",
  background: "#fafafa",
  color: "#666",
  fontWeight: 700,
};

const credsPanel = {
  marginTop: 10,
  border: "1px solid #e5e5e5",
  background: "#fafafa",
  borderRadius: 12,
  padding: 12,
};

const credsBox = {
  border: "1px solid #e5e5e5",
  background: "#fff",
  borderRadius: 12,
  padding: 12,
};

const credsLabel = {
  fontSize: 12,
  color: "#666",
  marginBottom: 6,
};

const credsValue = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: 1,
};
