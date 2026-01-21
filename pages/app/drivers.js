// pages/app/drivers.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

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

  // Add driver form
  const [fullName, setFullName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [licenceNumber, setLicenceNumber] = useState("");

  async function loadDrivers() {
    if (checking) return;
    if (!user || !subscriberId) return;

    setLoading(true);
    setErrorMsg("");

    let q = supabase
      .from("drivers")
      .select("id, subscriber_id, full_name, callsign, phone, email, licence_number, is_active, created_at")
      .eq("subscriber_id", subscriberId)
      .order("is_active", { ascending: false })
      .order("full_name", { ascending: true });

    if (!showInactive) {
      q = q.eq("is_active", true);
    }

    const { data, error } = await q;

    if (error) {
      console.error(error);
      setErrorMsg("Could not load drivers.");
      setDrivers([]);
      setLoading(false);
      return;
    }

    setDrivers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId, showInactive]);

  const signedInLabel = useMemo(() => {
    return user?.email ? `Signed in as ${user.email}` : "Signed in";
  }, [user]);

  async function addDriver(e) {
    e?.preventDefault?.();
    if (!subscriberId) return;

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    const payload = {
      subscriber_id: subscriberId,
      full_name: toStr(fullName),
      callsign: toStr(callsign) || null,
      phone: toStr(phone) || null,
      email: toStr(email) || null,
      licence_number: toStr(licenceNumber) || null,
      is_active: true,
    };

    if (!payload.full_name) {
      setSaving(false);
      setErrorMsg("Name is required.");
      return;
    }

    const { error } = await supabase.from("drivers").insert(payload);

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg("Could not add driver: " + (error.message || "Unknown error"));
      return;
    }

    setFullName("");
    setCallsign("");
    setPhone("");
    setEmail("");
    setLicenceNumber("");

    setSuccessMsg("Driver added.");
    await loadDrivers();
  }

  async function deactivateDriver(driver) {
    if (!driver?.id) return;
    if (!subscriberId) return;

    const ok = confirm(
      `Deactivate "${driver.full_name}"?\n\nThis will automatically unassign them from FUTURE jobs. Historic jobs remain unchanged.`
    );
    if (!ok) return;

    setActingId(driver.id);
    setErrorMsg("");
    setSuccessMsg("");

    // 1) Deactivate driver
    const { error: dErr } = await supabase
      .from("drivers")
      .update({ is_active: false })
      .eq("id", driver.id)
      .eq("subscriber_id", subscriberId);

    if (dErr) {
      console.error(dErr);
      setActingId("");
      setErrorMsg("Could not deactivate driver: " + (dErr.message || "Unknown error"));
      return;
    }

    // 2) Unassign from future jobs
    // Definition of "future": scheduled_date >= today (UTC) AND not yet collected.
    // (We also scope by subscriber_id.)
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
      // Driver is deactivated, but unassign failed. Surface it.
      console.error(jErr);
      setErrorMsg(
        "Driver deactivated, but could not unassign future jobs: " + (jErr.message || "Unknown error")
      );
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
      .update({ is_active: true })
      .eq("id", driver.id)
      .eq("subscriber_id", subscriberId);

    setActingId("");

    if (error) {
      console.error(error);
      setErrorMsg("Could not reactivate driver: " + (error.message || "Unknown error"));
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
      <h1 style={{ marginTop: 0 }}>Drivers</h1>
      <p style={{ marginTop: 6, color: "#444" }}>
        <b>{signedInLabel}</b>
      </p>

      <div style={{ margin: "12px 0 16px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/app" style={btnSecondaryLink}>
          ← Back to dashboard
        </Link>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive drivers
        </label>
      </div>

      {(authError || errorMsg || successMsg) && (
        <div style={{ marginBottom: 14 }}>
          {authError || errorMsg ? (
            <div style={alertError}>{authError || errorMsg}</div>
          ) : null}
          {successMsg ? <div style={alertOk}>{successMsg}</div> : null}
        </div>
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>Add driver</h2>
        <form onSubmit={addDriver}>
          <div style={gridForm}>
            <label style={labelStyle}>
              Name *
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Callsign (optional)
              <input value={callsign} onChange={(e) => setCallsign(e.target.value)} style={inputStyle} placeholder="e.g. Driver A" />
            </label>
            <label style={labelStyle}>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Licence number
              <input value={licenceNumber} onChange={(e) => setLicenceNumber(e.target.value)} style={inputStyle} />
            </label>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
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
          <div style={{ display: "grid", gap: 10 }}>
            {drivers.map((d) => {
              const inactive = d.is_active === false;
              const busy = actingId === d.id;

              return (
                <div key={d.id} style={driverRow}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {d.full_name || "—"}{" "}
                        {inactive ? <span style={pillInactive}>Inactive</span> : <span style={pillActive}>Active</span>}
                      </div>
                      {d.callsign ? <div style={{ fontSize: 12, color: "#555" }}>Callsign: {d.callsign}</div> : null}
                    </div>

                    <div style={{ fontSize: 12, color: "#555", display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {d.phone ? <span>Phone: {d.phone}</span> : null}
                      {d.email ? <span>Email: {d.email}</span> : null}
                      {d.licence_number ? <span>Licence: {d.licence_number}</span> : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {!inactive ? (
                      <button
                        style={btnDanger}
                        disabled={busy}
                        onClick={() => deactivateDriver(d)}
                        type="button"
                      >
                        {busy ? "Working…" : "Deactivate"}
                      </button>
                    ) : (
                      <button
                        style={btnSecondary}
                        disabled={busy}
                        onClick={() => reactivateDriver(d)}
                        type="button"
                      >
                        {busy ? "Working…" : "Reactivate"}
                      </button>
                    )}
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
};

const alertOk = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #bfe7c0",
  background: "#f2fff2",
  color: "#1f6b2a",
  fontSize: 13,
};

const driverRow = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const pillActive = {
  display: "inline-block",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid #bfe7c0",
  background: "#f2fff2",
  color: "#1f6b2a",
  fontWeight: 700,
  marginLeft: 8,
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
  marginLeft: 8,
};
