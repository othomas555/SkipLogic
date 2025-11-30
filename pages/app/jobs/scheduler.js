// pages/app/jobs/scheduler.js
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function SchedulerPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [drivers, setDrivers] = useState([]); // 🔹 now loaded from Supabase
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // 🔹 Map of driverId -> true if that driver is on holiday for selectedDate
  const [holidaysByDriverId, setHolidaysByDriverId] = useState({});

  // Selected date for planning (the day you're looking at)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10); // yyyy-mm-dd
  });

  // Date to roll unassigned jobs to
  const [rolloverDate, setRolloverDate] = useState(() => {
    const today = new Date();
    // default: tomorrow
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 10);
  });

  const [movingUnassigned, setMovingUnassigned] = useState(false);

  /**
   * Column layout:
   * {
   *   unassigned: [jobId, jobId, ...],
   *   "<driver-uuid>": [jobId, "break:123", jobId, ...],
   *   ...
   * }
   *
   * "break:xxxx" entries represent "Return to yard" markers (run breaks).
   */
  const [columnLayout, setColumnLayout] = useState(null);

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;

    async function loadData() {
      setErrorMsg("");
      setLoading(true);

      // 1) Customers (for labels)
      const { data: customerData, error: customersError } = await supabase
        .from("customers")
        .select("id, first_name, last_name, company_name")
        .eq("subscriber_id", subscriberId)
        .order("last_name", { ascending: true });

      if (customersError) {
        console.error("Customers error:", customersError);
        setErrorMsg("Could not load customers.");
        setLoading(false);
        return;
      }
      setCustomers(customerData || []);

      // 2) Drivers (active for this subscriber)
      //    ⚠️ includes staff_id so we can map to staff_holidays.staff_id
      const { data: driverData, error: driversError } = await supabase
        .from("drivers")
        .select("id, name, callsign, is_active, staff_id")
        .eq("subscriber_id", subscriberId)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (driversError) {
        console.error("Drivers error:", driversError);
        setErrorMsg("Could not load drivers.");
        setLoading(false);
        return;
      }
      const activeDrivers = driverData || [];
      setDrivers(activeDrivers);

      // 3) Holidays – approved and covering selectedDate
      //    Uses staff_holidays.staff_id and maps to driver.staff_id
      const dateStr = selectedDate; // already yyyy-mm-dd

      try {
        const { data: holidayRows, error: holidaysError } = await supabase
          .from("staff_holidays")
          .select("staff_id, start_date, end_date, status")
          .eq("subscriber_id", subscriberId)
          .eq("status", "approved")
          .lte("start_date", dateStr)
          .gte("end_date", dateStr);

        if (holidaysError) {
          console.error("Holidays error:", holidaysError);
          setHolidaysByDriverId({});
        } else {
          const staffHolidayMap = {};
          (holidayRows || []).forEach((h) => {
            staffHolidayMap[h.staff_id] = true;
          });

          const driverHolidayMap = {};
          activeDrivers.forEach((d) => {
            if (d.staff_id && staffHolidayMap[d.staff_id]) {
              driverHolidayMap[d.id] = true;
            }
          });

          setHolidaysByDriverId(driverHolidayMap);
        }
      } catch (err) {
        console.error("Unexpected holidays error:", err);
        setHolidaysByDriverId({});
      }

      // 4) Jobs – deliveries OR collections on selectedDate
      const { data: jobData, error: jobsError } = await supabase
        .from("jobs")
        .select(
          `
          id,
          job_number,
          customer_id,
          job_status,
          scheduled_date,
          collection_date,
          site_name,
          site_postcode,
          payment_type,
          assigned_driver_id
        `
        )
        .eq("subscriber_id", subscriberId)
        .or(
          `scheduled_date.eq.${selectedDate},collection_date.eq.${selectedDate}`
        )
        .order("created_at", { ascending: true });

      if (jobsError) {
        console.error("Jobs error:", jobsError);
        setErrorMsg("Could not load jobs.");
        setLoading(false);
        return;
      }

      const list = jobData || [];
      setJobs(list);

      // Initialise column layout:
      // - each driver gets an empty column
      // - jobs with assigned_driver_id go to that driver
      // - everything else goes to "unassigned"
      const initialLayout = {
        unassigned: [],
      };

      activeDrivers.forEach((d) => {
        initialLayout[d.id] = [];
      });

      for (const job of list) {
        if (job.assigned_driver_id && initialLayout[job.assigned_driver_id]) {
          initialLayout[job.assigned_driver_id].push(job.id);
        } else {
          initialLayout.unassigned.push(job.id);
        }
      }

      setColumnLayout(initialLayout);
      setLoading(false);
    }

    loadData();
  }, [checking, subscriberId, selectedDate]);

  function findCustomerNameById(customerId) {
    const c = customers.find((cust) => cust.id === customerId);
    if (!c) return "Unknown customer";
    const baseName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (c.company_name) {
      return `${c.company_name} – ${baseName || "Unknown contact"}`;
    }
    return baseName || "Unknown customer";
  }

  function formatJobStatus(status) {
    switch (status) {
      case "booked":
        return "Booked";
      case "on_hire":
        return "On hire";
      case "awaiting_collection":
        return "Awaiting collection";
      case "collected":
        return "Collected";
      default:
        return status || "Unknown";
    }
  }

  function getJobTypeForDay(job) {
    const isDelivery = job.scheduled_date === selectedDate;
    const isCollection = job.collection_date === selectedDate;

    if (isDelivery && isCollection) return "Delivery & Collection";
    if (isDelivery) return "Delivery";
    if (isCollection) return "Collection";
    return "Other";
  }

  function getJobTypeColor(job) {
    const type = getJobTypeForDay(job);
    if (type === "Delivery") return "#0070f3";
    if (type === "Collection") return "#fa8c16";
    if (type === "Delivery & Collection") return "#722ed1";
    return "#595959";
  }

  function findJobById(jobId) {
    return jobs.find((j) => j.id === jobId) || null;
  }

  function isDriverOnHoliday(driverId) {
    return !!holidaysByDriverId[driverId];
  }

  if (checking || loading || !columnLayout) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p>Loading scheduler…</p>
      </main>
    );
  }

  const jobsForDay = jobs; // already filtered by date in query

  const unassignedJobs = (columnLayout.unassigned || [])
    .map((id) => findJobById(id))
    .filter(Boolean);

  function itemsForDriver(driverId) {
    return columnLayout[driverId] || [];
  }

  // Drag handlers
  function handleDragStart(e, jobId) {
    e.dataTransfer.setData("text/plain", jobId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function moveJobToColumn(jobId, targetColumnId) {
    // 1) Update UI immediately
    setColumnLayout((prev) => {
      if (!prev) return prev;
      const next = { ...prev };

      const allColumnIds = ["unassigned", ...drivers.map((d) => d.id)];

      // remove job from all columns
      allColumnIds.forEach((colId) => {
        const col = next[colId] || [];
        next[colId] = col.filter((item) => item !== jobId);
      });

      // append to target column
      if (!next[targetColumnId]) next[targetColumnId] = [];
      next[targetColumnId] = [...next[targetColumnId], jobId];

      return next;
    });

    // 2) Work out new assigned_driver_id
    let newAssignedDriverId = null;
    if (targetColumnId !== "unassigned") {
      newAssignedDriverId = targetColumnId;
    }

    // 3) Save to Supabase
    const { error } = await supabase
      .from("jobs")
      .update({ assigned_driver_id: newAssignedDriverId })
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId);

    if (error) {
      console.error("Error saving driver assignment", error);
      setErrorMsg(
        "Could not save driver assignment for one job. Check console for details."
      );
    }
  }

  function handleDropOnUnassigned(e) {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("text/plain");
    if (!jobId) return;
    moveJobToColumn(jobId, "unassigned");
  }

  function handleDropOnDriver(e, driverId) {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("text/plain");
    if (!jobId) return;
    moveJobToColumn(jobId, driverId);
    // 🔜 Later: persist run info to Supabase
  }

  // Add a "Return to yard" break (run separator) at the end of a driver column
  function handleAddBreak(driverId) {
    setColumnLayout((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const key =
        "break:" +
        Date.now().toString(36) +
        ":" +
        Math.random().toString(36).slice(2, 8);

      if (!next[driverId]) next[driverId] = [];
      next[driverId] = [...next[driverId], key];
      return next;
    });
  }

  // Remove a specific break marker from a driver column
  function handleRemoveBreak(driverId, breakKey) {
    setColumnLayout((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const col = next[driverId] || [];
      next[driverId] = col.filter((item) => item !== breakKey);
      return next;
    });
  }

  // Move all unassigned jobs to rolloverDate (update their dates in Supabase)
  async function handleMoveUnassigned() {
    if (!rolloverDate) {
      setErrorMsg("Please choose a date to move unassigned jobs to.");
      return;
    }

    if (rolloverDate === selectedDate) {
      setErrorMsg("The new date must be different from the current day.");
      return;
    }

    if (unassignedJobs.length === 0) {
      setErrorMsg("There are no unassigned jobs to move.");
      return;
    }

    setMovingUnassigned(true);
    setErrorMsg("");

    for (const job of unassignedJobs) {
      const updates = {};

      // If this job is a delivery on the selected day, move that delivery date
      if (job.scheduled_date === selectedDate) {
        updates.scheduled_date = rolloverDate;
      }

      // If this job is a collection on the selected day, move that collection date
      if (job.collection_date === selectedDate) {
        updates.collection_date = rolloverDate;
      }

      if (Object.keys(updates).length === 0) {
        continue;
      }

      const { error } = await supabase
        .from("jobs")
        .update(updates)
        .eq("id", job.id)
        .eq("subscriber_id", subscriberId);

      if (error) {
        console.error("Error moving job", job.id, error);
        setErrorMsg(
          "Could not move one or more unassigned jobs. Check logs for details."
        );
        // keep going with others
      }
    }

    setMovingUnassigned(false);

    // After moving, jump the planner to the new date.
    setSelectedDate(rolloverDate);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Skip hire scheduler</h1>
          {user?.email && (
            <p style={{ fontSize: 14, color: "#555" }}>
              Signed in as {user.email}
            </p>
          )}
          <p style={{ marginTop: 8 }}>
            <a href="/app/jobs" style={{ fontSize: 14 }}>
              ← Back to jobs list
            </a>
          </p>
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 14,
              marginBottom: 4,
            }}
          >
            Day to plan
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: 8,
              borderRadius: 4,
              border: "1px solid " +
                "#ccc",
            }}
          />
        </div>
      </header>

      {(authError || errorMsg) && (
        <p style={{ color: "red", marginBottom: 16 }}>
          {authError || errorMsg}
        </p>
      )}

      {/* 🔹 Banner if any drivers are on holiday for this day */}
      {Object.keys(holidaysByDriverId).length > 0 && (
        <div
          style={{
            backgroundColor: "#fff8e1",
            border: "1px solid #ffe082",
            padding: "8px 12px",
            borderRadius: 4,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          <strong>Heads up:</strong> one or more drivers are on holiday for{" "}
          {selectedDate}. They’re shown in red and cannot be assigned jobs for
          this day.
        </div>
      )}

      {jobsForDay.length === 0 ? (
        <p>No deliveries or collections for this date.</p>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          {/* Left: unassigned jobs */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDropOnUnassigned}
            style={{
              width: 280,
              minHeight: 200,
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 8,
              background: "#fafafa",
            }}
          >
            <h2
              style={{
                fontSize: 16,
                margin: 0,
                marginBottom: 8,
              }}
            >
              Unassigned jobs
            </h2>
            <p style={{ fontSize: 12, color: "#666", marginTop: 0 }}>
              Deliveries & collections for {selectedDate}
            </p>

            {/* Move unassigned jobs control */}
            <div
              style={{
                marginTop: 8,
                marginBottom: 12,
                paddingTop: 8,
                borderTop: "1px solid #e5e5e5",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  marginBottom: 4,
                }}
              >
                Move all unassigned jobs to date:
              </label>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <input
                  type="date"
                  value={rolloverDate}
                  onChange={(e) => setRolloverDate(e.target.value)}
                  style={{
                    padding: 6,
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    fontSize: 12,
                    flex: 1,
                  }}
                />
                <button
                  type="button"
                  onClick={handleMoveUnassigned}
                  disabled={movingUnassigned || unassignedJobs.length === 0}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid #999",
                    background: movingUnassigned ? "#ddd" : "#f5f5f5",
                    fontSize: 11,
                    cursor:
                      movingUnassigned || unassignedJobs.length === 0
                        ? "default"
                        : "pointer",
                  }}
                >
                  {movingUnassigned ? "Moving…" : "Move unassigned"}
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#777" }}>
                Useful if you need to roll collections or deliveries to another
                day.
              </div>
            </div>

            {unassignedJobs.length === 0 ? (
              <p style={{ fontSize: 12, color: "#999" }}>
                All jobs assigned to drivers.
              </p>
            ) : (
              unassignedJobs.map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  selectedDate={selectedDate}
                  customerName={findCustomerNameById(j.customer_id)}
                  formatJobStatus={formatJobStatus}
                  getJobTypeForDay={getJobTypeForDay}
                  getJobTypeColor={getJobTypeColor}
                  onDragStart={handleDragStart}
                />
              ))
            )}
          </div>

          {/* Driver columns */}
          <div
            style={{
              display: "flex",
              gap: 12,
              flex: 1,
              overflowX: "auto",
            }}
          >
            {drivers.length === 0 ? (
              <div style={{ padding: 8, fontSize: 12, color: "#777" }}>
                No active drivers found. Add drivers on the{" "}
                <a href="/app/drivers">Drivers page</a> and refresh this
                scheduler.
              </div>
            ) : (
              drivers.map((driver) => {
                const items = itemsForDriver(driver.id);
                const driverLabel = driver.callsign || driver.name;
                const onHoliday = isDriverOnHoliday(driver.id);

                return (
                  <div
                    key={driver.id}
                    onDragOver={handleDragOver}
                    onDrop={(e) => {
                      if (onHoliday) {
                        e.preventDefault();
                        return;
                      }
                      handleDropOnDriver(e, driver.id);
                    }}
                    style={{
                      minWidth: 260,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      padding: 8,
                      background: onHoliday ? "#fff4f4" : "#fff",
                      opacity: onHoliday ? 0.5 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <h2
                        style={{
                          fontSize: 16,
                          margin: 0,
                          marginBottom: 4,
                        }}
                      >
                        {driverLabel}
                      </h2>
                      {onHoliday && (
                        <span
                          style={{
                            backgroundColor: "#ffcccc",
                            color: "#b00020",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          On holiday
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: "#666", marginTop: 0 }}>
                      {onHoliday
                        ? "This driver is on holiday today."
                        : "Drag jobs here to assign to this driver."}
                      {!onHoliday && (
                        <>
                          <br />
                          Add breaks to indicate returns to yard.
                        </>
                      )}
                    </p>

                    <button
                      type="button"
                      onClick={() => handleAddBreak(driver.id)}
                      disabled={onHoliday}
                      style={{
                        marginTop: 4,
                        marginBottom: 8,
                        padding: "4px 8px",
                        borderRadius: 4,
                        border: "1px solid #999",
                        background: onHoliday ? "#eee" : "#f5f5f5",
                        fontSize: 11,
                        cursor: onHoliday ? "default" : "pointer",
                      }}
                    >
                      + Add yard break (new run)
                    </button>

                    {items.length === 0 ? (
                      <p
                        style={{ fontSize: 12, color: "#999", marginTop: 8 }}
                      >
                        No jobs assigned.
                      </p>
                    ) : (
                      items.map((itemKey) => {
                        // Break marker
                        if (
                          typeof itemKey === "string" &&
                          itemKey.startsWith("break:")
                        ) {
                          return (
                            <div
                              key={itemKey}
                              style={{
                                margin: "8px 0",
                                padding: "4px 6px",
                                borderTop: "1px dashed #bbb",
                                borderBottom: "1px dashed #bbb",
                                fontSize: 11,
                                color: "#555",
                                background: "#fafafa",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <span>Return to yard / Start new run</span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveBreak(driver.id, itemKey)
                                }
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  fontSize: 12,
                                  color: "#999",
                                }}
                                title="Remove this break"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        }

                        const job = findJobById(itemKey);
                        if (!job) return null;

                        return (
                          <JobCard
                            key={job.id}
                            job={job}
                            selectedDate={selectedDate}
                            customerName={findCustomerNameById(job.customer_id)}
                            formatJobStatus={formatJobStatus}
                            getJobTypeForDay={getJobTypeForDay}
                            getJobTypeColor={getJobTypeColor}
                            onDragStart={handleDragStart}
                          />
                        );
                      })
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// Small reusable card component for jobs in the scheduler
function JobCard({
  job,
  selectedDate,
  customerName,
  formatJobStatus,
  getJobTypeForDay,
  getJobTypeColor,
  onDragStart,
}) {
  const type = getJobTypeForDay(job);
  const typeColor = getJobTypeColor(job);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job.id)}
      style={{
        padding: 8,
        marginBottom: 8,
        borderRadius: 6,
        border: "1px solid #ddd",
        background: "#fff",
        cursor: "grab",
        fontSize: 12,
      }}
    >
      <div
        style={{
          marginBottom: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          {job.job_number || job.id}
        </span>
        <span
          style={{
            display: "inline-block",
            padding: "2px 6px",
            borderRadius: 999,
            fontSize: 10,
            background: typeColor,
            color: "#fff",
          }}
        >
          {type}
        </span>
      </div>
      <div style={{ marginBottom: 2 }}>{customerName}</div>
      <div style={{ marginBottom: 2, color: "#555" }}>
        {job.site_name
          ? `${job.site_name}, ${job.site_postcode || ""}`
          : job.site_postcode || ""}
      </div>
      <div style={{ marginBottom: 2, color: "#777" }}>
        Status: {formatJobStatus(job.job_status)}
      </div>
      <div style={{ marginBottom: 4, color: "#777" }}>
        Payment: {job.payment_type || "Unknown"}
      </div>
      <a
        href={`/app/jobs/${job.id}`}
        style={{ fontSize: 11, textDecoration: "underline" }}
      >
        View / Edit job
      </a>
    </div>
  );
}
