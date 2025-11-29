// pages/app/staff.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

export default function StaffPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Add staff form state
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [town, setTown] = useState("");
  const [county, setCounty] = useState("");
  const [postcode, setPostcode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [isDriver, setIsDriver] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  // Edit staff form state
  const emptyEditForm = {
    id: null,
    full_name: "",
    dob: "",
    address_line1: "",
    address_line2: "",
    town: "",
    county: "",
    postcode: "",
    phone: "",
    email: "",
    role: "",
    is_driver: false,
    start_date: "",
    end_date: "",
    notes: "",
  };

  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editing, setEditing] = useState(false);

  // Load staff for this subscriber
  useEffect(() => {
    async function loadStaff() {
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
        .from("staff")
        .select(
          `
          id,
          subscriber_id,
          full_name,
          dob,
          address_line1,
          address_line2,
          town,
          county,
          postcode,
          phone,
          email,
          role,
          is_driver,
          start_date,
          end_date,
          notes,
          created_at,
          updated_at
        `
        )
        .eq("subscriber_id", subscriberId)
        .order("full_name", { ascending: true });

      if (error) {
        console.error("Error loading staff:", error);
        setErrorMsg(error.message || "Could not load staff.");
      } else {
        setStaff(data || []);
      }

      setLoading(false);
    }

    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, authError, subscriberId]);

  // ADD staff member
  async function handleAddStaff(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!fullName.trim()) {
      setErrorMsg("Full name is required.");
      return;
    }
    if (!subscriberId) {
      setErrorMsg("No subscriber found – cannot save staff member.");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("staff")
      .insert([
        {
          subscriber_id: subscriberId,
          full_name: fullName.trim(),
          dob: dob || null,
          address_line1: addressLine1.trim() || null,
          address_line2: addressLine2.trim() || null,
          town: town.trim() || null,
          county: county.trim() || null,
          postcode: postcode.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          role: role.trim() || null,
          is_driver: isDriver,
          start_date: startDate || null,
          end_date: endDate || null,
          notes: notes.trim() || null,
        },
      ])
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      console.error("Error adding staff:", error);
      setErrorMsg(error.message || "Could not save staff member.");
      return;
    }

    const updated = [...staff, data].sort((a, b) =>
      a.full_name.localeCompare(b.full_name)
    );
    setStaff(updated);

    // Reset form
    setFullName("");
    setDob("");
    setAddressLine1("");
    setAddressLine2("");
    setTown("");
    setCounty("");
    setPostcode("");
    setPhone("");
    setEmail("");
    setRole("");
    setIsDriver(false);
    setStartDate("");
    setEndDate("");
    setNotes("");

    setSuccessMsg("Staff member added ✓");
  }

  // Start editing
  function startEditStaff(member) {
    setErrorMsg("");
    setSuccessMsg("");

    setEditForm({
      id: member.id,
      full_name: member.full_name || "",
      dob: member.dob || "",
      address_line1: member.address_line1 || "",
      address_line2: member.address_line2 || "",
      town: member.town || "",
      county: member.county || "",
      postcode: member.postcode || "",
      phone: member.phone || "",
      email: member.email || "",
      role: member.role || "",
      is_driver: !!member.is_driver,
      start_date: member.start_date || "",
      end_date: member.end_date || "",
      notes: member.notes || "",
    });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm(emptyEditForm);
  }

  // UPDATE staff member
  async function handleUpdateStaff(e) {
    e.preventDefault();
    if (!editForm.id) return;

    if (!editForm.full_name.trim()) {
      setErrorMsg("Full name is required.");
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    setUpdating(true);

    const { data, error } = await supabase
      .from("staff")
      .update({
        full_name: editForm.full_name.trim(),
        dob: editForm.dob || null,
        address_line1: editForm.address_line1.trim() || null,
        address_line2: editForm.address_line2.trim() || null,
        town: editForm.town.trim() || null,
        county: editForm.county.trim() || null,
        postcode: editForm.postcode.trim() || null,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        role: editForm.role.trim() || null,
        is_driver: editForm.is_driver,
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
        notes: editForm.notes.trim() || null,
      })
      .eq("id", editForm.id)
      .eq("subscriber_id", subscriberId)
      .select("*")
      .single();

    setUpdating(false);

    if (error) {
      console.error("Error updating staff:", error);
      setErrorMsg(error.message || "Could not update staff member.");
      return;
    }

    const updated = staff
      .map((s) => (s.id === data.id ? data : s))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    setStaff(updated);
    setSuccessMsg("Staff member updated ✓");
    cancelEdit();
  }

  // DELETE staff
  async function handleDeleteStaff(member) {
    const ok = window.confirm(
      `Delete staff member "${member.full_name}"? This cannot be undone.`
    );
    if (!ok) return;

    setErrorMsg("");
    setSuccessMsg("");

    const { error } = await supabase
      .from("staff")
      .delete()
      .eq("id", member.id)
      .eq("subscriber_id", subscriberId);

    if (error) {
      console.error("Error deleting staff:", error);
      setErrorMsg(error.message || "Could not delete staff member.");
      return;
    }

    const updated = staff.filter((s) => s.id !== member.id);
    setStaff(updated);
    setSuccessMsg("Staff member deleted ✓");

    if (editing && editForm.id === member.id) {
      cancelEdit();
    }
  }

  if (checking || loading) {
    return <p style={{ padding: "16px" }}>Loading staff…</p>;
  }

  if (!user) {
    return (
      <div style={{ padding: "16px" }}>
        <p>You must be signed in to view staff.</p>
        <button onClick={() => router.push("/login")}>Go to login</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Staff</h1>
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

      {/* Add staff form */}
      <form
        onSubmit={handleAddStaff}
        style={{
          marginBottom: "32px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "4px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "12px" }}>Add staff member</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          <div>
            <label>
              Full name *
              <br />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Date of birth
              <br />
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
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
              Role
              <br />
              <input
                type="text"
                placeholder="Driver, Yard, Office…"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Start date
              <br />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              End date (if left)
              <br />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={isDriver}
                onChange={(e) => setIsDriver(e.target.checked)}
              />
              This person is a driver (used in scheduler / driver lists)
            </label>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label>
              Address line 1
              <br />
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label>
              Address line 2
              <br />
              <input
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Town
              <br />
              <input
                type="text"
                value={town}
                onChange={(e) => setTown(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              County
              <br />
              <input
                type="text"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </label>
          </div>

          <div>
            <label>
              Postcode
              <br />
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
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
          {saving ? "Saving…" : "Add staff member"}
        </button>
      </form>

      {/* Edit staff form */}
      {editing && (
        <form
          onSubmit={handleUpdateStaff}
          style={{
            marginBottom: "32px",
            padding: "16px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            background: "#f9f9f9",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "12px" }}>
            Edit staff member – {editForm.full_name}
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
                Full name *
                <br />
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, full_name: e.target.value }))
                  }
                  required
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>

            <div>
              <label>
                Date of birth
                <br />
                <input
                  type="date"
                  value={editForm.dob || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, dob: e.target.value }))
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
                Role
                <br />
                <input
                  type="text"
                  value={editForm.role}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, role: e.target.value }))
                  }
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>

            <div>
              <label>
                Start date
                <br />
                <input
                  type="date"
                  value={editForm.start_date || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, start_date: e.target.value }))
                  }
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>

            <div>
              <label>
                End date (if left)
                <br />
                <input
                  type="date"
                  value={editForm.end_date || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, end_date: e.target.value }))
                  }
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>

            <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={editForm.is_driver}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      is_driver: e.target.checked,
                    }))
                  }
                />
                This person is a driver (used in scheduler / driver lists)
              </label>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>
                Address line 1
                <br />
                <input
                  type="text"
                  value={editForm.address_line1}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      address_line1: e.target.value,
                    }))
                  }
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>
                Address line 2
                <br />
                <input
                  type="text"
                  value={editForm.address_line2}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      address_line2: e.target.value,
                    }))
                  }
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>

            <div>
              <label>
                Town
                <br />
                <input
                  type="text"
                  value={editForm.town}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, town: e.target.value }))
                  }
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>

            <div>
              <label>
                County
                <br />
                <input
                  type="text"
                  value={editForm.county}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, county: e.target.value }))
                  }
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
            </div>

            <div>
              <label>
                Postcode
                <br />
                <input
                  type="text"
                  value={editForm.postcode}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, postcode: e.target.value }))
                  }
                  style={{ width: "100%", padding: "6px" }}
                />
              </label>
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

      {/* Staff table */}
      <h2>Existing staff</h2>
      {staff.length === 0 ? (
        <p>No staff members found yet.</p>
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
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Driver?</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Start date</th>
                <th style={thStyle}>End date</th>
                <th style={thStyle}>Town</th>
                <th style={thStyle}>Postcode</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.id}>
                  <td style={tdStyle}>{m.full_name}</td>
                  <td style={tdStyle}>{m.role || ""}</td>
                  <td style={tdStyle}>{m.is_driver ? "Yes" : "No"}</td>
                  <td style={tdStyle}>{m.phone || ""}</td>
                  <td style={tdStyle}>{m.email || ""}</td>
                  <td style={tdStyle}>{m.start_date || ""}</td>
                  <td style={tdStyle}>{m.end_date || ""}</td>
                  <td style={tdStyle}>{m.town || ""}</td>
                  <td style={tdStyle}>{m.postcode || ""}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => startEditStaff(m)}
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
                      onClick={() => handleDeleteStaff(m)}
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
  borderBottom: "1px solid #eee",
  padding: "8px",
  fontSize: 12,
};
