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

  // Add form state
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

  const [expiryNotificationsEnabled, setExpiryNotificationsEnabled] =
    useState(false);
  const [expiryWarningDays, setExpiryWarningDays] = useState(30);

  // Edit form state
  const emptyEditForm = {
    id: null,
    name: "",
    callsign: "",
    phone: "",
    email: "",
    licence_number: "",
    licence_check_due: "",
    driver_card_number: "",
    driver_card_expiry: "",
    cpc_expiry: "",
    medical_expiry: "",
    notes: "",
    expiry_notifications_enabled: false,
    expiry_warning_days: 30,
  };

  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Expiry warnings
  const [expiringDrivers, setExpiringDrivers] = useState([]);
  const [showExpiryModal, setShowExpiryModal] = useState(false);

  // Helper: compute which drivers are in warning window
  function computeExpiringDrivers(list) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results = [];

    list.forEach((d) => {
      if (!d.expiry_notifications_enabled) return;

      const warningDays =
        d.expiry_warning_days === null || d.expiry_warning_days === undefined
          ? 30
          : Number(d.expiry_warning_days) || 30;

      const docs = [
        { key: "licence_check_due", label: "Licence check" },
        { key: "driver_card_expiry", label: "Driver card" },
        { key: "cpc_expiry", label: "CPC" },
        { key: "medical_expiry", label: "Medical" },
      ];

      let soonestDoc = null;

      docs.forEach((doc) => {
        const value = d[doc.key];
        if (!value) return;

        const expiryDate = new Date(value);
        if (Number.isNaN(expiryDate.getTime())) return;

        expiryDate.setHours(0, 0, 0, 0);

        const diffMs = expiryDate.getTime() - today.getTime();
        const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (daysUntil <= warningDays) {
          if (!soonestDoc || expiryDate < soonestDoc.expiryDate) {
            soonestDoc = {
              label: doc.label,
              expiryDate,
              daysUntil,
            };
          }
        }
      });

      if (soonestDoc) {
        results.push({
          driver: d,
          label: soonestDoc.label,
          expiryDate: soonestDoc.expiryDate,
          daysUntil: soonestDoc.daysUntil,
        });
      }
    });

    results.sort((a, b) => a.expiryDate - b.expiryDate);

    setExpiringDrivers(results);
    setShowExpiryModal(results.length > 0);
  }

  // Load drivers
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
        .select(
          `
          id,
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
          expiry_notifications_enabled,
          expiry_warning_days
        `
        )
        .eq("subscriber_id", subscriberId)
        .order("name", { ascending: true });

      if (error) {
        console.error("Error loading drivers:", error);
        setErrorMsg(error.message || "Could not load drivers.");
      } else {
        const list = data || [];
        setDrivers(list);
        computeExpiringDrivers(list);
      }

      setLoading(false);
    }

    loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, authError, subscriberId]);

  // ADD driver
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

    const warningDaysNumber =
      expiryWarningDays === "" ? 30 : Number(expiryWarningDays) || 30;

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
          expiry_notifications_enabled: expiryNotificationsEnabled,
          expiry_warning_days: warningDaysNumber,
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

    const updated = [...drivers, data].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    setDrivers(updated);
    computeExpiringDrivers(updated);

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
    setExpiryNotificationsEnabled(false);
    setExpiryWarningDays(30);
    setSuccessMsg("Driver added and saved ✓");
  }

  // Start editing an existing driver
  function startEditDriver(d) {
    setErrorMsg("");
    setSuccessMsg("");

    setEditForm({
      id: d.id,
      name: d.name || "",
      callsign: d.callsign || "",
      phone: d.phone || "",
      email: d.email || "",
      licence_number: d.licence_number || "",
      licence_check_due: d.licence_check_due || "",
      driver_card_number: d.driver_card_number || "",
      driver_card_expiry: d.driver_card_expiry || "",
      cpc_expiry: d.cpc_expiry || "",
      medical_expiry: d.medical_expiry || "",
      notes: d.notes || "",
      expiry_notifications_enabled: !!d.expiry_notifications_enabled,
      expiry_warning_days:
        d.expiry_warning_days === null ||
        d.expiry_warning_days === undefined ||
        d.expiry_warning_days === ""
          ? 30
          : Number(d.expiry_warning_days) || 30,
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm(emptyEditForm);
  }

  // UPDATE driver
  async function handleUpdateDriver(e) {
    e.preventDefault();
    if (!editForm.id) return;

    if (!editForm.name.trim()) {
      setErrorMsg("Driver name is required.");
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    setUpdating(true);

    const warningDaysNumber =
      editForm.expiry_warning_days === "" || editForm.expiry_warning_days === null
        ? 30
        : Number(editForm.expiry_warning_days) || 30;

    const { data, error } = await supabase
      .from("drivers")
      .update({
        name: editForm.name.trim(),
        callsign: editForm.callsign.trim() || null,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        licence_number: editForm.licence_number.trim() || null,
        licence_check_due: editForm.licence_check_due || null,
        driver_card_number: editForm.driver_card_number.trim() || null,
        driver_card_expiry: editForm.driver_card_expiry || null,
        cpc_expiry: editForm.cpc_expiry || null,
        medical_expiry: editForm.medical_expiry || null,
        notes: editForm.notes.trim() || null,
        expiry_notifications_enabled: editForm.expiry_notifications_enabled,
        expiry_warning_days: warningDaysNumber,
      })
      .eq("id", editForm.id)
      .eq("subscriber_id", subscriberId)
      .select("*")
      .single();

    setUpdating(false);

    if (error) {
      console.error("Error updating driver:", error);
      setErrorMsg(error.message || "Could not update driver.");
      return;
    }

    const updated = drivers
      .map((d) => (d.id === data.id ? data : d))
      .sort((a, b) => a.name.localeCompare(b.name));

    setDrivers(updated);
    computeExpiringDrivers(updated);
    setSuccessMsg("Driver updated ✓");
    cancelEdit();
  }

  // DELETE driver
  async function handleDeleteDriver(d) {
    const ok = window.confirm(
      `Delete driver "${d.name}"? This cannot be undone.`
    );
    if (!ok) return;

    setErrorMsg("");
    setSuccessMsg("");

    const { error } = await supabase
      .from("drivers")
      .delete()
      .eq("id", d.id)
      .eq("subscriber_id", subscriberId);

    if (error) {
      console.error("Error deleting driver:", error);
      setErrorMsg(error.message || "Could not delete driver.");
      return;
    }

    const updated = drivers.filter((x) => x.id !== d.id);
    setDrivers(updated);
    computeExpiringDrivers(updated);

    if (editing && editForm.id === d.id) {
      cancelEdit();
    }

    setSuccessMsg("Driver deleted ✓");
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

      {expiringDrivers.length > 0 && (
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 12px",
            borderRadius: "4px",
            background: "#fff7e0",
            border: "1px solid #ffd666",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>
            ⚠️ {expiringDrivers.length} driver
            {expiringDrivers.length > 1 ? "s" : ""} have documents due or
            overdue.
          </span>
          <button
            type="button"
            onClick={() => setShowExpiryModal(true)}
            style={{
              padding: "4px 10px",
              borderRadius: "4px",
              border: "none",
              background: "#ffb400",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            View details
          </button>
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
                value={callssign}
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

          <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={expiryNotificationsEnabled}
                onChange={(e) =>
                  setExpiryNotificationsEnabled(e.target.checked)
                }
              />
              Enable expiry warnings for this driver
            </label>
            <div style={{ marginTop: 4, fontSize: 12, color: "#555" }}>
              If enabled, they will appear in the warning list when any licence
              / card / CPC / medical expiry is within the warning window.
            </div>

            <div style={{ marginTop: 8 }}>
              <label>
                Warn from (days before expiry)
                <br />
                <input
                  type="number"
                  min="1"
                  value={expiryWarningDays}
                  onChange={(e) => setExpiryWarningDays(e.target.value)}
                  style={{ width: "120px", padding: "6px" }}
                />
              </label>
            </div>
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

      {/* EDIT driver form */}
      {editing && (
        <form
          onSubmit={handleUpdateDriver}
          style={{
            marginBottom: "32px",
            padding: "16px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            background: "#f9f9f9",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "12px" }}>
            Edit driver – {editForm.name}
          </h2>

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
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                  required
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>

            <div>
              <label>
                Callsign
                <br />
                <input
                  type="text"
                  value={editForm.callsign}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, callsign: e.target.value }))
                  }
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
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, phone: e.target.value }))
                  }
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
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, email: e.target.value }))
                  }
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
                  value={editForm.licence_number}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      licence_number: e.target.value,
                    }))
                  }
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
                  value={editForm.licence_check_due || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      licence_check_due: e.target.value,
                    }))
                  }
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
                  value={editForm.driver_card_number}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      driver_card_number: e.target.value,
                    }))
                  }
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
                  value={editForm.driver_card_expiry || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      driver_card_expiry: e.target.value,
                    }))
                  }
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
                  value={editForm.cpc_expiry || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      cpc_expiry: e.target.value,
                    }))
                  }
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
                  value={editForm.medical_expiry || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      medical_expiry: e.target.value,
                    }))
                  }
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>

            <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={editForm.expiry_notifications_enabled}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      expiry_notifications_enabled: e.target.checked,
                    }))
                  }
                />
                Enable expiry warnings for this driver
              </label>
              <div style={{ marginTop: 4, fontSize: 12, color: "#555" }}>
                If enabled, they will appear in the warning list when any
                licence / card / CPC / medical expiry is within the warning
                window.
              </div>

              <div style={{ marginTop: 8 }}>
                <label>
                  Warn from (days before expiry)
                  <br />
                  <input
                    type="number"
                    min="1"
                    value={editForm.expiry_warning_days}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        expiry_warning_days: e.target.value,
                      }))
                    }
                    style={{ width: "120px", padding: "6px" }}
                  />
                </label>
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>
                Notes
                <br />
                <textarea
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={3}
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>
          </div>

          <div
            style={{
              marginTop: "16px",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              type="submit"
              disabled={updating}
              style={{
                padding: "8px 16px",
                borderRadius: "4px",
                border: "none",
                background: updating ? "#888" : "#0070f3",
                color: "#fff",
                cursor: updating ? "default" : "pointer",
              }}
            >
              {updating ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              style={{
                padding: "8px 16px",
                borderRadius: "4px",
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

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
              minWidth: "900px",
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
                <th style={thStyle}>Notify?</th>
                <th style={thStyle}>Warn from (days)</th>
                <th style={thStyle}>Notes</th>
                <th style={thStyle}>Actions</th>
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
                  <td style={tdStyle}>
                    {d.expiry_notifications_enabled ? "Yes" : "No"}
                  </td>
                  <td style={tdStyle}>{d.expiry_warning_days ?? ""}</td>
                  <td style={tdStyle}>{d.notes || ""}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => startEditDriver(d)}
                      style={{
                        padding: "4px 8px",
                        marginRight: 4,
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        background: "#f5f5f5",
                        cursor: "pointer",
                        fontSize: 11,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDriver(d)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: "1px solid #f5b3b3",
                        background: "#ffe5e5",
                        cursor: "pointer",
                        fontSize: 11,
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Expiry warnings modal */}
      {showExpiryModal && expiringDrivers.length > 0 && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <h3 style={{ margin: 0 }}>Driver document warnings</h3>
              <button
                type="button"
                onClick={() => setShowExpiryModal(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 16,
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, marginBottom: 12 }}>
              These drivers have licence / card / CPC / medical dates within
              their warning window, or already past due.
            </p>

            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr>
                    <th style={thStyle}>Driver</th>
                    <th style={thStyle}>Callsign</th>
                    <th style={thStyle}>Document</th>
                    <th style={thStyle}>Expiry date</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringDrivers.map((item) => {
                    const { driver, label, expiryDate, daysUntil } = item;
                    const isOverdue = daysUntil < 0;
                    return (
                      <tr key={driver.id + label}>
                        <td style={tdStyle}>{driver.name}</td>
                        <td style={tdStyle}>{driver.callsign || ""}</td>
                        <td style={tdStyle}>{label}</td>
                        <td style={tdStyle}>
                          {expiryDate.toISOString().slice(0, 10)}
                        </td>
                        <td style={tdStyle}>
                          {isOverdue
                            ? `Overdue by ${Math.abs(daysUntil)} day${
                                Math.abs(daysUntil) === 1 ? "" : "s"
                              }`
                            : `Due in ${daysUntil} day${
                                daysUntil === 1 ? "" : "s"
                              }`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setShowExpiryModal(false)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "none",
                  background: "#0070f3",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Close
              </button>
            </div>
          </div>
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
  fontSize: 12,
};

const tdStyle = {
  borderBottom: "1px solid "#eee",
  padding: "8px",
  fontSize: 12,
};

// Modal styles
const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle = {
  background: "#fff",
  borderRadius: "6px",
  padding: "16px",
  maxWidth: "800px",
  width: "100%",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};
