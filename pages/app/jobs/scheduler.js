// pages/app/jobs/scheduler.js
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function SchedulerPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // Selected date for planning
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10); // yyyy-mm-dd
  });

  // Simple local driver list for now (later: load from Supabase drivers table)
  const drivers = [
    { id: "driver-a", name: "Driver A" },
    { id: "driver-b", name: "Driver B" },
    { id: "driver-c", name: "Driver C" },
  ];

  // jobId -> driverId (or undefined for unassigned)
  const [jobAssignments, setJobAssignments] = useState({});

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

      // 2) Jobs – deliveries OR collections on selectedDate
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
          payment_type
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

      setJobs(jobData || []);

      // Reset assignments each time date changes
      const initialAssignments = {};
      (jobData || []).forEach((j) => {
        initialAssignments[j.id] = undefined;
      });
      setJobAssignments(initialAssignments);

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

  // Just the jobs that are relevant for the selected date
  const jobsForDay = jobs;

  const unassignedJobs = jobsForDay.filter(
    (j) => !jobAssignments[j.id]
  );

  function jobsForDriver(driverId) {
    return jobsForDay.filter((j) => jobAssignments[j.id] === driverId);
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

  // Drag handlers
  function handleDragStart(e, jobId) {
    e.dataTransfer.setData("text/plain", jobId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDropOnUnassigned(e) {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("text/plain");
    if (!jobId) return;
    setJobAssignments((prev) => {
      const next = { ...prev };
      next[jobId] = undefined;
      return next;
    });
  }

  function handleDropOnDriver(e, driverId) {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("text/plain");
    if (!jobId) return;
    setJobAssignments((prev) => ({
      ...prev,
      [jobId]: driverId,
    }));

    // 🔜 Later: persist to Supabase (assigned_driver_id, route_id etc.)
    // For now this is purely a front-end planning board.
  }

  if (checking || loading) {
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
              border: "1px solid #ccc",
            }}
          />
        </div>
      </header>

      {(authError || errorMsg) && (
        <p style={{ color: "red", marginBottom: 16 }}>
          {authError || errorMsg}
        </p>
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
            {drivers.map((driver) => (
              <div
                key={driver.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnDriver(e, driver.id)}
                style={{
                  minWidth: 260,
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 8,
                  background: "#fff",
                }}
              >
                <h2
                  style={{
                    fontSize: 16,
                    margin: 0,
                    marginBottom: 8,
                  }}
                >
                  {driver.name}
                </h2>
                <p style={{ fontSize: 12, color: "#666", marginTop: 0 }}>
                  Drag jobs here to assign to this driver.
                </p>

                {jobsForDriver(driver.id).length === 0 ? (
                  <p style={{ fontSize: 12, color: "#999" }}>
                    No jobs assigned.
                  </p>
                ) : (
                  jobsForDriver(driver.id).map((j) => (
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
            ))}
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
