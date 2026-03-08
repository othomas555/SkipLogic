// pages/app/staff-holidays.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

function parseYmd(ymd) {
  if (!ymd) return null;
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDate(ymd) {
  const dt = parseYmd(ymd);
  if (!dt) return ymd || "";
  return dt.toLocaleDateString("en-GB");
}

function countWorkingDaysInclusive(startYmd, endYmd) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return 0;
  if (end < start) return 0;

  let count = 0;
  const cur = new Date(start);

  while (cur <= end) {
    const day = cur.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return count;
}

function holidayYearRange(staffMember, referenceDateYmd) {
  const ref = parseYmd(referenceDateYmd) || new Date();
  const holidayStart = parseYmd(staffMember?.holiday_year_start);

  if (!holidayStart) {
    const year = ref.getFullYear();
    return {
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      label: `${year}`,
    };
  }

  const startMonth = holidayStart.getMonth();
  const startDay = holidayStart.getDate();

  let year = ref.getFullYear();
  const thisYearsStart = new Date(year, startMonth, startDay);

  if (ref < thisYearsStart) {
    year -= 1;
  }

  const rangeStart = new Date(year, startMonth, startDay);
  const nextRangeStart = new Date(year + 1, startMonth, startDay);
  const rangeEnd = new Date(nextRangeStart);
  rangeEnd.setDate(rangeEnd.getDate() - 1);

  const toYmd = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  return {
    start: toYmd(rangeStart),
    end: toYmd(rangeEnd),
    label: `${formatDate(toYmd(rangeStart))} to ${formatDate(toYmd(rangeEnd))}`,
  };
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, subscriberId]);

  async function loadData() {
    try {
      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");

      const { data: staffRows, error: staffError } = await supabase
        .from("staff")
        .select("id, full_name, role, annual_leave_allowance, holiday_year_start")
        .eq("subscriber_id", subscriberId)
        .order("full_name", { ascending: true });

      if (staffError) {
        console.error("Error loading staff", staffError);
        throw new Error("Could not load staff list");
      }

      const { data: holidayRows, error: holidayError } = await supabase
        .from("staff_holidays")
        .select("id, staff_id, start_date, end_date, status, reason")
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

    if (endDate < startDate) {
      setErrorMsg("End date cannot be before start date.");
      return;
    }

    const workingDays = countWorkingDaysInclusive(startDate, endDate);
    if (workingDays <= 0) {
      setErrorMsg("That range contains no working days. Weekends are not counted.");
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
        status: "approved",
      });

      if (error) {
        console.error("Error creating holiday", error);
        throw new Error(error.message || "Could not create holiday");
      }

      setSuccessMsg(`Holiday added (${workingDays} working day${workingDays === 1 ? "" : "s"}).`);
      setSelectedStaffId("");
      setStartDate("");
      setEndDate("");
      setReason("");

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
        })
        .eq("id", id)
        .eq("subscriber_id", subscriberId);

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

  async function deleteHoliday(id) {
    const ok = window.confirm("Delete this holiday record?");
    if (!ok) return;

    setErrorMsg("");
    setSuccessMsg("");
    setUpdatingId(id);

    try {
      const { error } = await supabase
        .from("staff_holidays")
        .delete()
        .eq("id", id)
        .eq("subscriber_id", subscriberId);

      if (error) {
        console.error("Error deleting holiday", error);
        throw new Error(error.message || "Could not delete holiday");
      }

      setSuccessMsg("Holiday deleted.");
      await loadData();
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong deleting the holiday.");
    } finally {
      setUpdatingId(null);
    }
  }

  const staffById = useMemo(() => {
    const acc = {};
    for (const s of staff) {
      acc[s.id] = s;
    }
    return acc;
  }, [staff]);

  const holidaySummariesByStaffId = useMemo(() => {
    const map = {};

    for (const s of staff) {
      const year = holidayYearRange(s, new Date().toISOString().slice(0, 10));
      map[s.id] = {
        allowance: Number(s.annual_leave_allowance ?? 28) || 28,
        yearStart: year.start,
        yearEnd: year.end,
        yearLabel: year.label,
        approvedDaysTaken: 0,
        pendingDays: 0,
        remaining: Number(s.annual_leave_allowance ?? 28) || 28,
      };
    }

    for (const h of holidays) {
      const staffMember = staffById[h.staff_id];
      if (!staffMember) continue;

      const summary = map[h.staff_id];
      if (!summary) continue;

      if (!h.start_date || !h.end_date) continue;

      if (h.end_date < summary.yearStart || h.start_date > summary.yearEnd) {
        continue;
      }

      const clippedStart = h.start_date < summary.yearStart ? summary.yearStart : h.start_date;
      const clippedEnd = h.end_date > summary.yearEnd ? summary.yearEnd : h.end_date;

      const days = countWorkingDaysInclusive(clippedStart, clippedEnd);

      if (h.status === "approved") {
        summary.approvedDaysTaken += days;
      } else if (h.status === "pending") {
        summary.pendingDays += days;
      }
    }

    for (const staffId of Object.keys(map)) {
      map[staffId].remaining = map[staffId].allowance - map[staffId].approvedDaysTaken;
    }

    return map;
  }, [staff, holidays, staffById]);

  const previewWorkingDays =
    startDate && endDate && endDate >= startDate
      ? countWorkingDaysInclusive(startDate, endDate)
      : 0;

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
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1>Staff Holidays</h1>

      {errorMsg && (
        <div style={errorStyle}>
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div style={successStyle}>
          {successMsg}
        </div>
      )}

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Add Holiday</h2>

        <p style={{ marginTop: 0, color: "#555" }}>
          Working days only are counted. Weekends are excluded automatically.
        </p>

        <form onSubmit={handleAddHoliday}>
          <div style={{ marginBottom: 12 }}>
            <label>
              Staff member:
              <br />
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                style={{ ...inputStyle, minWidth: 280 }}
              >
                <option value="">Select staff…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}{s.role ? ` (${s.role})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label>
              Start date:
              <br />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={inputStyle}
              />
            </label>

            <label>
              End date:
              <br />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ marginBottom: 12, color: "#444", fontSize: 14 }}>
            {previewWorkingDays > 0
              ? `This booking will use ${previewWorkingDays} working day${previewWorkingDays === 1 ? "" : "s"}.`
              : "Select a valid date range to see working days used."}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>
              Reason / notes (optional):
              <br />
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                style={{ ...inputStyle, width: "100%", minHeight: 90 }}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving || !subscriberId}
            style={primaryBtn}
          >
            {saving ? "Saving…" : "Add Holiday"}
          </button>
        </form>
      </section>

      <section style={{ ...cardStyle, marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>Leave Balances</h2>

        {loading ? (
          <div>Loading balances…</div>
        ) : staff.length === 0 ? (
          <div>No staff found yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 850 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Staff</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Holiday Year</th>
                  <th style={thStyle}>Allowance</th>
                  <th style={thStyle}>Approved Taken</th>
                  <th style={thStyle}>Pending</th>
                  <th style={thStyle}>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const summary = holidaySummariesByStaffId[s.id];
                  return (
                    <tr key={s.id}>
                      <td style={tdStyle}>{s.full_name}</td>
                      <td style={tdStyle}>{s.role || ""}</td>
                      <td style={tdStyle}>{summary?.yearLabel || ""}</td>
                      <td style={tdStyle}>{summary?.allowance ?? 28}</td>
                      <td style={tdStyle}>{summary?.approvedDaysTaken ?? 0}</td>
                      <td style={tdStyle}>{summary?.pendingDays ?? 0}</td>
                      <td style={tdStyle}>
                        <strong>{summary?.remaining ?? 28}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
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
                minWidth: 950,
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle}>Staff</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Start</th>
                  <th style={thStyle}>End</th>
                  <th style={thStyle}>Working Days</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Reason</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => {
                  const staffMember = staffById[h.staff_id];
                  const workingDays = countWorkingDaysInclusive(h.start_date, h.end_date);

                  return (
                    <tr key={h.id}>
                      <td style={tdStyle}>{staffMember?.full_name || "Unknown"}</td>
                      <td style={tdStyle}>{staffMember?.role || ""}</td>
                      <td style={tdStyle}>{formatDate(h.start_date)}</td>
                      <td style={tdStyle}>{formatDate(h.end_date)}</td>
                      <td style={tdStyle}>{workingDays}</td>
                      <td style={tdStyle}>{h.status}</td>
                      <td style={tdStyle}>{h.reason || ""}</td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => updateStatus(h.id, "approved")}
                          disabled={updatingId === h.id}
                          style={{ ...smallBtn, marginRight: 6 }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(h.id, "rejected")}
                          disabled={updatingId === h.id}
                          style={{ ...smallBtn, marginRight: 6 }}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(h.id, "cancelled")}
                          disabled={updatingId === h.id}
                          style={{ ...smallBtn, marginRight: 6 }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteHoliday(h.id)}
                          disabled={updatingId === h.id}
                          style={deleteBtn}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const cardStyle = {
  border: "1px solid #ddd",
  padding: 16,
  borderRadius: 4,
  background: "#fff",
};

const inputStyle = {
  padding: 8,
  borderRadius: 4,
  border: "1px solid #ccc",
};

const errorStyle = {
  backgroundColor: "#ffe5e5",
  color: "#b00020",
  padding: "10px 15px",
  marginBottom: 15,
  borderRadius: 4,
};

const successStyle = {
  backgroundColor: "#e5ffe9",
  color: "#1b5e20",
  padding: "10px 15px",
  marginBottom: 15,
  borderRadius: 4,
};

const primaryBtn = {
  padding: "10px 16px",
  borderRadius: 4,
  border: "none",
  background: "#111827",
  color: "#fff",
  cursor: "pointer",
};

const smallBtn = {
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontSize: 12,
};

const deleteBtn = {
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid #f5b3b3",
  background: "#ffe5e5",
  cursor: "pointer",
  fontSize: 12,
};

const thStyle = {
  borderBottom: "1px solid #ccc",
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 12,
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: "8px 10px",
  fontSize: 12,
  verticalAlign: "top",
};
