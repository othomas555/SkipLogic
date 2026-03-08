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

function toYmd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(ymd) {
  const dt = parseYmd(ymd);
  if (!dt) return ymd || "";
  return dt.toLocaleDateString("en-GB");
}

function formatMonthDay(ymd) {
  const dt = parseYmd(ymd);
  if (!dt) return "";
  return dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
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
      startRuleLabel: "1 January each year",
      currentWindowLabel: `${year}-01-01 to ${year}-12-31`,
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

  return {
    start: toYmd(rangeStart),
    end: toYmd(rangeEnd),
    startRuleLabel: `${formatMonthDay(holidayStart)} each year`,
    currentWindowLabel: `${formatDate(toYmd(rangeStart))} to ${formatDate(toYmd(rangeEnd))}`,
  };
}

function getOverlapWorkingDays(rangeStart, rangeEnd, holidayStart, holidayEnd) {
  if (!rangeStart || !rangeEnd || !holidayStart || !holidayEnd) return 0;
  if (holidayEnd < rangeStart || holidayStart > rangeEnd) return 0;

  const clippedStart = holidayStart < rangeStart ? rangeStart : holidayStart;
  const clippedEnd = holidayEnd > rangeEnd ? rangeEnd : holidayEnd;

  return countWorkingDaysInclusive(clippedStart, clippedEnd);
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
  const [selectedSummaryStaffId, setSelectedSummaryStaffId] = useState("all");

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

  const todayYmd = new Date().toISOString().slice(0, 10);

  const holidaySummariesByStaffId = useMemo(() => {
    const map = {};

    for (const s of staff) {
      const year = holidayYearRange(s, todayYmd);
      map[s.id] = {
        allowance: Number(s.annual_leave_allowance ?? 28) || 28,
        yearStart: year.start,
        yearEnd: year.end,
        leaveYearStartsLabel: year.startRuleLabel,
        currentWindowLabel: year.currentWindowLabel,
        approvedDaysTaken: 0,
        pendingDays: 0,
        remaining: Number(s.annual_leave_allowance ?? 28) || 28,
        approvedBookings: [],
        pendingBookings: [],
        allBookingsInCurrentYear: [],
      };
    }

    for (const h of holidays) {
      const staffMember = staffById[h.staff_id];
      if (!staffMember) continue;

      const summary = map[h.staff_id];
      if (!summary) continue;

      const days = getOverlapWorkingDays(
        summary.yearStart,
        summary.yearEnd,
        h.start_date,
        h.end_date
      );

      if (days <= 0) continue;

      const booking = {
        id: h.id,
        start_date: h.start_date,
        end_date: h.end_date,
        status: h.status,
        reason: h.reason || "",
        workingDays: days,
        label: `${formatDate(h.start_date)} to ${formatDate(h.end_date)} (${days} day${days === 1 ? "" : "s"})`,
      };

      summary.allBookingsInCurrentYear.push(booking);

      if (h.status === "approved") {
        summary.approvedDaysTaken += days;
        summary.approvedBookings.push(booking);
      } else if (h.status === "pending") {
        summary.pendingDays += days;
        summary.pendingBookings.push(booking);
      }
    }

    for (const staffId of Object.keys(map)) {
      map[staffId].remaining = map[staffId].allowance - map[staffId].approvedDaysTaken;
      map[staffId].approvedBookings.sort((a, b) => a.start_date.localeCompare(b.start_date));
      map[staffId].pendingBookings.sort((a, b) => a.start_date.localeCompare(b.start_date));
      map[staffId].allBookingsInCurrentYear.sort((a, b) => a.start_date.localeCompare(b.start_date));
    }

    return map;
  }, [staff, holidays, staffById, todayYmd]);

  const previewWorkingDays =
    startDate && endDate && endDate >= startDate
      ? countWorkingDaysInclusive(startDate, endDate)
      : 0;

  const visibleStaffForSummary = useMemo(() => {
    if (selectedSummaryStaffId === "all") return staff;
    return staff.filter((s) => String(s.id) === String(selectedSummaryStaffId));
  }, [staff, selectedSummaryStaffId]);

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
    <div style={{ padding: 20, maxWidth: 1280, margin: "0 auto" }}>
      <h1>Staff Holidays</h1>

      {errorMsg && <div style={errorStyle}>{errorMsg}</div>}
      {successMsg && <div style={successStyle}>{successMsg}</div>}

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
                style={{ ...inputStyle, minWidth: 280, width: "100%" }}
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
        <div style={sectionHeaderRow}>
          <div>
            <h2 style={{ margin: 0 }}>Leave Balances</h2>
            <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>
              Shows the leave-year rule, the current leave-year window, and exactly which bookings make up the totals.
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, color: "#444" }}>
              View:
              <br />
              <select
                value={selectedSummaryStaffId}
                onChange={(e) => setSelectedSummaryStaffId(e.target.value)}
                style={{ ...inputStyle, minWidth: 220 }}
              >
                <option value="all">All staff</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <div>Loading balances…</div>
        ) : visibleStaffForSummary.length === 0 ? (
          <div>No staff found yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            {visibleStaffForSummary.map((s) => {
              const summary = holidaySummariesByStaffId[s.id];
              return (
                <div key={s.id} style={summaryCard}>
                  <div style={summaryTop}>
                    <div>
                      <div style={summaryName}>{s.full_name}</div>
                      <div style={summaryRole}>{s.role || "No role set"}</div>
                    </div>

                    <div style={totalsGrid}>
                      <div style={totalBox}>
                        <div style={totalLabel}>Allowance</div>
                        <div style={totalValue}>{summary?.allowance ?? 28}</div>
                      </div>
                      <div style={totalBox}>
                        <div style={totalLabel}>Approved Taken</div>
                        <div style={totalValue}>{summary?.approvedDaysTaken ?? 0}</div>
                      </div>
                      <div style={totalBox}>
                        <div style={totalLabel}>Pending</div>
                        <div style={totalValue}>{summary?.pendingDays ?? 0}</div>
                      </div>
                      <div style={totalBoxStrong}>
                        <div style={totalLabel}>Remaining</div>
                        <div style={totalValue}>{summary?.remaining ?? 28}</div>
                      </div>
                    </div>
                  </div>

                  <div style={detailsGrid}>
                    <div style={detailBox}>
                      <div style={detailLabel}>Leave year starts</div>
                      <div style={detailValue}>{summary?.leaveYearStartsLabel || "1 January each year"}</div>
                    </div>

                    <div style={detailBox}>
                      <div style={detailLabel}>Current leave year</div>
                      <div style={detailValue}>{summary?.currentWindowLabel || ""}</div>
                    </div>
                  </div>

                  <div style={bookingListsWrap}>
                    <div style={bookingListCard}>
                      <div style={bookingListTitle}>Approved bookings counted this year</div>
                      {summary?.approvedBookings?.length ? (
                        <div style={bookingList}>
                          {summary.approvedBookings.map((b) => (
                            <div key={b.id} style={bookingRow}>
                              <div>{b.label}</div>
                              {b.reason ? <div style={bookingReason}>{b.reason}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={emptyText}>No approved bookings in the current leave year.</div>
                      )}
                    </div>

                    <div style={bookingListCard}>
                      <div style={bookingListTitle}>Pending bookings in this year</div>
                      {summary?.pendingBookings?.length ? (
                        <div style={bookingList}>
                          {summary.pendingBookings.map((b) => (
                            <div key={b.id} style={bookingRow}>
                              <div>{b.label}</div>
                              {b.reason ? <div style={bookingReason}>{b.reason}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={emptyText}>No pending bookings in the current leave year.</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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

const sectionHeaderRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const summaryCard = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 16,
  background: "#fafafa",
};

const summaryTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const summaryName = {
  fontSize: 18,
  fontWeight: 800,
  color: "#111827",
};

const summaryRole = {
  marginTop: 4,
  fontSize: 13,
  color: "#6b7280",
};

const totalsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(110px, 1fr))",
  gap: 10,
  minWidth: 460,
};

const totalBox = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 10,
  background: "#fff",
};

const totalBoxStrong = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: 10,
  background: "#eef6ff",
};

const totalLabel = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#6b7280",
};

const totalValue = {
  marginTop: 6,
  fontSize: 22,
  fontWeight: 800,
  color: "#111827",
};

const detailsGrid = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
  gap: 10,
};

const detailBox = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  background: "#fff",
};

const detailLabel = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 6,
};

const detailValue = {
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
};

const bookingListsWrap = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(280px, 1fr))",
  gap: 12,
};

const bookingListCard = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  background: "#fff",
};

const bookingListTitle = {
  fontSize: 13,
  fontWeight: 700,
  color: "#111827",
  marginBottom: 10,
};

const bookingList = {
  display: "grid",
  gap: 8,
};

const bookingRow = {
  borderBottom: "1px solid #f1f5f9",
  paddingBottom: 8,
};

const bookingReason = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 4,
};

const emptyText = {
  fontSize: 13,
  color: "#6b7280",
};
