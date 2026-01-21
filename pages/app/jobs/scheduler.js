// pages/app/jobs/scheduler.js
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function SchedulerPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [skipTypeNameById, setSkipTypeNameById] = useState({});
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // Holidays: driverId -> true if that driver is on holiday for selectedDate
  const [holidaysByDriverId, setHolidaysByDriverId] = useState({});

  // Run timing params
  const [yardPostcode, setYardPostcode] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [preTripMinutes, setPreTripMinutes] = useState(30);
  const [serviceMinutesDelivery, setServiceMinutesDelivery] = useState(10);
  const [serviceMinutesCollection, setServiceMinutesCollection] = useState(10);
  const [serviceMinutesTipReturn, setServiceMinutesTipReturn] = useState(20);
  const [driverBreakMinutes, setDriverBreakMinutes] = useState(15);
  const [timingsByJobId, setTimingsByJobId] = useState({});

  // Travel time cache: "from|||to" -> minutes
  const [travelTimes, setTravelTimes] = useState({});

  // Selected date for planning (the day you're looking at)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10); // yyyy-mm-dd
  });

  // Date to roll unassigned jobs to
  const [rolloverDate, setRolloverDate] = useState(() => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 10);
  });

  const [movingUnassigned, setMovingUnassigned] = useState(false);

  /**
   * Column layout:
   * {
   *   unassigned: [jobId, jobId, ...],
   *   "<driver-uuid>": [jobId, "yardbreak:xxx", "driverbreak:yyy", jobId, ...],
   *   ...
   * }
   */
  const [columnLayout, setColumnLayout] = useState(null);

  // -------------------- ACTIONABLE JOB RULES --------------------

  function normStatus(s) {
    return String(s || "").trim().toLowerCase();
  }

  function getJobTypeForDay(job) {
    const isDelivery = job?.scheduled_date === selectedDate;
    const isCollection = job?.collection_date === selectedDate;

    if (isDelivery && isCollection) return "Delivery & Collection";
    if (isDelivery) return "Delivery";
    if (isCollection) return "Collection";
    return "Other";
  }

  // Delivery is only actionable if it’s scheduled today AND not already delivered/on-hire/collected/etc.
  function isDeliveryActionable(job) {
    if (!job || job.scheduled_date !== selectedDate) return false;
    const st = normStatus(job.job_status);

    // If it’s delivered, it should not appear as “unassigned delivery”.
    // on_hire + awaiting_collection also indicate the delivery has happened.
    const blocked = new Set([
      "delivered",
      "on_hire",
      "awaiting_collection",
      "collected",
      "completed",
      "cancelled",
      "canceled",
    ]);

    return !blocked.has(st);
  }

  // Collection is only actionable if it’s due today AND not already collected/completed/cancelled.
  function isCollectionActionable(job) {
    if (!job || job.collection_date !== selectedDate) return false;
    const st = normStatus(job.job_status);

    const blocked = new Set(["collected", "completed", "cancelled", "canceled"]);
    return !blocked.has(st);
  }

  function isJobActionableForSelectedDay(job) {
    // If both dates match, allow if either side is actionable.
    return isDeliveryActionable(job) || isCollectionActionable(job);
  }

  // -------------------- DATA LOADING --------------------

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;

    async function loadData() {
      setErrorMsg("");
      setLoading(true);

      // 1) Customers
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

      // 2) Drivers (include staff_id so we can map holidays)
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

      // 2b) Skip types (for display on job cards)
const { data: skipTypeRows, error: skipTypesError } = await supabase
  .from("skip_types")
  .select("id, name")
  .eq("subscriber_id", subscriberId)
  .order("name", { ascending: true });

if (skipTypesError) {
  console.error("Skip types error:", skipTypesError);
  setSkipTypeNameById({});
} else {
  const map = {};
  (skipTypeRows || []).forEach((r) => {
    map[r.id] = r.name;
  });
  setSkipTypeNameById(map);
}


      // 3) Holidays – approved and covering selectedDate
      const dateStr = selectedDate;
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
      // IMPORTANT: your pasted file had broken select syntax. It must be a string.
      const { data: jobData, error: jobsError } = await supabase
        .from("jobs")
        .select(
          "id, job_number, customer_id, job_status, scheduled_date,site_address_line1, skip_type_id, collection_date, site_name, site_postcode, payment_type, assigned_driver_id, created_at"
        )
        .eq("subscriber_id", subscriberId)
        .or(`scheduled_date.eq.${selectedDate},collection_date.eq.${selectedDate}`)
        .order("created_at", { ascending: true });

      if (jobsError) {
        console.error("Jobs error:", jobsError);
        setErrorMsg("Could not load jobs.");
        setLoading(false);
        return;
      }

      // Targeted fix: remove non-actionable (delivered/on_hire/collected/etc) from scheduler entirely
      const actionableList = (jobData || []).filter(isJobActionableForSelectedDay);

      setJobs(actionableList);

      // 5) Column layout: base it on assigned_driver_id
      const initialLayout = {
        unassigned: [],
      };

      activeDrivers.forEach((d) => {
        initialLayout[d.id] = [];
      });

      for (const job of actionableList) {
        if (job.assigned_driver_id && initialLayout[job.assigned_driver_id]) {
          initialLayout[job.assigned_driver_id].push(job.id);
        } else {
          initialLayout.unassigned.push(job.id);
        }
      }

      setColumnLayout(initialLayout);
      setLoading(false);

      // Clear timings & travel cache when day changes / data reloads
      setTimingsByJobId({});
      setTravelTimes({});
    }

    loadData();
  }, [checking, subscriberId, selectedDate]);

  // -------------------- HELPERS --------------------

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
    switch (normStatus(status)) {
      case "booked":
        return "Booked";
      case "on_hire":
        return "On hire";
      case "awaiting_collection":
        return "Awaiting collection";
      case "delivered":
        return "Delivered";
      case "collected":
        return "Collected";
      case "completed":
        return "Completed";
      case "cancelled":
      case "canceled":
        return "Cancelled";
      default:
        return status || "Unknown";
    }
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

  function parseStartDateTime(dateStr, timeStr) {
    try {
      const [hStr, mStr] = (timeStr || "08:00").split(":");
      const h = parseInt(hStr || "8", 10);
      const m = parseInt(mStr || "0", 10);
      const d = new Date(dateStr + "T00:00:00");
      d.setHours(h, m, 0, 0);
      return d;
    } catch {
      return new Date(dateStr + "T08:00:00");
    }
  }

  function addMinutes(dateObj, minutes) {
    return new Date(dateObj.getTime() + minutes * 60 * 1000);
  }

  function locationForJob(job) {
    // For now just postcode; later you can use full address
    return job.site_postcode || "";
  }

  function travelKey(from, to) {
    return `${from || "yard"}|||${to || "yard"}`;
  }

  function formatEta(etaIso) {
    if (!etaIso) return "";
    const d = new Date(etaIso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Build the unassigned jobs list from layout (defensive: only include jobs that exist)
  const unassignedJobs = useMemo(() => {
    return (columnLayout?.unassigned || []).map((id) => findJobById(id)).filter(Boolean);
  }, [columnLayout, jobs]);

  // Split unassigned into deliveries vs collections for the selected day
  const unassignedDeliveries = useMemo(() => {
    return unassignedJobs.filter((j) => {
      const t = getJobTypeForDay(j);
      return t === "Delivery" || t === "Delivery & Collection";
    });
  }, [unassignedJobs, selectedDate]);

  const unassignedCollections = useMemo(() => {
    return unassignedJobs.filter((j) => getJobTypeForDay(j) === "Collection");
  }, [unassignedJobs, selectedDate]);

  function itemsForDriver(driverId) {
    return columnLayout?.[driverId] || [];
  }

  // -------------------- GOOGLE DISTANCE MATRIX --------------------

  async function fetchMissingTravelTimes(pairsNeeded) {
    if (!pairsNeeded.length) return {};

    try {
      const resp = await fetch("/api/distance-matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: pairsNeeded }),
      });

      if (!resp.ok) {
        console.error("distance-matrix API error", resp.status);
        return {};
      }

      const data = await resp.json();
      return data.travelMinutes || {};
    } catch (err) {
      console.error("distance-matrix fetch error", err);
      return {};
    }
  }

  // -------------------- TIMING ENGINE --------------------
  // (continues in chunk 2)

  async function calculateTimings() {
    if (!columnLayout) return;

    const preTrip = Number(preTripMinutes) || 0;
    const svcDel = Number(serviceMinutesDelivery) || 0;
    const svcCol = Number(serviceMinutesCollection) || 0;
    const svcTip = Number(serviceMinutesTipReturn) || 0;
    const drvBreak = Number(driverBreakMinutes) || 0;

    // Fallbacks if Distance Matrix fails
    const fallbackFromYard = 20;
    const fallbackBetweenJobs = 15;
    const fallbackBackToYard = 20;

    const yardLoc = yardPostcode.trim() || "yard";

    // 1) Work out all movement segments we need travel times for
    const neededPairs = [];
    const seenKeys = new Set();

    drivers.forEach((driver) => {
      const items = columnLayout[driver.id] || [];
      if (!items.length) return;

      let currentLocation = yardLoc;

      items.forEach((itemKey) => {
        if (
          typeof itemKey === "string" &&
          (itemKey.startsWith("yardbreak:") || itemKey.startsWith("break:"))
        ) {
          // job -> yard movement
          if (currentLocation !== yardLoc) {
            const key = travelKey(currentLocation, yardLoc);
            if (!travelTimes[key] && !seenKeys.has(key)) {
              neededPairs.push({ key, from: currentLocation, to: yardLoc });
              seenKeys.add(key);
            }
          }
          currentLocation = yardLoc;
          return;
        }

        if (typeof itemKey === "string" && itemKey.startsWith("driverbreak:")) {
          // break, no movement
          return;
        }

        const job = findJobById(itemKey);
        if (!job) return;
        const jobLoc = locationForJob(job) || yardLoc;

        const key = travelKey(currentLocation, jobLoc);
        if (!travelTimes[key] && !seenKeys.has(key)) {
          neededPairs.push({ key, from: currentLocation, to: jobLoc });
          seenKeys.add(key);
        }

        currentLocation = jobLoc;
      });
    });

    // 2) Call backend for missing ones
    let newTravelTimes = {};
    if (neededPairs.length > 0) {
      const fetched = await fetchMissingTravelTimes(neededPairs);
      newTravelTimes = fetched;
      setTravelTimes((prev) => ({ ...prev, ...fetched }));
    }

    // helper to get travel minutes
    function getTravelMinutes(fromLoc, toLoc, direction) {
      const key = travelKey(fromLoc, toLoc);
      const cached =
        newTravelTimes[key] !== undefined ? newTravelTimes[key] : travelTimes[key];

      if (cached !== undefined) return cached;

      // fallback if API had no answer
      if (direction === "yard->job") return fallbackFromYard;
      if (direction === "job->yard") return fallbackBackToYard;
      return fallbackBetweenJobs;
    }

    // 3) Walk each driver route and assign ETAs
    const timings = {};

    drivers.forEach((driver) => {
      const items = columnLayout[driver.id] || [];
      if (!items.length) return;

      let currentTime = parseStartDateTime(selectedDate, startTime);
      let preTripApplied = false;
      let currentLocation = yardLoc;

      items.forEach((itemKey) => {
        // Yard break / tip return
        if (
          typeof itemKey === "string" &&
          (itemKey.startsWith("yardbreak:") || itemKey.startsWith("break:"))
        ) {
          if (!preTripApplied) {
            currentTime = addMinutes(currentTime, preTrip);
            preTripApplied = true;
          }

          if (currentLocation !== yardLoc) {
            const mins = getTravelMinutes(currentLocation, yardLoc, "job->yard");
            currentTime = addMinutes(currentTime, mins);
          }

          // tip time
          currentTime = addMinutes(currentTime, svcTip);
          currentLocation = yardLoc;
          return;
        }

        // Driver break
        if (typeof itemKey === "string" && itemKey.startsWith("driverbreak:")) {
          if (!preTripApplied) {
            currentTime = addMinutes(currentTime, preTrip);
            preTripApplied = true;
          }
          currentTime = addMinutes(currentTime, drvBreak);
          return;
        }

        // Job
        const job = findJobById(itemKey);
        if (!job) return;

        const jobLoc = locationForJob(job) || yardLoc;

        if (!preTripApplied) {
          currentTime = addMinutes(currentTime, preTrip);
          preTripApplied = true;
        }

        // Travel time
        let direction = "between";
        if (currentLocation === yardLoc) direction = "yard->job";
        const mins = getTravelMinutes(currentLocation, jobLoc, direction);
        currentTime = addMinutes(currentTime, mins);

        // ETA
        const eta = new Date(currentTime);
        timings[job.id] = { eta: eta.toISOString() };

        // Service time
        const type = getJobTypeForDay(job);
        let svc = 0;
        if (type === "Delivery") svc = svcDel;
        else if (type === "Collection") svc = svcCol;
        else if (type === "Delivery & Collection") svc = svcDel + svcCol;
        else svc = Math.max(svcDel, svcCol);

        currentTime = addMinutes(currentTime, svc);
        currentLocation = jobLoc;
      });
    });

    setTimingsByJobId(timings);
  }

  // (rest continues in chunk 2)
  // -------------------- DRAG & BREAK HANDLERS --------------------

  function handleDragStart(e, jobId) {
    const job = findJobById(jobId);
    if (!job) {
      e.preventDefault();
      return;
    }

    // Safety: never allow dragging jobs that are not actionable for this day
    if (!isJobActionableForSelectedDay(job)) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData("text/plain", jobId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function moveJobToColumn(jobId, targetColumnId) {
    const job = findJobById(jobId);
    if (!job) return;

    // Safety: never persist an assignment for a non-actionable job
    if (!isJobActionableForSelectedDay(job)) {
      setErrorMsg("That job is not actionable for this day, so it can’t be assigned.");
      return;
    }

    setColumnLayout((prev) => {
      if (!prev) return prev;
      const next = { ...prev };

      const allColumnIds = ["unassigned", ...drivers.map((d) => d.id)];

      allColumnIds.forEach((colId) => {
        const col = next[colId] || [];
        next[colId] = col.filter((item) => item !== jobId);
      });

      if (!next[targetColumnId]) next[targetColumnId] = [];
      next[targetColumnId] = [...next[targetColumnId], jobId];

      return next;
    });

    let newAssignedDriverId = null;
    if (targetColumnId !== "unassigned") {
      newAssignedDriverId = targetColumnId;
    }

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

    // Layout changed → timings invalid
    setTimingsByJobId({});
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
  }

  function handleAddYardBreak(driverId) {
    setColumnLayout((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const key =
        "yardbreak:" +
        Date.now().toString(36) +
        ":" +
        Math.random().toString(36).slice(2, 8);

      if (!next[driverId]) next[driverId] = [];
      next[driverId] = [...next[driverId], key];
      return next;
    });
    setTimingsByJobId({});
  }

  function handleAddDriverBreak(driverId) {
    setColumnLayout((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const key =
        "driverbreak:" +
        Date.now().toString(36) +
        ":" +
        Math.random().toString(36).slice(2, 8);

      if (!next[driverId]) next[driverId] = [];
      next[driverId] = [...next[driverId], key];
      return next;
    });
    setTimingsByJobId({});
  }

  function handleRemoveBreak(driverId, breakKey) {
    setColumnLayout((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const col = next[driverId] || [];
      next[driverId] = col.filter((item) => item !== breakKey);
      return next;
    });
    setTimingsByJobId({});
  }

  // Move all unassigned jobs to rolloverDate
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

      if (job.scheduled_date === selectedDate) {
        updates.scheduled_date = rolloverDate;
      }

      if (job.collection_date === selectedDate) {
        updates.collection_date = rolloverDate;
      }

      if (Object.keys(updates).length === 0) continue;

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
      }
    }

    setMovingUnassigned(false);
    setSelectedDate(rolloverDate);
  }

  // -------------------- RENDER --------------------

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

  const jobsForDay = jobs;

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
            <p style={{ fontSize: 14, color: "#555" }}>Signed in as {user.email}</p>
          )}
          <p style={{ marginTop: 8 }}>
            <a href="/app/jobs" style={{ fontSize: 14 }}>
              ← Back to jobs list
            </a>
          </p>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>
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
        <p style={{ color: "red", marginBottom: 16 }}>{authError || errorMsg}</p>
      )}

      {/* Holiday banner */}
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
          {selectedDate}. They’re shown in red and cannot be assigned jobs for this day.
        </div>
      )}

      {/* Run timing controls */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          fontSize: 13,
          background: "#fafafa",
        }}
      >
        <h2 style={{ fontSize: 16, margin: 0, marginBottom: 8 }}>
          Run timing settings
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
          <div>
            <label style={{ display: "block", marginBottom: 2 }}>Yard postcode</label>
            <input
              type="text"
              value={yardPostcode}
              onChange={(e) => setYardPostcode(e.target.value)}
              placeholder="CFxx xxx"
              style={{ padding: 6, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 2 }}>
              Start time (leave yard)
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{ padding: 6, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 2 }}>
              Pre-trip mins (checks + loading)
            </label>
            <input
              type="number"
              value={preTripMinutes}
              onChange={(e) => setPreTripMinutes(e.target.value)}
              style={{ width: 70, padding: 6, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 2 }}>
              Delivery mins on site
            </label>
            <input
              type="number"
              value={serviceMinutesDelivery}
              onChange={(e) => setServiceMinutesDelivery(e.target.value)}
              style={{ width: 70, padding: 6, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 2 }}>
              Collection mins on site
            </label>
            <input
              type="number"
              value={serviceMinutesCollection}
              onChange={(e) => setServiceMinutesCollection(e.target.value)}
              style={{ width: 70, padding: 6, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 2 }}>
              Tip return mins (at yard)
            </label>
            <input
              type="number"
              value={serviceMinutesTipReturn}
              onChange={(e) => setServiceMinutesTipReturn(e.target.value)}
              style={{ width: 70, padding: 6, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 2 }}>
              Driver break mins
            </label>
            <input
              type="number"
              value={driverBreakMinutes}
              onChange={(e) => setDriverBreakMinutes(e.target.value)}
              style={{ width: 70, padding: 6, borderRadius: 4, border: "1px solid #ccc" }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={calculateTimings}
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid #0070f3",
            background: "#0070f3",
            color: "#fff",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Calculate timings (ETA per job)
        </button>
        {Object.keys(timingsByJobId).length > 0 && (
          <span style={{ marginLeft: 8, fontSize: 12, color: "#555" }}>
            ETAs updated. Change layout or settings → recalc.
          </span>
        )}
      </section>

      {jobsForDay.length === 0 ? (
        <p>No deliveries or collections for this date.</p>
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {/* Left: unassigned jobs */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDropOnUnassigned}
            style={{
              width: 320,
              minHeight: 200,
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 8,
              background: "#fafafa",
            }}
          >
            <h2 style={{ fontSize: 16, margin: 0, marginBottom: 8 }}>
              Unassigned jobs
            </h2>
            <p style={{ fontSize: 12, color: "#666", marginTop: 0 }}>
              For {selectedDate} (actionable only)
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
              <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
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
                Useful if you need to roll collections or deliveries to another day.
              </div>
            </div>

            {unassignedJobs.length === 0 ? (
              <p style={{ fontSize: 12, color: "#999" }}>
                All jobs assigned to drivers.
              </p>
            ) : (
              <>
                {/* Deliveries */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    Deliveries ({unassignedDeliveries.length})
                  </div>
                  {unassignedDeliveries.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#999" }}>None</div>
                  ) : (
                    unassignedDeliveries.map((j) => (
                      <JobCard
                        key={j.id}
                        job={j}
                        customerName={findCustomerNameById(j.customer_id)}
                        formatJobStatus={formatJobStatus}
                        getJobTypeForDay={getJobTypeForDay}
                        getJobTypeColor={getJobTypeColor}
                        onDragStart={handleDragStart}
                        eta={timingsByJobId[j.id]?.eta}
                        formatEta={formatEta}
                          skipTypeNameById={skipTypeNameById}

                      />
                    ))
                  )}
                </div>

                {/* Collections */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    Collections ({unassignedCollections.length})
                  </div>
                  {unassignedCollections.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#999" }}>None</div>
                  ) : (
                    unassignedCollections.map((j) => (
                      <JobCard
                        key={j.id}
                        job={j}
                        customerName={findCustomerNameById(j.customer_id)}
                        formatJobStatus={formatJobStatus}
                        getJobTypeForDay={getJobTypeForDay}
                        getJobTypeColor={getJobTypeColor}
                        onDragStart={handleDragStart}
                        eta={timingsByJobId[j.id]?.eta}
                        formatEta={formatEta}
                          skipTypeNameById={skipTypeNameById}

                      />
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Driver columns */}
          <div style={{ display: "flex", gap: 12, flex: 1, overflowX: "auto" }}>
            {drivers.length === 0 ? (
              <div style={{ padding: 8, fontSize: 12, color: "#777" }}>
                No active drivers found. Add drivers on the{" "}
                <a href="/app/drivers">Drivers page</a> and refresh this scheduler.
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
                      <h2 style={{ fontSize: 16, margin: 0, marginBottom: 4 }}>
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
                          Add yard breaks for tip returns & driver breaks.
                        </>
                      )}
                    </p>

                    <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleAddYardBreak(driver.id)}
                        disabled={onHoliday}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid #999",
                          background: onHoliday ? "#eee" : "#f5f5f5",
                          fontSize: 11,
                          cursor: onHoliday ? "default" : "pointer",
                        }}
                      >
                        + Yard break (tip return)
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAddDriverBreak(driver.id)}
                        disabled={onHoliday}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid #999",
                          background: onHoliday ? "#eee" : "#f5f5f5",
                          fontSize: 11,
                          cursor: onHoliday ? "default" : "pointer",
                        }}
                      >
                        + Driver break ({driverBreakMinutes} mins)
                      </button>
                    </div>

                    {items.length === 0 ? (
                      <p style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
                        No jobs assigned.
                      </p>
                    ) : (
                      items.map((itemKey) => {
                        // Yard break marker
                        if (
                          typeof itemKey === "string" &&
                          (itemKey.startsWith("yardbreak:") || itemKey.startsWith("break:"))
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
                              <span>Return to yard / Tip & new run</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveBreak(driver.id, itemKey)}
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

                        // Driver break marker
                        if (typeof itemKey === "string" && itemKey.startsWith("driverbreak:")) {
                          return (
                            <div
                              key={itemKey}
                              style={{
                                margin: "8px 0",
                                padding: "4px 6px",
                                borderTop: "1px dotted #bbb",
                                borderBottom: "1px dotted #bbb",
                                fontSize: 11,
                                color: "#555",
                                background: "#fdf5e6",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <span>Driver break ({driverBreakMinutes} mins)</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveBreak(driver.id, itemKey)}
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
                            customerName={findCustomerNameById(job.customer_id)}
                            formatJobStatus={formatJobStatus}
                            getJobTypeForDay={getJobTypeForDay}
                            getJobTypeColor={getJobTypeColor}
                            onDragStart={handleDragStart}
                            eta={timingsByJobId[job.id]?.eta}
                            formatEta={formatEta}skipTypeNameById={skipTypeNameById}

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

// -------------------- JobCard COMPONENT --------------------

function JobCard({
  job,
  customerName,
  formatJobStatus,
  getJobTypeForDay,
  getJobTypeColor,
  onDragStart,
  eta,
  formatEta,
  skipTypeNameById,
}) {
  const type = getJobTypeForDay(job);
  const typeColor = getJobTypeColor(job);
  const etaLabel = eta ? formatEta(eta) : null;
  const skipName =
  (job.skip_type_id && skipTypeNameById && skipTypeNameById[job.skip_type_id]) || "";

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
        <span style={{ fontWeight: 600, fontSize: 12 }}>
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
  {job.site_name ? `${job.site_name}` : ""}
  {job.site_address_line1 ? `${job.site_name ? " — " : ""}${job.site_address_line1}` : ""}
  {job.site_postcode
    ? `${(job.site_name || job.site_address_line1) ? ", " : ""}${job.site_postcode}`
    : ""}
</div>

      <div style={{ marginBottom: 2, color: "#777" }}>
        Status: {formatJobStatus(job.job_status)}
      </div>

      <div style={{ marginBottom: 4, color: "#777" }}>
        Payment: {job.payment_type || "Unknown"}
      </div>
{skipName && (
  <div style={{ marginBottom: 4, color: "#777" }}>
    Skip: {skipName}
  </div>
)}


      {etaLabel && (
        <div style={{ marginBottom: 4, color: "#333", fontWeight: 600 }}>
          ETA: {etaLabel}
        </div>
      )}

      <a
        href={`/app/jobs/${job.id}`}
        style={{ fontSize: 11, textDecoration: "underline" }}
      >
        View / Edit job
      </a>
    </div>
  );
}
