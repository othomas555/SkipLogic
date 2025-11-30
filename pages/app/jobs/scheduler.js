// pages/app/jobs/scheduler.js
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function SchedulerPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // Holidays: driverId -> true
  const [holidaysByDriverId, setHolidaysByDriverId] = useState({});

  // Run timing params
  const [yardPostcode, setYardPostcode] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [preTripMinutes, setPreTripMinutes] = useState(30);
  const [serviceMinutesDelivery, setServiceMinutesDelivery] = useState(10);
  const [serviceMinutesCollection, setServiceMinutesCollection] =
    useState(10);
  const [serviceMinutesTipReturn, setServiceMinutesTipReturn] = useState(20);
  const [driverBreakMinutes, setDriverBreakMinutes] = useState(15);
  const [timingsByJobId, setTimingsByJobId] = useState({});

  // Travel time cache: "from|||to" -> minutes
  const [travelTimes, setTravelTimes] = useState({});

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });

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
   *   "<driver-uuid>": [jobId, "yardbreak:xxx", "driverbreak:yyy", jobId, ...]
   * }
   */
  const [columnLayout, setColumnLayout] = useState(null);

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

      // 2) Drivers (include staff_id)
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

      // 3) Holidays
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

      // 4) Jobs
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

      const initialLayout = { unassigned: [] };
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
      setTimingsByJobId({});
      setTravelTimes({});
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

  function parseStartDateTime(dateStr, timeStr) {
    try {
      const [hStr, mStr] = (timeStr || "08:00").split(":");
      const h = parseInt(hStr || "8", 10);
      const m = parseInt(mStr || "0", 10);
      const d = new Date(dateStr + "T00:00:00");
      d.setHours(h, m, 0, 0);
      return d;
    } catch {
      const d = new Date(dateStr + "T08:00:00");
      return d;
    }
  }

  function addMinutes(dateObj, minutes) {
    return new Date(dateObj.getTime() + minutes * 60 * 1000);
  }

  function locationForJob(job) {
    // For now just postcode; later you could store full address
    return job.site_postcode || "";
  }

  function travelKey(from, to) {
    return `${from || "yard"}|||${to || "yard"}`;
  }

  async function fetchMissingTravelTimes(pairsNeeded) {
    // pairsNeeded: [{ key, from, to }]
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
        newTravelTimes[key] !== undefined
          ? newTravelTimes[key]
          : travelTimes[key];

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
        if (
          typeof itemKey === "string" &&
          itemKey.startsWith("driverbreak:")
        ) {
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

  function formatEta(etaIso) {
    if (!etaIso) return "";
    const d = new Date(etaIso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  const jobsForDay = jobs;
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

  // ---------- JSX below (same as previous version except button uses calculateTimings) ----------

  // ... (for brevity I’m not re-pasting the entire JSX from the last answer;
  // you can keep your current JSX, but make sure the "Calculate timings" button calls:
  //    onClick={calculateTimings}
  // and that JobCard receives eta + formatEta props and displays them.)

}
