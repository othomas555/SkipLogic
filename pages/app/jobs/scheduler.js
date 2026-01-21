// pages/app/jobs/scheduler.js
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function SchedulerPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [jobs, setJobs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  const [columnLayout, setColumnLayout] = useState(null);

  // ---------------- LOAD DATA ----------------

  useEffect(() => {
    if (checking || !subscriberId) return;

    async function load() {
      setLoading(true);
      setErrorMsg("");

      const [{ data: custs }, { data: drvrs }, { data: jobRows, error }] =
        await Promise.all([
          supabase
            .from("customers")
            .select("id, first_name, last_name, company_name")
            .eq("subscriber_id", subscriberId),

          supabase
            .from("drivers")
            .select("id, name, callsign, is_active")
            .eq("subscriber_id", subscriberId)
            .eq("is_active", true)
            .order("name"),

          supabase
            .from("jobs")
            .select(`
              id,
              job_number,
              customer_id,
              job_status,
              scheduled_date,
              collection_date,
              delivery_actual_date,
              collection_actual_date,
              site_name,
              site_postcode,
              payment_type,
              assigned_driver_id
            `)
            .eq("subscriber_id", subscriberId)
            .or(
              `scheduled_date.eq.${selectedDate},collection_date.eq.${selectedDate}`
            ),
        ]);

      if (error) {
        console.error(error);
        setErrorMsg("Could not load jobs");
        setLoading(false);
        return;
      }

      setCustomers(custs || []);
      setDrivers(drvrs || []);
      setJobs(jobRows || []);

      const layout = { unassigned: {} };
      drvrs.forEach((d) => (layout[d.id] = []));

      // Split unassigned into deliveries / collections
      layout.unassigned.deliveries = [];
      layout.unassigned.collections = [];

      jobRows.forEach((j) => {
        if (j.assigned_driver_id && layout[j.assigned_driver_id]) {
          layout[j.assigned_driver_id].push(j.id);
          return;
        }

        const isDelivery =
          j.scheduled_date === selectedDate &&
          !j.delivery_actual_date &&
          j.job_status === "booked";

        const isCollection =
          j.collection_date === selectedDate &&
          j.delivery_actual_date &&
          !j.collection_actual_date;

        if (isDelivery) layout.unassigned.deliveries.push(j.id);
        if (isCollection) layout.unassigned.collections.push(j.id);
      });

      setColumnLayout(layout);
      setLoading(false);
    }

    load();
  }, [checking, subscriberId, selectedDate]);

  // ---------------- HELPERS ----------------

  function findJob(id) {
    return jobs.find((j) => j.id === id);
  }

  function customerName(id) {
    const c = customers.find((x) => x.id === id);
    if (!c) return "Unknown";
    return c.company_name
      ? c.company_name
      : `${c.first_name || ""} ${c.last_name || ""}`.trim();
  }

  function canAssign(job) {
    if (!job) return false;

    if (
      job.scheduled_date === selectedDate &&
      !job.delivery_actual_date &&
      job.job_status === "booked"
    )
      return true;

    if (
      job.collection_date === selectedDate &&
      job.delivery_actual_date &&
      !job.collection_actual_date
    )
      return true;

    return false;
  }

  // ---------------- DRAG / DROP ----------------

  function onDragStart(e, jobId) {
    e.dataTransfer.setData("jobId", jobId);
  }

  async function moveJob(jobId, driverId) {
    const job = findJob(jobId);

    if (!canAssign(job)) {
      setErrorMsg(
        "This job cannot be assigned due to its current status."
      );
      return;
    }

    setColumnLayout((prev) => {
      const next = structuredClone(prev);
      Object.keys(next).forEach((k) => {
        if (Array.isArray(next[k])) {
          next[k] = next[k].filter((id) => id !== jobId);
        }
      });

      if (driverId) next[driverId].push(jobId);
      else {
        if (job.scheduled_date === selectedDate)
          next.unassigned.deliveries.push(jobId);
        if (job.collection_date === selectedDate)
          next.unassigned.collections.push(jobId);
      }
      return next;
    });

    await supabase
      .from("jobs")
      .update({ assigned_driver_id: driverId })
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId);
  }

  // ---------------- RENDER ----------------

  if (loading || !columnLayout) {
    return <p style={{ padding: 24 }}>Loading scheduler…</p>;
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Skip hire scheduler</h1>

      <label>
        Date{" "}
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </label>

      {(authError || errorMsg) && (
        <p style={{ color: "red" }}>{authError || errorMsg}</p>
      )}

      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {/* UNASSIGNED */}
        <div style={{ width: 280 }}>
          <h3>Unassigned – Deliveries</h3>
          {columnLayout.unassigned.deliveries.map((id) => {
            const j = findJob(id);
            return (
              <JobCard
                key={id}
                job={j}
                customer={customerName(j.customer_id)}
                onDragStart={onDragStart}
              />
            );
          })}

          <h3 style={{ marginTop: 16 }}>Unassigned – Collections</h3>
          {columnLayout.unassigned.collections.map((id) => {
            const j = findJob(id);
            return (
              <JobCard
                key={id}
                job={j}
                customer={customerName(j.customer_id)}
                onDragStart={onDragStart}
              />
            );
          })}
        </div>

        {/* DRIVERS */}
        {drivers.map((d) => (
          <div
            key={d.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const jobId = e.dataTransfer.getData("jobId");
              if (jobId) moveJob(jobId, d.id);
            }}
            style={{
              minWidth: 260,
              border: "1px solid #ccc",
              padding: 8,
            }}
          >
            <h3>{d.callsign || d.name}</h3>
            {(columnLayout[d.id] || []).map((jobId) => {
              const j = findJob(jobId);
              return (
                <JobCard
                  key={jobId}
                  job={j}
                  customer={customerName(j.customer_id)}
                  onDragStart={onDragStart}
                />
              );
            })}
          </div>
        ))}
      </div>
    </main>
  );
}

function JobCard({ job, customer, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job.id)}
      style={{
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: 6,
        marginBottom: 6,
        background: "#fff",
        fontSize: 12,
        cursor: "grab",
      }}
    >
      <strong>{job.job_number}</strong>
      <div>{customer}</div>
      <div style={{ color: "#666" }}>
        {job.site_name || job.site_postcode}
      </div>
    </div>
  );
}
