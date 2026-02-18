// pages/app/jobs/scheduler.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function ymdTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdAddDays(ymd, deltaDays) {
  try {
    const [y, m, d] = (ymd || "").split("-").map((x) => Number(x));
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + deltaDays);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  } catch {
    return ymd;
  }
}

function fmtGBP(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(x);
}

function buildAddress(job) {
  if (!job) return "";
  return [job.site_address_line1, job.site_address_line2, job.site_town, job.site_postcode]
    .filter(Boolean)
    .join(", ");
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function parseHmToMinutes(hm) {
  const s = String(hm || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  const hh = clampInt(m[1], 0, 23);
  const mm = clampInt(m[2], 0, 59);
  return hh * 60 + mm;
}

function minutesToHm(totalMins) {
  const m = ((totalMins % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalisePostcode(pc) {
  return String(pc || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function isWorkToDo(job, selectedDate) {
  if (!job) return false;
  const status = String(job.job_status || "");

  if (job.swap_role === "collect") {
    if (job.collection_actual_date) return false;
    if (status === "collected" || status === "completed") return false;
    return String(job.collection_date || "") === String(selectedDate);
  }

  if (job.delivery_actual_date) return false;
  if (status === "delivered" || status === "completed") return false;
  return String(job.scheduled_date || "") === String(selectedDate);
}

function jobRunDate(job) {
  if (!job) return "";
  return job.swap_role === "collect" ? job.collection_date || "" : job.scheduled_date || "";
}

function cardKey(card) {
  if (!card) return "card:unknown";
  if (card.type === "swap") return `swap:${card.swap_group_id}`;
  if (card.type === "job") return `job:${card.job?.id}`;
  if (card.type === "block") return `block:${card.block_id}`;
  return "card:unknown";
}

function groupIntoCards(jobs, selectedDate) {
  const used = new Set();
  const cards = [];

  const bySwap = new Map();
  for (const j of jobs || []) {
    if (!j?.swap_group_id) continue;
    if (String(jobRunDate(j)) !== String(selectedDate)) continue;
    if (!isWorkToDo(j, selectedDate)) continue;

    const key = String(j.swap_group_id);
    if (!bySwap.has(key)) bySwap.set(key, []);
    bySwap.get(key).push(j);
  }

  for (const [swapId, arr] of bySwap.entries()) {
    const collect = arr.find((x) => x.swap_role === "collect") || null;
    const deliver = arr.find((x) => x.swap_role === "deliver") || null;

    if (collect && deliver) {
      used.add(String(collect.id));
      used.add(String(deliver.id));
      cards.push({
        type: "swap",
        swap_group_id: swapId,
        driver_run_group: collect.driver_run_group ?? deliver.driver_run_group ?? null,
        assigned_driver_id: collect.assigned_driver_id ?? deliver.assigned_driver_id ?? null,
        collect,
        deliver,
      });
    }
  }

  for (const j of jobs || []) {
    if (!j?.id) continue;
    if (used.has(String(j.id))) continue;
    if (String(jobRunDate(j)) !== String(selectedDate)) continue;
    if (!isWorkToDo(j, selectedDate)) continue;
    cards.push({ type: "job", job: j });
  }

  cards.sort((a, b) => {
    const ag = Number(a.driver_run_group ?? a.job?.driver_run_group ?? 999999);
    const bg = Number(b.driver_run_group ?? b.job?.driver_run_group ?? 999999);
    if (ag !== bg) return ag - bg;

    const an = String(a.job?.job_number ?? a.collect?.job_number ?? "");
    const bn = String(b.job?.job_number ?? b.collect?.job_number ?? "");
    return an.localeCompare(bn);
  });

  return cards;
}

function postcodeForCard(card) {
  if (!card) return "";
  if (card.type === "swap") {
    return normalisePostcode(card.deliver?.site_postcode || card.collect?.site_postcode || "");
  }
  if (card.type === "job") {
    return normalisePostcode(card.job?.site_postcode || "");
  }
  return "";
}

export default function SchedulerPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();
  const router = useRouter();

  const [date, setDate] = useState(() => ymdTodayLocal());
  const prevDate = useMemo(() => ymdAddDays(date, -1), [date]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [skipTypes, setSkipTypes] = useState([]);
  const [jobs, setJobs] = useState([]);

  const [rolling, setRolling] = useState(false);

  // Planning inputs
  const [yardPostcode, setYardPostcode] = useState("CF33 6BN");
  const [startTime, setStartTime] = useState("08:00");
  const [minsVehicleChecks, setMinsVehicleChecks] = useState(15);
  const [minsDelivery, setMinsDelivery] = useState(12);     // ON-SITE
  const [minsCollection, setMinsCollection] = useState(10); // ON-SITE
  const [minsSwap, setMinsSwap] = useState(18);             // ON-SITE at stop
  const [minsReturn, setMinsReturn] = useState(15);         // Yard admin time once back
  const [minsBreak, setMinsBreak] = useState(30);

  // Local blocks placed on runs
  const [extrasByDriverId, setExtrasByDriverId] = useState({});

  // Frozen computed timings (only populated when you click Get timings)
  // structure:
  // {
  //   computedAt: ISO,
  //   yardPostcode, startTime,
  //   perDriver: { [driverId]: { [cardKey]: { arriveMin, departMin, travelMins, fromPc, toPc } } },
  //   perJobId: { [jobId]: { arrive, depart, travelMins, driverId, job_number, type, address, postcode } }
  // }
  const [computed, setComputed] = useState(null);
  const [computing, setComputing] = useState(false);
  const [sending, setSending] = useState(false);

  const customerById = useMemo(() => {
    const m = {};
    for (const c of customers || []) m[String(c.id)] = c;
    return m;
  }, [customers]);

  const skipTypeById = useMemo(() => {
    const m = {};
    for (const s of skipTypes || []) m[String(s.id)] = s;
    return m;
  }, [skipTypes]);

  async function loadAll() {
    if (!subscriberId) return;

    setErr("");
    setLoading(true);

    try {
      const { data: dRows, error: dErr } = await supabase
        .from("drivers")
        .select("id, name, email")
        .eq("subscriber_id", subscriberId)
        .order("name", { ascending: true });
      if (dErr) throw new Error("Failed to load drivers");
      setDrivers(dRows || []);

      try {
        const { data: cRows, error: cErr } = await supabase
          .from("customers")
          .select("id, first_name, last_name, company_name, phone, mobile, telephone, email")
          .eq("subscriber_id", subscriberId);
        if (cErr) throw cErr;
        setCustomers(cRows || []);
      } catch (e) {
        console.warn("Scheduler: customers not readable (ignored):", e?.message || e);
        setCustomers([]);
      }

      const { data: sRows, error: sErr } = await supabase
        .from("skip_types")
        .select("id, name")
        .eq("subscriber_id", subscriberId);
      if (sErr) throw new Error("Failed to load skip types");
      setSkipTypes(sRows || []);

      const { data: jRows, error: jErr } = await supabase
        .from("jobs")
        .select(
          [
            "id",
            "job_number",
            "customer_id",
            "skip_type_id",
            "site_name",
            "site_address_line1",
            "site_address_line2",
            "site_town",
            "site_postcode",
            "notes",
            "payment_type",
            "price_inc_vat",
            "job_status",
            "scheduled_date",
            "collection_date",
            "delivery_actual_date",
            "collection_actual_date",
            "assigned_driver_id",
            "driver_run_group",
            "swap_group_id",
            "swap_role",
          ].join(",")
        )
        .eq("subscriber_id", subscriberId)
        .or(`scheduled_date.eq.${date},collection_date.eq.${date}`);
      if (jErr) throw new Error("Failed to load jobs");

      setJobs(jRows || []);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to load scheduler data");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, subscriberId, date]);

  // If the plan changes, clear computed timings so you must re-run Get timings
  useEffect(() => {
    setComputed(null);
  }, [
    date,
    yardPostcode,
    startTime,
    minsVehicleChecks,
    minsDelivery,
    minsCollection,
    minsSwap,
    minsReturn,
    minsBreak,
    extrasByDriverId,
    jobs,
    drivers,
  ]);

  const cards = useMemo(() => groupIntoCards(jobs, date), [jobs, date]);

  const cardsByDriverId = useMemo(() => {
    const m = {};
    for (const d of drivers || []) m[String(d.id)] = [];

    for (const c of cards) {
      const driverId =
        c.type === "swap" ? (c.assigned_driver_id || "") : (c.job?.assigned_driver_id || "");
      if (!driverId) continue;
      if (!m[String(driverId)]) m[String(driverId)] = [];
      m[String(driverId)].push(c);
    }

    for (const driverId of Object.keys(m)) {
      const blocks = (extrasByDriverId[String(driverId)] || []).map((b) => ({
        type: "block",
        ...b,
      }));
      m[String(driverId)] = [...m[String(driverId)], ...blocks];
    }

    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => {
        const ag = Number(a.driver_run_group ?? a.job?.driver_run_group ?? 999999);
        const bg = Number(b.driver_run_group ?? b.job?.driver_run_group ?? 999999);
        if (ag !== bg) return ag - bg;
        const an = String(a.job?.job_number ?? a.collect?.job_number ?? a.label ?? "");
        const bn = String(b.job?.job_number ?? b.collect?.job_number ?? b.label ?? "");
        return an.localeCompare(bn);
      });
    }

    return m;
  }, [cards, drivers, extrasByDriverId]);

  const unassignedCards = useMemo(() => {
    return cards.filter((c) => {
      const driverId =
        c.type === "swap" ? (c.assigned_driver_id || "") : (c.job?.assigned_driver_id || "");
      return !driverId;
    });
  }, [cards]);

  function driverLabel(d) {
    return d?.name || d?.email || "Driver";
  }

  function customerLabel(customerId) {
    const c = customerById[String(customerId)];
    if (!c) return "—";
    const base = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (c.company_name) return `${c.company_name}${base ? ` – ${base}` : ""}`;
    return base || "—";
  }

  function customerPhone(customerId) {
    const c = customerById[String(customerId)];
    if (!c) return "";
    return c.phone || c.mobile || c.telephone || "";
  }

  function customerEmail(customerId) {
    const c = customerById[String(customerId)];
    if (!c) return "";
    return c.email || "";
  }

  function skipLabel(skipTypeId) {
    const s = skipTypeById[String(skipTypeId)];
    return s?.name || "—";
  }

  function nextRunGroupForDriver(driverId) {
    const list = cardsByDriverId[String(driverId)] || [];
    let max = 0;
    for (const c of list) {
      const g = Number(c.driver_run_group ?? c.job?.driver_run_group ?? 0);
      if (Number.isFinite(g) && g > max) max = g;
    }
    return max + 1;
  }

  async function assignCardToDriver(card, driverId) {
    if (!subscriberId) return;
    setErr("");

    const group = nextRunGroupForDriver(driverId);

    try {
      if (card.type === "swap") {
        const ids = [card.collect?.id, card.deliver?.id].filter(Boolean).map(String);
        const { error } = await supabase
          .from("jobs")
          .update({ assigned_driver_id: driverId, driver_run_group: group })
          .eq("subscriber_id", subscriberId)
          .in("id", ids);
        if (error) throw new Error("Failed to assign swap");
      } else if (card.type === "job") {
        const id = String(card.job?.id || "");
        if (!id) return;
        const { error } = await supabase
          .from("jobs")
          .update({ assigned_driver_id: driverId, driver_run_group: group })
          .eq("subscriber_id", subscriberId)
          .eq("id", id);
        if (error) throw new Error("Failed to assign job");
      } else if (card.type === "block") {
        setExtrasByDriverId((prev) => {
          const next = { ...(prev || {}) };
          const arr = [...(next[String(driverId)] || [])];
          arr.push({ ...card, driver_run_group: group });
          next[String(driverId)] = arr;
          return next;
        });
        return;
      }

      await loadAll();
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to assign");
    }
  }

  async function unassignCard(card, driverIdHint = null) {
    if (!subscriberId) return;
    setErr("");

    try {
      if (card.type === "swap") {
        const ids = [card.collect?.id, card.deliver?.id].filter(Boolean).map(String);
        const { error } = await supabase
          .from("jobs")
          .update({ assigned_driver_id: null, driver_run_group: null })
          .eq("subscriber_id", subscriberId)
          .in("id", ids);
        if (error) throw new Error("Failed to unassign swap");
        await loadAll();
        return;
      }

      if (card.type === "job") {
        const id = String(card.job?.id || "");
        if (!id) return;
        const { error } = await supabase
          .from("jobs")
          .update({ assigned_driver_id: null, driver_run_group: null })
          .eq("subscriber_id", subscriberId)
          .eq("id", id);
        if (error) throw new Error("Failed to unassign job");
        await loadAll();
        return;
      }

      if (card.type === "block") {
        const driverId = String(driverIdHint || "");
        if (!driverId) return;
        setExtrasByDriverId((prev) => {
          const next = { ...(prev || {}) };
          const arr = [...(next[driverId] || [])].filter(
            (x) => String(x.block_id) !== String(card.block_id)
          );
          next[driverId] = arr;
          return next;
        });
        return;
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to unassign");
    }
  }

  function onDragStart(e, card) {
    try {
      e.dataTransfer.setData(
        "application/json",
        JSON.stringify({
          type: card.type,
          swap_group_id: card.swap_group_id || null,
          job_id: card.job?.id || null,
          collect_id: card.collect?.id || null,
          deliver_id: card.deliver?.id || null,
          block_id: card.block_id || null,
          block_type: card.block_type || null,
          label: card.label || null,
          duration_mins: card.duration_mins || null,
        })
      );
      e.dataTransfer.effectAllowed = "move";
    } catch {}
  }

  async function onDropToDriver(e, driverId) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;

    try {
      const payload = JSON.parse(raw);

      if (payload.type === "swap") {
        const card = cards.find(
          (c) => c.type === "swap" && String(c.swap_group_id) === String(payload.swap_group_id)
        );
        if (card) await assignCardToDriver(card, driverId);
        return;
      }

      if (payload.type === "job") {
        const card = cards.find(
          (c) => c.type === "job" && String(c.job?.id) === String(payload.job_id)
        );
        if (card) await assignCardToDriver(card, driverId);
        return;
      }

      if (payload.type === "block") {
        const block = {
          type: "block",
          block_id: payload.block_id || `blk_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          block_type: payload.block_type || "block",
          label: payload.label || "Block",
          duration_mins: clampInt(payload.duration_mins, 0, 600),
          driver_run_group: null,
        };
        await assignCardToDriver(block, driverId);
      }
    } catch {}
  }

  async function onDropToUnassigned(e) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;

    try {
      const payload = JSON.parse(raw);

      if (payload.type === "swap") {
        const card = cards.find(
          (c) => c.type === "swap" && String(c.swap_group_id) === String(payload.swap_group_id)
        );
        if (card) await unassignCard(card);
        return;
      }

      if (payload.type === "job") {
        const card = cards.find(
          (c) => c.type === "job" && String(c.job?.id) === String(payload.job_id)
        );
        if (card) await unassignCard(card);
      }
    } catch {}
  }

  function openJob(jobId) {
    if (!jobId) return;
    router.push(`/app/jobs/${jobId}`);
  }

  async function markComplete(card) {
    if (!subscriberId) return;
    setErr("");

    try {
      if (card.type === "swap") {
        const collectId = card.collect?.id;
        const deliverId = card.deliver?.id;

        const updates = [];
        if (collectId) {
          updates.push(
            supabase
              .from("jobs")
              .update({ collection_actual_date: date, job_status: "collected" })
              .eq("subscriber_id", subscriberId)
              .eq("id", collectId)
          );
        }
        if (deliverId) {
          updates.push(
            supabase
              .from("jobs")
              .update({ delivery_actual_date: date, job_status: "delivered" })
              .eq("subscriber_id", subscriberId)
              .eq("id", deliverId)
          );
        }

        const results = await Promise.all(updates);
        for (const r of results) if (r?.error) throw new Error("Failed to mark swap complete");
        await loadAll();
        return;
      }

      if (card.type === "job") {
        const j = card.job;
        if (!j?.id) return;

        if (j.swap_role === "collect") {
          const { error } = await supabase
            .from("jobs")
            .update({ collection_actual_date: date, job_status: "collected" })
            .eq("subscriber_id", subscriberId)
            .eq("id", j.id);
          if (error) throw new Error("Failed to mark collection complete");
        } else {
          const { error } = await supabase
            .from("jobs")
            .update({ delivery_actual_date: date, job_status: "delivered" })
            .eq("subscriber_id", subscriberId)
            .eq("id", j.id);
          if (error) throw new Error("Failed to mark delivery complete");
        }

        await loadAll();
        return;
      }

      if (card.type === "block") {
        const driverId = String(card._driverId || "");
        if (driverId) await unassignCard(card, driverId);
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to mark complete");
    }
  }

  async function rollForwardFromYesterday() {
    if (!subscriberId) return;

    setErr("");
    setRolling(true);

    try {
      const { data: prevJobs, error: prevErr } = await supabase
        .from("jobs")
        .select("id,scheduled_date,collection_date,delivery_actual_date,collection_actual_date,job_status,swap_role")
        .eq("subscriber_id", subscriberId)
        .or(`scheduled_date.eq.${prevDate},collection_date.eq.${prevDate}`);

      if (prevErr) throw new Error("Failed to load yesterday's jobs");

      const candidates = (prevJobs || []).filter((j) => isWorkToDo(j, prevDate));
      if (!candidates.length) {
        setRolling(false);
        return;
      }

      const deliveryIds = candidates
        .filter((j) => j.swap_role !== "collect" && String(j.scheduled_date || "") === String(prevDate))
        .map((j) => j.id);

      const collectionIds = candidates
        .filter((j) => j.swap_role === "collect" && String(j.collection_date || "") === String(prevDate))
        .map((j) => j.id);

      if (deliveryIds.length) {
        const { error } = await supabase
          .from("jobs")
          .update({ scheduled_date: date })
          .eq("subscriber_id", subscriberId)
          .in("id", deliveryIds);
        if (error) throw new Error("Failed to roll deliveries forward");
      }

      if (collectionIds.length) {
        const { error } = await supabase
          .from("jobs")
          .update({ collection_date: date })
          .eq("subscriber_id", subscriberId)
          .in("id", collectionIds);
        if (error) throw new Error("Failed to roll collections forward");
      }

      await loadAll();
      setRolling(false);
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to roll jobs forward");
      setRolling(false);
    }
  }

  const toolboxBlocks = useMemo(() => {
    return [
      { type: "block", block_id: "tool_vehicle_checks", block_type: "vehicle_checks", label: "Vehicle checks", duration_mins: clampInt(minsVehicleChecks, 0, 600) },
      { type: "block", block_id: "tool_break", block_type: "break", label: "Break", duration_mins: clampInt(minsBreak, 0, 600) },
      { type: "block", block_id: "tool_return", block_type: "return_yard", label: "Return to yard", duration_mins: clampInt(minsReturn, 0, 600) },
    ];
  }, [minsVehicleChecks, minsBreak, minsReturn]);

  function onSiteMinsForCard(card) {
    if (!card) return 0;
    if (card.type === "block") return clampInt(card.duration_mins, 0, 600);
    if (card.type === "swap") return clampInt(minsSwap, 0, 600);
    if (card.type === "job") {
      const j = card.job;
      if (j?.swap_role === "collect") return clampInt(minsCollection, 0, 600);
      return clampInt(minsDelivery, 0, 600);
    }
    return 0;
  }

  // -------------------------
  // GET TIMINGS (manual button)
  // -------------------------
  async function getTimings() {
    setErr("");
    setComputing(true);

    try {
      const yard = normalisePostcode(yardPostcode);
      if (!yard) throw new Error("Enter a yard postcode first.");

      // Build all required travel pairs for ALL driver lanes in one batch
      const pairs = [];
      const seen = new Set();

      const addPair = (from, to) => {
        const f = normalisePostcode(from);
        const t = normalisePostcode(to);
        if (!f || !t) return;
        const key = `${f}→${t}`;
        if (seen.has(key)) return;
        seen.add(key);
        pairs.push({ key, from: f, to: t });
      };

      // Build pairs by walking each driver lane
      for (const d of drivers || []) {
        const list = (cardsByDriverId[String(d.id)] || []).map((c) =>
          c?.type === "block" ? { ...c, _driverId: String(d.id) } : c
        );

        let lastPc = yard;
        let hasStop = false;

        for (const item of list) {
          if (item.type === "block") {
            if (item.block_type === "return_yard" && hasStop) {
              addPair(lastPc, yard);
              lastPc = yard;
              hasStop = false;
            }
            continue;
          }

          const pc = postcodeForCard(item);
          if (!pc) continue;

          addPair(hasStop ? lastPc : yard, pc);
          lastPc = pc;
          hasStop = true;
        }
      }

      // Fetch travel minutes (can be empty if no assigned jobs)
      let travelMinutes = {};
      if (pairs.length) {
        const resp = await fetch("/api/distance-matrix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairs }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "Distance Matrix failed");
        travelMinutes = data?.travelMinutes || {};
      }

      // Now compute per-driver timeline and per-job timeline
      const perDriver = {};
      const perJobId = {};

      const base = parseHmToMinutes(startTime);

      for (const d of drivers || []) {
        const driverId = String(d.id);
        const list = (cardsByDriverId[driverId] || []).map((c) =>
          c?.type === "block" ? { ...c, _driverId: driverId } : c
        );

        let t = base;
        let lastPc = yard;
        let hasStop = false;

        const lane = {};

        for (const item of list) {
          const key = cardKey(item);

          if (item.type === "block") {
            const bt = item.block_type || "block";

            if (bt === "return_yard" && hasStop) {
              const tk = `${normalisePostcode(lastPc)}→${yard}`;
              const travelMins = Number(travelMinutes[tk] || 0);
              const arriveMin = t + (Number.isFinite(travelMins) ? travelMins : 0);
              const departMin = arriveMin + onSiteMinsForCard(item);
              lane[key] = { arriveMin, departMin, travelMins: Number.isFinite(travelMins) ? travelMins : 0, fromPc: lastPc, toPc: yard, kind: "return_yard" };
              t = departMin;
              lastPc = yard;
              hasStop = false;
            } else {
              const arriveMin = t;
              const departMin = arriveMin + onSiteMinsForCard(item);
              lane[key] = { arriveMin, departMin, travelMins: 0, fromPc: "", toPc: "", kind: bt };
              t = departMin;
            }
            continue;
          }

          const toPc = postcodeForCard(item);
          const fromPc = hasStop ? lastPc : yard;
          const tk = `${normalisePostcode(fromPc)}→${normalisePostcode(toPc)}`;
          const travelMins = Number(travelMinutes[tk] || 0);
          const travelOk = Number.isFinite(travelMins) ? travelMins : 0;

          const arriveMin = t + travelOk; // arrival
          const departMin = arriveMin + onSiteMinsForCard(item); // ready to leave
          lane[key] = { arriveMin, departMin, travelMins: travelOk, fromPc, toPc, kind: item.type };

          t = departMin;
          if (toPc) {
            lastPc = toPc;
            hasStop = true;
          }

          // Also store per-jobId for messaging
          if (item.type === "job") {
            const j = item.job;
            if (j?.id) {
              perJobId[String(j.id)] = {
                job_id: String(j.id),
                job_number: j.job_number || "",
                type: j.swap_role === "collect" ? "collection" : "delivery",
                driver_id: driverId,
                driver_name: driverLabel(d),
                arrive: minutesToHm(arriveMin),
                depart: minutesToHm(departMin),
                travel_mins: Math.round(travelOk),
                postcode: normalisePostcode(j.site_postcode || ""),
                address: buildAddress(j),
                customer_id: j.customer_id || null,
                customer_name: customerLabel(j.customer_id),
                customer_phone: customerPhone(j.customer_id),
                customer_email: customerEmail(j.customer_id),
              };
            }
          } else if (item.type === "swap") {
            const collect = item.collect;
            const deliver = item.deliver;
            const pc = normalisePostcode(deliver?.site_postcode || collect?.site_postcode || "");
            const addr = buildAddress(deliver || collect);

            // Both legs share the same stop window
            if (collect?.id) {
              perJobId[String(collect.id)] = {
                job_id: String(collect.id),
                job_number: collect.job_number || "",
                type: "swap_collect",
                driver_id: driverId,
                driver_name: driverLabel(d),
                arrive: minutesToHm(arriveMin),
                depart: minutesToHm(departMin),
                travel_mins: Math.round(travelOk),
                postcode: pc,
                address: addr,
                customer_id: collect.customer_id || null,
                customer_name: customerLabel(collect.customer_id),
                customer_phone: customerPhone(collect.customer_id),
                customer_email: customerEmail(collect.customer_id),
              };
            }
            if (deliver?.id) {
              perJobId[String(deliver.id)] = {
                job_id: String(deliver.id),
                job_number: deliver.job_number || "",
                type: "swap_deliver",
                driver_id: driverId,
                driver_name: driverLabel(d),
                arrive: minutesToHm(arriveMin),
                depart: minutesToHm(departMin),
                travel_mins: Math.round(travelOk),
                postcode: pc,
                address: addr,
                customer_id: deliver.customer_id || null,
                customer_name: customerLabel(deliver.customer_id),
                customer_phone: customerPhone(deliver.customer_id),
                customer_email: customerEmail(deliver.customer_id),
              };
            }
          }
        }

        perDriver[driverId] = lane;
      }

      setComputed({
        computedAt: new Date().toISOString(),
        date,
        yardPostcode: normalisePostcode(yardPostcode),
        startTime,
        perDriver,
        perJobId,
      });

      setComputing(false);
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to compute timings");
      setComputing(false);
    }
  }

  // -------------------------
  // SEND MESSAGES (manual button)
  // -------------------------
  async function sendMessages() {
    if (!computed?.perJobId) return;
    setErr("");
    setSending(true);

    try {
      const payload = {
        date,
        yard_postcode: computed.yardPostcode,
        computed_at: computed.computedAt,
        jobs: Object.values(computed.perJobId),
      };

      const resp = await fetch("/api/scheduler/send-timings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Send failed");

      // For now we just show a success message. Actual sending is handled server-side.
      setSending(false);
      alert(`Sent/queued ${data?.queued || 0} message(s).`);
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to send messages");
      setSending(false);
    }
  }

  function timingFor(driverId, card) {
    if (!computed?.perDriver) return null;
    const lane = computed.perDriver[String(driverId)] || null;
    if (!lane) return null;
    return lane[cardKey(card)] || null;
  }

  if (checking) {
    return (
      <main style={centerStyle}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Scheduler</h1>
        <p>You must be signed in.</p>
        <a href="/login">Go to login</a>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>Skip hire scheduler</h1>
          <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>Signed in as {user.email}</div>
          <div style={{ marginTop: 8 }}>
            <a href="/app/jobs" style={{ fontSize: 14 }}>← Back to jobs</a>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" style={btnSecondary} onClick={() => setDate((d) => ymdAddDays(d, -1))}>◀</button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || ymdTodayLocal())} style={input} />
            <button type="button" style={btnSecondary} onClick={() => setDate((d) => ymdAddDays(d, 1))}>▶</button>
          </div>
          <button type="button" onClick={loadAll} style={btnSecondary}>Refresh</button>
        </div>
      </header>

      {(authError || err) ? <div style={alertError}>{authError || err}</div> : null}

      <section style={topControls}>
        <div style={topControlsLeft}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Day controls</div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={btnPrimary} onClick={rollForwardFromYesterday} disabled={rolling}>
              {rolling ? "Rolling…" : `Roll forward unfinished jobs from ${prevDate} → ${date}`}
            </button>

            <div style={{ color: "#666", fontSize: 12 }}>
              Rolls forward <b>all incomplete</b> jobs (assigned or unassigned).
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={btnPrimaryAlt} onClick={getTimings} disabled={computing}>
              {computing ? "Getting timings…" : "Get timings"}
            </button>

            <button
              type="button"
              style={btnPrimary}
              onClick={sendMessages}
              disabled={sending || !computed?.perJobId || Object.keys(computed.perJobId).length === 0}
              title={!computed ? "Run Get timings first" : ""}
            >
              {sending ? "Sending…" : "Send messages"}
            </button>

            <div style={{ color: "#666", fontSize: 12, alignSelf: "center" }}>
              {computed ? `Timings computed at ${new Date(computed.computedAt).toLocaleTimeString()}` : "Timings not computed yet."}
            </div>
          </div>
        </div>

        <div style={topControlsRight}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Run timings / blocks</div>

          <div style={timingGrid}>
            <div style={timingCell}>
              <div style={timingLabel}>Yard postcode</div>
              <input value={yardPostcode} onChange={(e) => setYardPostcode(e.target.value)} placeholder="e.g. CF33 6BN" style={input} />
            </div>

            <div style={timingCell}>
              <div style={timingLabel}>Start time</div>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value || "08:00")} style={input} />
            </div>

            <TimingInput label="Vehicle checks (mins)" value={minsVehicleChecks} onChange={setMinsVehicleChecks} />
            <TimingInput label="Delivery on-site (mins)" value={minsDelivery} onChange={setMinsDelivery} />
            <TimingInput label="Collection on-site (mins)" value={minsCollection} onChange={setMinsCollection} />
            <TimingInput label="Swap on-site (mins)" value={minsSwap} onChange={setMinsSwap} />
            <TimingInput label="Return yard admin (mins)" value={minsReturn} onChange={setMinsReturn} />
            <TimingInput label="Break (mins)" value={minsBreak} onChange={setMinsBreak} />
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Drag blocks into a driver lane:</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {toolboxBlocks.map((b) => (
                <div
                  key={b.block_id}
                  draggable
                  onDragStart={(e) => onDragStart(e, b)}
                  style={toolBlockStyle(b.block_type)}
                >
                  <div style={{ fontWeight: 900 }}>{b.label}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{b.duration_mins} mins</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div style={cardStyle}>Loading…</div>
      ) : (
        <div style={grid}>
          <section style={lane} onDragOver={(e) => e.preventDefault()} onDrop={onDropToUnassigned}>
            <div style={laneHeader}>
              <div style={{ fontWeight: 900 }}>Unassigned</div>
              <div style={{ color: "#666", fontSize: 12 }}>{unassignedCards.length} item(s)</div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {unassignedCards.length ? unassignedCards.map((c) => (
                <SchedulerCard
                  key={cardKey(c)}
                  card={c}
                  customerLabel={customerLabel}
                  customerPhone={customerPhone}
                  skipLabel={skipLabel}
                  fmtGBP={fmtGBP}
                  onDragStart={onDragStart}
                  onOpenJob={openJob}
                  onComplete={markComplete}
                  timing={null}
                  onUnassign={() => unassignCard(c)}
                />
              )) : (
                <div style={{ color: "#666", padding: 10 }}>None</div>
              )}
            </div>
          </section>

          <section style={driversWrap}>
            {(drivers || []).map((d) => {
              const driverId = String(d.id);
              const list = (cardsByDriverId[driverId] || []).map((c) =>
                c?.type === "block" ? { ...c, _driverId: driverId } : c
              );

              return (
                <div
                  key={d.id}
                  style={lane}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropToDriver(e, d.id)}
                >
                  <div style={laneHeader}>
                    <div style={{ fontWeight: 900 }}>{driverLabel(d)}</div>
                    <div style={{ color: "#666", fontSize: 12 }}>{list.length} item(s)</div>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {list.length ? list.map((c) => (
                      <SchedulerCard
                        key={cardKey(c)}
                        card={c}
                        customerLabel={customerLabel}
                        customerPhone={customerPhone}
                        skipLabel={skipLabel}
                        fmtGBP={fmtGBP}
                        onDragStart={onDragStart}
                        onOpenJob={openJob}
                        onComplete={markComplete}
                        timing={timingFor(driverId, c)}
                        onUnassign={() => {
                          if (c.type === "block") return unassignCard(c, d.id);
                          return unassignCard(c);
                        }}
                      />
                    )) : (
                      <div style={{ color: "#666", padding: 10 }}>Drop jobs here</div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </main>
  );
}

function TimingInput({ label, value, onChange }) {
  return (
    <div style={timingCell}>
      <div style={timingLabel}>{label}</div>
      <input
        type="number"
        min={0}
        max={600}
        value={String(value)}
        onChange={(e) => onChange(clampInt(e.target.value, 0, 600))}
        style={input}
      />
    </div>
  );
}

function SchedulerCard({
  card,
  customerLabel,
  customerPhone,
  skipLabel,
  fmtGBP,
  onDragStart,
  onOpenJob,
  onComplete,
  timing,
  onUnassign,
}) {
  if (!card) return null;

  const timeLabel = timing ? `${minutesToHm(timing.arriveMin)}–${minutesToHm(timing.departMin)}` : null;
  const travelLabel = timing && timing.travelMins > 0 ? `Travel: ${Math.round(timing.travelMins)} mins` : null;

  if (card.type === "block") {
    const blockType = card.block_type || "block";
    const style = { ...jobCardBase, ...shadeForBlock(blockType), cursor: "grab" };

    return (
      <div draggable onDragStart={(e) => onDragStart(e, card)} style={style} title="Drag to move (local only)">
        <div style={topRow}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={pillDark}>{(blockType || "BLOCK").toUpperCase().replace("_", " ")}</span>
            <div style={{ fontWeight: 900 }}>{card.label || "Block"}</div>
            {timeLabel ? <span style={timePill}>{timeLabel}</span> : null}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" style={btnTiny} onClick={onUnassign} title="Remove block">✕</button>
            <button type="button" style={btnTinyPrimary} onClick={() => onComplete(card)} title="Mark done (removes block)">Done</button>
          </div>
        </div>

        {travelLabel ? <div style={{ marginTop: 6, fontSize: 12, color: "#444" }}>{travelLabel}</div> : null}
        <div style={{ marginTop: 6, color: "#333", fontSize: 13 }}>
          Duration: <b>{card.duration_mins || 0} mins</b>
        </div>
      </div>
    );
  }

  if (card.type === "swap") {
    const c = card.collect;
    const d = card.deliver;

    const customerId = d?.customer_id || c?.customer_id;
    const phone = customerPhone(customerId);
    const addr = buildAddress(d || c);

    const fromSkip = skipLabel(c?.skip_type_id);
    const toSkip = skipLabel(d?.skip_type_id);

    const clickId = d?.id || c?.id || null;

    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, card)}
        style={{ ...jobCardBase, ...shadeForType("swap") }}
        title="Swap (drag to assign)"
        onDoubleClick={() => clickId && onOpenJob(clickId)}
      >
        <div style={topRow}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={pillSwap}>SWAP</span>
            <div style={{ fontWeight: 900 }}>
              {c?.job_number || "—"} ↔ {d?.job_number || "—"}
            </div>
            {timeLabel ? <span style={timePill}>{timeLabel}</span> : null}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" style={btnTiny} onClick={(e) => { e.stopPropagation(); onUnassign(); }}>
              Unassign
            </button>
            <button type="button" style={btnTinyPrimary} onClick={(e) => { e.stopPropagation(); onComplete(card); }}>
              Complete
            </button>
          </div>
        </div>

        {travelLabel ? <div style={{ marginTop: 6, fontSize: 12, color: "#444" }}>{travelLabel}</div> : null}

        <div style={metaRow}>
          <div><b>Customer:</b> {customerLabel(customerId)}</div>
          {phone ? <div><b>Tel:</b> {phone}</div> : <div style={{ color: "#888" }}><b>Tel:</b> —</div>}
        </div>

        <div style={addrRow}>{addr || "—"}</div>

        <div style={metaRow}>
          <div><b>Action:</b> Swap {fromSkip} → {toSkip}</div>
          <div style={{ textAlign: "right" }}><b>{fmtGBP(d?.price_inc_vat)}</b></div>
        </div>

        <div style={footRow}>
          <button type="button" style={btnLink} onClick={(e) => { e.stopPropagation(); clickId && onOpenJob(clickId); }}>
            Open job
          </button>
          <div style={smallMuted}>group {String(card.driver_run_group ?? "—")}</div>
        </div>
      </div>
    );
  }

  const j = card.job;
  const addr = buildAddress(j);
  const customerId = j?.customer_id;
  const phone = customerPhone(customerId);

  const isCollection = j?.swap_role === "collect";
  const typeLabel = isCollection ? "COLLECTION" : "DELIVERY";
  const actionLabel = isCollection ? `Collect: ${skipLabel(j?.skip_type_id)}` : `Deliver: ${skipLabel(j?.skip_type_id)}`;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card)}
      style={{ ...jobCardBase, ...shadeForType(isCollection ? "collection" : "delivery") }}
      title="Drag to assign"
      onDoubleClick={() => j?.id && onOpenJob(j.id)}
    >
      <div style={topRow}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={isCollection ? pillCollection : pillDelivery}>{typeLabel}</span>
          <div style={{ fontWeight: 900 }}>{j?.job_number || "Job"}</div>
          {timeLabel ? <span style={timePill}>{timeLabel}</span> : null}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" style={btnTiny} onClick={(e) => { e.stopPropagation(); onUnassign(); }}>
            Unassign
          </button>
          <button type="button" style={btnTinyPrimary} onClick={(e) => { e.stopPropagation(); onComplete(card); }}>
            Complete
          </button>
        </div>
      </div>

      {travelLabel ? <div style={{ marginTop: 6, fontSize: 12, color: "#444" }}>{travelLabel}</div> : null}

      <div style={metaRow}>
        <div><b>Customer:</b> {customerLabel(customerId)}</div>
        {phone ? <div><b>Tel:</b> {phone}</div> : <div style={{ color: "#888" }}><b>Tel:</b> —</div>}
      </div>

      <div style={addrRow}>{addr || "—"}</div>

      <div style={metaRow}>
        <div><b>Action:</b> {actionLabel}</div>
        <div style={{ textAlign: "right" }}><b>{fmtGBP(j?.price_inc_vat)}</b></div>
      </div>

      <div style={footRow}>
        <button type="button" style={btnLink} onClick={(e) => { e.stopPropagation(); j?.id && onOpenJob(j.id); }}>
          Open job
        </button>
        <div style={smallMuted}>group {String(j?.driver_run_group ?? "—")}</div>
      </div>
    </div>
  );
}

/* ------------------ styles ------------------ */

const pageStyle = {
  minHeight: "100vh",
  padding: 16,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f6f6f6",
};

const centerStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const topControls = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginBottom: 12,
};

const topControlsLeft = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const topControlsRight = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const timingGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
  gap: 10,
};

const timingCell = { display: "grid", gap: 6 };

const timingLabel = { fontSize: 12, color: "#666", fontWeight: 700 };

const grid = {
  display: "grid",
  gridTemplateColumns: "360px 1fr",
  gap: 12,
  alignItems: "start",
};

const driversWrap = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
};

const lane = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  minHeight: 120,
};

const laneHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "baseline",
  marginBottom: 10,
};

const cardStyle = {
  background: "#fff",
  borderRadius: 12,
  padding: 12,
  border: "1px solid #eee",
};

const jobCardBase = {
  border: "1px solid #e8e8e8",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
  cursor: "grab",
  userSelect: "none",
};

const topRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};

const metaRow = {
  marginTop: 8,
  fontSize: 13,
  color: "#222",
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  justifyContent: "space-between",
};

const addrRow = { marginTop: 6, color: "#444", fontSize: 13, lineHeight: 1.3 };

const footRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginTop: 10,
};

const smallMuted = { color: "#777", fontSize: 12 };

const pillBase = {
  display: "inline-block",
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  fontWeight: 900,
};

const pillDelivery = { ...pillBase, background: "rgba(0, 120, 255, 0.10)" };
const pillCollection = { ...pillBase, background: "rgba(0, 180, 120, 0.12)" };
const pillSwap = { ...pillBase, background: "rgba(255, 170, 0, 0.16)" };
const pillDark = { ...pillBase, background: "rgba(0,0,0,0.06)" };
const timePill = { ...pillBase, background: "rgba(0,0,0,0.05)", color: "#333" };

const input = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ccc",
  fontSize: 14,
  background: "#fff",
  width: "100%",
};

const btnSecondary = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const btnPrimary = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const btnPrimaryAlt = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #0b57d0",
  background: "#0b57d0",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const btnTiny = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 12,
};

const btnTinyPrimary = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 12,
};

const btnLink = {
  padding: 0,
  border: "none",
  background: "transparent",
  color: "#0b57d0",
  cursor: "pointer",
  fontWeight: 900,
};

const alertError = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#8a1f1f",
  whiteSpace: "pre-wrap",
  marginBottom: 12,
};

function shadeForType(type) {
  if (type === "delivery") return { borderLeft: "6px solid rgba(0, 120, 255, 0.80)", background: "rgba(0, 120, 255, 0.06)" };
  if (type === "collection") return { borderLeft: "6px solid rgba(0, 180, 120, 0.85)", background: "rgba(0, 180, 120, 0.07)" };
  if (type === "swap") return { borderLeft: "6px solid rgba(255, 170, 0, 0.90)", background: "rgba(255, 170, 0, 0.10)" };
  return { borderLeft: "6px solid rgba(0,0,0,0.35)", background: "#fff" };
}

function shadeForBlock(blockType) {
  if (blockType === "vehicle_checks") return { borderLeft: "6px solid rgba(120, 0, 255, 0.75)", background: "rgba(120, 0, 255, 0.06)" };
  if (blockType === "break") return { borderLeft: "6px solid rgba(255, 0, 120, 0.75)", background: "rgba(255, 0, 120, 0.06)" };
  if (blockType === "return_yard") return { borderLeft: "6px solid rgba(0, 0, 0, 0.65)", background: "rgba(0, 0, 0, 0.04)" };
  return { borderLeft: "6px solid rgba(0,0,0,0.35)", background: "rgba(0,0,0,0.03)" };
}

function toolBlockStyle(blockType) {
  const base = {
    borderRadius: 12,
    border: "1px solid #e8e8e8",
    padding: "10px 12px",
    minWidth: 170,
    cursor: "grab",
    background: "#fff",
  };
  return { ...base, ...shadeForBlock(blockType) };
}
