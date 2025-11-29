import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

export default function StaffHolidaysPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [staff, setStaff] = useState([]);
  const [holidays, setHolidays] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form state
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!checking && !user) {
      router.push("/login");
    }
  }, [checking, user, router]);

  useEffect(() => {
    if (!checking && subscriberId) {
      loadData();
    }
  }, [checking, subscriberId]);

  async function loadData() {
    try {
      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");

      // Load staff for this subscriber
      const { data: staffRows, error: staffError } = await supabase
        .from("staff")
        .select("id, full_name, is_driver")
        .eq("subscriber_id", subscriberId)
        .order("full_name", { ascending: true });

      if (staffError) {
        console.error("Error loading staff", staffError);
        throw new Error("Could not load staff list");
      }

      // Load holidays
      const { data: holidayRows, error: holidayError } = await supabase
        .from("staff_holidays")
        .select("id, staff_id, start_date, end_date, status, reason, created_at")
        .eq("subscriber_id", subscriberId)
        .order("start_date", { ascending: false });

      if (holidayError) {
        console.error("Error loading holidays", holidayError);
        throw new Error("Could not load holidays");
      }

      setStaff(staffRows || []);
      setHolidays(holidayRows || []);
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong loading data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddHoliday(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedStaffId || !startDate || !endDate) {
      setErrorMsg("Please choose a staff member and both start/end dates.");
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase.from("staff_holidays").insert({
        subscriber_id: subscriberId,
        staff_id: selectedStaffId,
        start_date: startDate,
        end_date: endDate,
        reason: reason || null,
        status: "pending",
        created_by: user?.id || null,
      });

      if (error) {
        console.error("Error creating holiday", error);
        throw new Error(error.message || "Could not create holiday");
      }

      setSuccessMsg("Holiday request added.");
      // Reset form
      setSelectedStaffId("");
      setStartDate("");
      setEndDate("");
      setReason("");

      // Reload list
      await loadData();
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong saving the holiday.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id, newStatus) {
    setErrorMsg("");
    setSuccessMsg("");
    setUpdatingId(id);

    try {
      const { error } = await supabase
        .from("staff_holidays")
        .update({
          status: newStatus,
          decided_at: new Date().toISOString(),
          decided_by: user?.id || null,
        })
        .eq("id", id);

      if (error) {
        console.error("Error updating holiday status", error);
        throw new Error(error.message || "Could not update status");
      }

      setSuccessMsg(`Holiday marked as ${newStatus}.`);
      await loadData();
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong updating the holiday.");
    } finally {
      setUpdatingId(null);
    }
  }

  function formatDate(d) {
    if (!d) return "";
    // d will be "YYYY-MM-DD" from Postgres for a date column
    try {
      return new Date(d).toLocaleDateString();
    } catch {
      return d;
    }
  }

  const staffById = staff.reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
  }, {});

  if (checking) {
    return <div style={{ padding: 20 }}>Checking login…</div>;
  }

  if (authError) {
    return (
      <div style={{ padding: 20, color: "red" }}>
        Auth error: {authError}
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1>Staff Holidays</h1>

      {errorMsg && (
        <div
          style={{
            backgroundColor: "#ffe5e5",
            color: "#b00020",
            padding: "10px 15px",
            marginBottom: 15,
            borderRadius: 4,
          }}
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            backgroundColor: "#e5ffe9",
            color: "#1b5e20",
            padding: "10px 15px",
            marginBottom: 15,
            borderRadius: 4,
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Add holiday form */}
      <section
        style={{
          border: "1px solid #ddd",
          padding: 16,
          borderRadius: 4,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Add Holiday</h2>
        <form onSubmit={handleAddHoliday}>
          <div style={{ marginBottom: 10 }}>
            <label>
              Staff member:
              <br />
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                style={{ padding: 6, minWidth: 250 }}
              >
                <option value="">Select staff…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {s.is_driver ? " (Driver)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginBottom: 10, display: "flex", gap: 16 }}>
            <label>
              Start date:
              <br />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ padding: 6 }}
              />
            </label>

            <label>
              End date:
              <br />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ padding: 6 }}
              />
            </label>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label>
              Reason / notes (optional):
              <br />
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                style={{ width: "100%", padding: 6 }}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving || !subscriberId}
            style={{
              padding: "8px 16px",
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Add Holiday"}
          </button>
        </form>
      </section>

      {/* Holiday list */}
      <section>
        <h2>Holiday Requests / Booked Days Off</h2>
        {loading ? (
          <div>Loading holidays…</div>
        ) : holidays.length === 0 ? (
          <div>No holidays recorded yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                minWidth: 600,
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle}>Staff</th>
                  <th style={thStyle}>Start</th>
                  <th style={thStyle}>End</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Reason</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id}>
                    <td style={tdStyle}>
                      {staffById[h.staff_id]?.full_name || "Unknown"}
                    </td>
                    <td style={tdStyle}>{formatDate(h.start_date)}</td>
                    <td style={tdStyle}>{formatDate(h.end_date)}</td>
                    <td style={tdStyle}>{h.status}</td>
                    <td style={tdStyle}>{h.reason || ""}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => updateStatus(h.id, "approved")}
                        disabled={updatingId === h.id}
                        style={{ marginRight: 6 }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStatus(h.id, "rejected")}
                        disabled={updatingId === h.id}
                        style={{ marginRight: 6 }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStatus(h.id, "cancelled")}
                        disabled={updatingId === h.id}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const thStyle = {
  borderBottom: "1px solid #ccc",
  textAlign: "left",
  padding: "6px 8px",
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: "6px 8px",
};
