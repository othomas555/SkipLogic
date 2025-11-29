// pages/app/drivers.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

export default function DriversPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [licenceNumber, setLicenceNumber] = useState("");
  const [licenceCheckDue, setLicenceCheckDue] = useState("");
  const [driverCardNumber, setDriverCardNumber] = useState("");
  const [driverCardExpiry, setDriverCardExpiry] = useState("");
  const [cpcExpiry, setCpcExpiry] = useState("");
  const [medicalExpiry, setMedicalExpiry] = useState("");
  const [notes, setNotes] = useState("");

  // Load drivers for this subscriber
  useEffect(() => {
    async function loadDrivers() {
      if (checking) return;

      if (authError) {
        setErrorMsg(authError);
        setLoading(false);
        return;
      }

      if (!subscriberId) {
        setErrorMsg("No subscriber found for this user.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("subscriber_id", subscriberId)
        .order("name", { ascending: true });

      if (error) {
        console.error("Error loading drivers:", error);
        setErrorMsg(error.message || "Could not load drivers.");
      } else {
        setDrivers(data || []);
      }

      setLoading(false);
    }

    loadDrivers();
  }, [checking, authError, subscriberId]);

  async function handleAddDriver(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!name.trim()) {
      setErrorMsg("Driver name is required.");
      return;
    }
    if (!subscriberId) {
      setErrorMsg("No subscriber found – cannot save driver.");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("drivers")
      .insert([
        {
          subscriber_id: subscriberId,
          name: name.trim(),
          callsign: callsign.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          licence_number: licenceNumber.trim() || null,
          licence_check_due: licenceCheckDue || null,
          driver_card_number: driverCardNumber.trim() || null,
          driver_card_expiry: driverCardExpiry || null,
          cpc_expiry: cpcExpiry || null,
          medical_expiry: medicalExpiry || null,
          notes: notes.trim() || null,
          // is_active will default to true
        },
      ])
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      console.error("Error adding driver:", error);
      setErrorMsg(error.message || "Could not save driver.");
      return;
    }

    // Add to list & reset form
    setDrivers((prev) =>
      [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
    );

    setName("");
    setCallsign("");
    setPhone("");
    setEmail("");
    setLicenceNumber("");
    setLicenceCheckDue("");
    setDriverCardNumber("");
    setDriverCardExpiry("");
    setCpcExpiry("");
    setMedicalExpiry("");
    setNotes("");
    setSuccessMsg("Driver added and saved ✓");
  }

  if (checking || loading) {
    return <p style={{ padding: "16px" }}>Loading drivers…</p>;
  }

  if (!user) {
    return (
      <div style={{ padding: "16px" }}>
        <p>You must be signed in to view drivers.</p>
        <button onClick={() => router.push("/login")}>Go to login</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Drivers</h1>
      <p style={{ marginBottom: "16px" }}>
        Signed in as <strong>{user.email}</strong>
      </p>

      <button
        type="button"
        onClick={() => router.push("/app")}
        style={{
          marginBottom: "24px",
          padding: "8px 12px",
          borderRadius: "4px",
          border: "1px solid #ccc",
          background: "#f5f5f5",
          cursor: "pointer",
        }}
      >
        ← Back to dashboard
      </button>

      {errorMsg && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            borderRadius: "4px",
            background: "#ffe5e5",
            border: "1px solid #ffb3b3",
          }}
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            borderRadius: "4px",
            background: "#e5ffe8",
            border: "1px solid #b3ffbd",
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Add driver form */}
      <form
        onSubmit={handleAddDriver}
        style={{
          marginBottom: "32px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "4px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "12px" }}>Add driver</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          <div>
            <label>
              Name *
              <br />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Callsign (optional)
              <br />
              <input
                type="text"
                placeholder="e.g. Driver A"
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Phone
              <br />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Email
              <br />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Licence number
              <br />
              <input
                type="text"
                value={licenceNumber}
                onChange={(e) => setLicenceNumber(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Next licence check due
              <br />
              <input
                type="date"
                value={licenceCheckDue}
                onChange={(e) => setLicenceCheckDue(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Driver card number
              <br />
              <input
                type="text"
                value={driverCardNumber}
                onChange={(e) => setDriverCardNumber(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Driver card expiry
              <br />
              <input
                type="date"
                value={driverCardExpiry}
                onChange={(e) => setDriverCardExpiry(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              CPC expiry
              <br />
              <input
                type="date"
                value={cpcExpiry}
                onChange={(e) => setCpcExpiry(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Medical expiry
              <br />
              <input
                type="date"
                value={medicalExpiry}
                onChange={(e) => setMedicalExpiry(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label>
              Notes
              <br />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: "16px",
            padding: "8px 16px",
            borderRadius: "4px",
            border: "none",
            background: saving ? "#888" : "#0070f3",
            color: "#fff",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Add driver"}
        </button>
      </form>

      {/* Drivers table */}
      <h2>Existing drivers</h2>
      {drivers.length === 0 ? (
        <p>No drivers found yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "800px",
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Callsign</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Licence check due</th>
                <th style={thStyle}>Driver card expiry</th>
                <th style={thStyle}>CPC expiry</th>
                <th style={thStyle}>Medical expiry</th>
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id}>
                  <td style={tdStyle}>{d.name}</td>
                  <td style={tdStyle}>{d.callsign || ""}</td>
                  <td style={tdStyle}>{d.phone || ""}</td>
                  <td style={tdStyle}>{d.licence_check_due || ""}</td>
                  <td style={tdStyle}>{d.driver_card_expiry || ""}</td>
                  <td style={tdStyle}>{d.cpc_expiry || ""}</td>
                  <td style={tdStyle}>{d.medical_expiry || ""}</td>
                  <td style={tdStyle}>{d.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Shared styles
const thStyle = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "8px",
  fontWeight: "bold",
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: "8px",
};
