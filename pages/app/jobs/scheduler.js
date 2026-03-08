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
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(x);
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
  if (status === "delivered" || status === "collected" || status === "completed") return false;
  return String(job.scheduled_date || "") === String(selectedDate);
}

function cardKey(card) {
  if (!card) return "";
  if (card.type === "swap") return `swap:${card.swap_group_id || card.collect?.id || card.deliver?.id || ""}`;
  if (card.type === "job") return `job:${card.job?.id || ""}`;
  if (card.type === "block") return `block:${card.block_id || ""}`;
  return "";
}

function makeBlock(blockType, label, durationMins) {
  return {
    type: "block",
    block_id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    block_type: blockType,
    label,
    duration_mins: durationMins,
    driver_run_group: null,
  };
}

function groupIntoCards(jobs, selectedDate) {
  const bySwapGroup = {};
  const cards = [];

  for (const j of jobs || []) {
    if (!isWorkToDo(j, selectedDate)) continue;

    if (j.swap_group_id) {
      const key = String(j.swap_group_id);
      if (!bySwapGroup[key]) bySwapGroup[key] = [];
      bySwapGroup[key].push(j);
      continue;
    }

    cards.push({ type: "job", job: j });
  }

  for (const key of Object.keys(bySwapGroup)) {
    const arr = bySwapGroup[key];
    const collect = arr.find((x) => String(x.swap_role || "").toLowerCase() === "collect") || null;
    const deliver = arr.find((x) => String(x.swap_role || "").toLowerCase() === "deliver") || null;

    if (collect || deliver) {
      cards.push({
        type: "swap",
        swap_group_id: key,
        collect,
        deliver,
        assigned_driver_id: collect?.assigned_driver_id || deliver?.assigned_driver_id || null,
        driver_run_group: collect?.driver_run_group ?? deliver?.driver_run_group ?? null,
      });
    } else {
      for (const j of arr) cards.push({ type: "job", job: j });
    }
  }

  cards.sort((a, b) => {
    const ag = Number(a.driver_run_group ?? a.job?.driver_run_group ?? 999999);
    const bg = Number(b.driver_run_group ?? b.job?.driver_run_group ?? 999999);
    if (ag !== bg) return ag - bg;

    const an = String(a.job?.job_number ?? a.collect?.job_number ?? a.deliver?.job_number ?? "");
    const bn = String(b.job?.job_number ?? b.collect?.job_number ?? b.deliver?.job_number ?? "");
    return an.localeCompare(bn);
  });

  return cards;
}

function getCardKind(card, date) {
  if (!card) return "job";
  if (card.type === "swap") return "swap";
  if (card.type === "block") return "block";
  if (card.type === "job") {
    const j = card.job || {};
    if (String(j.collection_date || "") === String(date)) return "collection";
    return "delivery";
  }
  return "job";
}

export default function SchedulerPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [date, setDate] = useState(ymdTodayLocal());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [skipTypes, setSkipTypes] = useState([]);
  const [jobs, setJobs] = useState([]);

  const [rolling, setRolling] = useState(false);

  const [yardPostcode, setYardPostcode] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [minsVehicleChecks, setMinsVehicleChecks] = useState(10);
  const [minsDelivery, setMinsDelivery] = useState(10);
  const [minsCollection, setMinsCollection] = useState(10);
  const [minsSwap, setMinsSwap] = useState(18);
  const [minsReturn, setMinsReturn] = useState(15);
  const [minsBreak, setMinsBreak] = useState(0);

  const [extrasByDriverId, setExtrasByDriverId] = useState({});
  const [computed, setComputed] = useState(null);
  const [computing, setComputing] = useState(false);
  const [sending, setSending] = useState(false);
  const [showTimingHelp, setShowTimingHelp] = useState(false);

  const prevDate = useMemo(() => ymdAddDays(date, -1), [date]);

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
          .select("id, first_name, last_name, company_name, phone, email")
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
    return base || c.email || "—";
  }

  function customerPhone(customerId) {
    const c = customerById[String(customerId)];
    return c?.phone || "";
  }

  function customerEmail(customerId) {
    const c = customerById[String(customerId)];
    return c?.email || "";
  }

  function skipLabel(skipTypeId) {
    const s = skipTypeById[String(skipTypeId)];
    return s?.name || "Skip";
  }

  function openJob(card) {
    if (card?.type === "job" && card.job?.id) {
      router.push(`/app/jobs/${card.job.id}`);
      return;
    }
    if (card?.type === "swap") {
      const id = card.deliver?.id || card.collect?.id;
      if (id) router.push(`/app/jobs/${id}`);
    }
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
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to unassign");
    }
  }

  async function moveCardWithinDriver(card, driverId, dir) {
    const driverKey = String(driverId);
    const list = [...(cardsByDriverId[driverKey] || [])];
    const idx = list.findIndex((x) => cardKey(x) === cardKey(card));
    if (idx < 0) return;

    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;

    const a = list[idx];
    const b = list[swapIdx];

    const ag = Number(a.driver_run_group ?? a.job?.driver_run_group ?? 0);
    const bg = Number(b.driver_run_group ?? b.job?.driver_run_group ?? 0);

    try {
      if (a.type === "block" || b.type === "block") {
        setExtrasByDriverId((prev) => {
          const next = { ...(prev || {}) };
          const arr = [...(next[driverKey] || [])];
          const aBlock = a.type === "block" ? a : null;
          const bBlock = b.type === "block" ? b : null;

          for (let i = 0; i < arr.length; i += 1) {
            if (aBlock && String(arr[i].block_id) === String(aBlock.block_id)) {
              arr[i] = { ...arr[i], driver_run_group: bg };
            }
            if (bBlock && String(arr[i].block_id) === String(bBlock.block_id)) {
              arr[i] = { ...arr[i], driver_run_group: ag };
            }
          }

          next[driverKey] = arr;
          return next;
        });

        if (a.type === "job") {
          await supabase
            .from("jobs")
            .update({ driver_run_group: bg })
            .eq("subscriber_id", subscriberId)
            .eq("id", a.job.id);
        }
        if (a.type === "swap") {
          await supabase
            .from("jobs")
            .update({ driver_run_group: bg })
            .eq("subscriber_id", subscriberId)
            .in("id", [a.collect?.id, a.deliver?.id].filter(Boolean));
        }
        if (b.type === "job") {
          await supabase
            .from("jobs")
            .update({ driver_run_group: ag })
            .eq("subscriber_id", subscriberId)
            .eq("id", b.job.id);
        }
        if (b.type === "swap") {
          await supabase
            .from("jobs")
            .update({ driver_run_group: ag })
            .eq("subscriber_id", subscriberId)
            .in("id", [b.collect?.id, b.deliver?.id].filter(Boolean));
        }

        await loadAll();
        return;
      }

      if (a.type === "job") {
        const { error } = await supabase
          .from("jobs")
          .update({ driver_run_group: bg })
          .eq("subscriber_id", subscriberId)
          .eq("id", a.job.id);
        if (error) throw error;
      } else if (a.type === "swap") {
        const ids = [a.collect?.id, a.deliver?.id].filter(Boolean);
        const { error } = await supabase
          .from("jobs")
          .update({ driver_run_group: bg })
          .eq("subscriber_id", subscriberId)
          .in("id", ids);
        if (error) throw error;
      }

      if (b.type === "job") {
        const { error } = await supabase
          .from("jobs")
          .update({ driver_run_group: ag })
          .eq("subscriber_id", subscriberId)
          .eq("id", b.job.id);
        if (error) throw error;
      } else if (b.type === "swap") {
        const ids = [b.collect?.id, b.deliver?.id].filter(Boolean);
        const { error } = await supabase
          .from("jobs")
          .update({ driver_run_group: ag })
          .eq("subscriber_id", subscriberId)
          .in("id", ids);
        if (error) throw error;
      }

      await loadAll();
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to reorder");
    }
  }

  async function markComplete(card) {
    if (!subscriberId) return;
    setErr("");

    try {
      if (card.type === "job") {
        const j = card.job;
        const isCollection = String(j.collection_date || "") === String(date);
        const payload = isCollection
          ? { collection_actual_date: date, job_status: "collected" }
          : { delivery_actual_date: date, job_status: "delivered" };

        const { error } = await supabase
          .from("jobs")
          .update(payload)
          .eq("subscriber_id", subscriberId)
          .eq("id", j.id);
        if (error) throw error;
      } else if (card.type === "swap") {
        const updates = [];

        if (card.collect?.id) {
          updates.push(
            supabase
              .from("jobs")
              .update({ collection_actual_date: date, job_status: "collected" })
              .eq("subscriber_id", subscriberId)
              .eq("id", card.collect.id)
          );
        }
        if (card.deliver?.id) {
          updates.push(
            supabase
              .from("jobs")
              .update({ delivery_actual_date: date, job_status: "delivered" })
              .eq("subscriber_id", subscriberId)
              .eq("id", card.deliver.id)
          );
        }

        const results = await Promise.all(updates);
        const fail = results.find((r) => r.error);
        if (fail?.error) throw fail.error;
      }

      await loadAll();
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
      const { data: yRows, error: yErr } = await supabase
        .from("jobs")
        .select(
          [
            "id",
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
        .or(`scheduled_date.eq.${prevDate},collection_date.eq.${prevDate}`);
      if (yErr) throw new Error("Failed to load previous day jobs");

      const rows = (yRows || []).filter((j) => {
        const status = String(j.job_status || "");

        if (String(j.collection_date || "") === String(prevDate)) {
          if (j.collection_actual_date) return false;
          if (status === "collected" || status === "completed") return false;
          return true;
        }

        if (String(j.scheduled_date || "") === String(prevDate)) {
          if (j.delivery_actual_date) return false;
          if (status === "delivered" || status === "collected" || status === "completed") return false;
          return true;
        }

        return false;
      });

      for (const j of rows) {
        const patch = {};
        if (String(j.collection_date || "") === String(prevDate) && !j.collection_actual_date) {
          patch.collection_date = date;
        }
        if (String(j.scheduled_date || "") === String(prevDate) && !j.delivery_actual_date) {
          patch.scheduled_date = date;
        }
        if (!Object.keys(patch).length) continue;

        const { error } = await supabase
          .from("jobs")
          .update(patch)
          .eq("subscriber_id", subscriberId)
          .eq("id", j.id);
        if (error) throw error;
      }

      setRolling(false);
      await loadAll();
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to roll forward");
      setRolling(false);
    }
  }

  function onDragStart(e, card) {
    e.dataTransfer.setData("application/json", JSON.stringify(card));
  }

  function getDraggedCard(e) {
    try {
      const raw = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async function onDropToDriver(e, driverId) {
    e.preventDefault();
    const card = getDraggedCard(e);
    if (!card) return;
    await assignCardToDriver(card, driverId);
  }

  async function onDropToUnassigned(e) {
    e.preventDefault();
    const card = getDraggedCard(e);
    if (!card) return;

    if (card.type === "block") {
      const sourceDriverId = String(card._driverId || "");
      if (sourceDriverId) {
        await unassignCard(card, sourceDriverId);
      }
      return;
    }

    await unassignCard(card);
  }

  async function getTimings() {
    if (!subscriberId) return;
    setErr("");
    setComputing(true);

    try {
      const allStops = [];
      const driverPlans = {};

      for (const d of drivers || []) {
        const driverId = String(d.id);
        const list = cardsByDriverId[driverId] || [];
        driverPlans[driverId] = list;

        for (const item of list) {
          if (item.type === "block") continue;

          if (item.type === "job") {
            allStops.push({
              key: `job:${item.job.id}`,
              postcode: normalisePostcode(item.job.site_postcode || ""),
            });
          } else if (item.type === "swap") {
            const pc = normalisePostcode(
              item.deliver?.site_postcode || item.collect?.site_postcode || ""
            );
            allStops.push({
              key: cardKey(item),
              postcode: pc,
            });
          }
        }
      }

      const uniquePostcodes = Array.from(
        new Set([normalisePostcode(yardPostcode), ...allStops.map((s) => s.postcode)].filter(Boolean))
      );

      const pairs = [];
      for (const from of uniquePostcodes) {
        for (const to of uniquePostcodes) {
          if (!from || !to || from === to) continue;
          pairs.push({ key: `${from}→${to}`, from, to });
        }
      }

      let travelMinutes = {};
      if (pairs.length) {
        const resp = await fetch("/api/distance-matrix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pairs }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "Distance matrix failed");
        travelMinutes = data?.minutesByKey || {};
      }

      const yard = normalisePostcode(yardPostcode);
      const startMin = parseHmToMinutes(startTime);

      const perDriver = {};
      const perJobId = {};

      for (const d of drivers || []) {
        const driverId = String(d.id);
        const list = driverPlans[driverId] || [];

        let t = startMin + clampInt(minsVehicleChecks, 0, 600);
        let lastPc = yard;
        let hasStop = false;
        const lane = {};

        for (const item of list) {
          const key = cardKey(item);

          if (item.type === "block") {
            const bt = item.block_type || "block";

            if (bt === "return_yard") {
              const travelMins = hasStop
                ? Number(travelMinutes[`${normalisePostcode(lastPc)}→${yard}`] || 0)
                : 0;

              const arriveMin = t + (Number.isFinite(travelMins) ? travelMins : 0);
              const departMin = arriveMin + clampInt(item.duration_mins || minsReturn, 0, 600);

              lane[key] = {
                type: "block",
                block_type: bt,
                label: item.label || "Return to yard",
                arrive: minutesToHm(arriveMin),
                depart: minutesToHm(departMin),
                travel_mins: Math.round(travelMins || 0),
              };

              t = departMin + clampInt(minsBreak, 0, 600);
              lastPc = yard;
              hasStop = false;
              continue;
            }

            const arriveMin = t;
            const departMin = arriveMin + clampInt(item.duration_mins || 0, 0, 600);

            lane[key] = {
              type: "block",
              block_type: bt,
              label: item.label || "Block",
              arrive: minutesToHm(arriveMin),
              depart: minutesToHm(departMin),
              travel_mins: 0,
            };

            t = departMin + clampInt(minsBreak, 0, 600);
            continue;
          }

          let pc = "";
          let onSiteMins = 0;

          if (item.type === "job") {
            pc = normalisePostcode(item.job.site_postcode || "");
            const isCollection = String(item.job.collection_date || "") === String(date);
            onSiteMins = clampInt(isCollection ? minsCollection : minsDelivery, 0, 600);
          } else if (item.type === "swap") {
            pc = normalisePostcode(item.deliver?.site_postcode || item.collect?.site_postcode || "");
            onSiteMins = clampInt(minsSwap, 0, 600);
          }

          const tk = `${normalisePostcode(lastPc)}→${pc}`;
          const travelOk = Number(travelMinutes[tk] || 0);
          const arriveMin = t + (Number.isFinite(travelOk) ? travelOk : 0);
          const departMin = arriveMin + onSiteMins;

          lane[key] = {
            type: item.type,
            arrive: minutesToHm(arriveMin),
            depart: minutesToHm(departMin),
            travel_mins: Math.round(travelOk || 0),
          };

          t = departMin + clampInt(minsBreak, 0, 600);
          lastPc = pc;
          hasStop = true;

          if (item.type === "job") {
            const j = item.job;
            if (j?.id) {
              perJobId[String(j.id)] = {
                job_id: String(j.id),
                job_number: j.job_number || "",
                type: String(j.collection_date || "") === String(date) ? "collection" : "delivery",
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
            const pcSwap = normalisePostcode(deliver?.site_postcode || collect?.site_postcode || "");
            const addr = buildAddress(deliver || collect);

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
                postcode: pcSwap,
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
                postcode: pcSwap,
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

  const paletteItems = [
    makeBlock("return_yard", "Return to yard", minsReturn),
  ];

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
            <a href="/app/jobs" style={{ fontSize: 14, color: "#2563eb", textDecoration: "none" }}>
              ← Back to jobs
            </a>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" style={btnSecondary} onClick={() => setDate((d) => ymdAddDays(d, -1))}>◀</button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || ymdTodayLocal())} style={inputCompact} />
            <button type="button" style={btnSecondary} onClick={() => setDate((d) => ymdAddDays(d, 1))}>▶</button>
          </div>
          <button type="button" onClick={loadAll} style={btnSecondary}>Refresh</button>
        </div>
      </header>

      {(authError || err) ? <div style={alertError}>{authError || err}</div> : null}

      <section style={topStrip}>
        <div style={helpCard}>
          <div style={helpHeaderRow}>
            <div>
              <div style={helpTitle}>Run timings</div>
              <div style={helpSub}>
                Set yard postcode, driver start time, and average task minutes. Then build each run by dragging jobs and
                <strong> Return to yard</strong> blocks into the driver columns in the order the day should happen.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTimingHelp((v) => !v)}
              style={btnGhost}
            >
              {showTimingHelp ? "Hide guide" : "Show guide"}
            </button>
          </div>

          {showTimingHelp ? (
            <div style={helpSteps}>
              <div>1. Drag deliveries, collections, swaps, and return-to-yard blocks into each driver lane.</div>
              <div>2. Put them in the exact running order. Use ↑ and ↓ to fine tune.</div>
              <div>3. Set average minutes for checks, delivery, collection, swap, and return-to-yard.</div>
              <div>4. Press <strong>Get timings</strong>. The scheduler starts from the driver start time, adds checks, then travel from yard to first stop, then service time, then travel to the next item, and so on.</div>
              <div>5. Use <strong>Send messages</strong> once the run looks right.</div>
            </div>
          ) : null}

          <div style={compactTimingGrid}>
            <label style={fieldWrap}>
              <span style={fieldLabel}>Yard postcode</span>
              <input value={yardPostcode} onChange={(e) => setYardPostcode(e.target.value)} placeholder="CF33 6BN" style={inputCompact} />
            </label>

            <label style={fieldWrap}>
              <span style={fieldLabel}>Start</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputCompact} />
            </label>

            <label style={fieldWrap}>
              <span style={fieldLabel}>Checks</span>
              <input type="number" value={minsVehicleChecks} onChange={(e) => setMinsVehicleChecks(clampInt(e.target.value, 0, 600))} style={inputCompact} />
            </label>

            <label style={fieldWrap}>
              <span style={fieldLabel}>Delivery</span>
              <input type="number" value={minsDelivery} onChange={(e) => setMinsDelivery(clampInt(e.target.value, 0, 600))} style={inputCompact} />
            </label>

            <label style={fieldWrap}>
              <span style={fieldLabel}>Collection</span>
              <input type="number" value={minsCollection} onChange={(e) => setMinsCollection(clampInt(e.target.value, 0, 600))} style={inputCompact} />
            </label>

            <label style={fieldWrap}>
              <span style={fieldLabel}>Swap</span>
              <input type="number" value={minsSwap} onChange={(e) => setMinsSwap(clampInt(e.target.value, 0, 600))} style={inputCompact} />
            </label>

            <label style={fieldWrap}>
              <span style={fieldLabel}>Return yard</span>
              <input type="number" value={minsReturn} onChange={(e) => setMinsReturn(clampInt(e.target.value, 0, 600))} style={inputCompact} />
            </label>

            <label style={fieldWrap}>
              <span style={fieldLabel}>Gap after stop</span>
              <input type="number" value={minsBreak} onChange={(e) => setMinsBreak(clampInt(e.target.value, 0, 600))} style={inputCompact} />
            </label>
          </div>

          <div style={timingActionsRow}>
            <button type="button" style={btnPrimaryAlt} onClick={getTimings} disabled={computing}>
              {computing ? "Getting timings…" : "Get timings"}
            </button>

            <button
              type="button"
              style={btnPrimary}
              onClick={sendMessages}
              disabled={sending || !computed?.perJobId || Object.keys(computed.perJobId).length === 0}
            >
              {sending ? "Sending…" : "Send messages"}
            </button>

            <button type="button" style={btnSecondary} onClick={rollForwardFromYesterday} disabled={rolling}>
              {rolling ? "Rolling…" : `Roll forward unfinished from ${prevDate}`}
            </button>

            <div style={timingStatusText}>
              {computed ? `Timings last built ${new Date(computed.computedAt).toLocaleTimeString()}` : "Build timings after arranging the runs."}
            </div>
          </div>
        </div>
      </section>

      <section style={paletteRow}>
        <div style={legendRow}>
          <div style={legendChipDelivery}>Delivery</div>
          <div style={legendChipCollection}>Collection</div>
          <div style={legendChipSwap}>Swap</div>
          <div style={legendChipBlock}>Return to yard</div>
        </div>

        <div style={paletteWrap}>
          {paletteItems.map((item) => (
            <div
              key={item.block_id}
              style={paletteTile}
              draggable
              onDragStart={(e) => onDragStart(e, item)}
              title="Drag into a driver lane"
            >
              <div style={paletteTileTitle}>{item.label}</div>
              <div style={paletteTileSub}>{item.duration_mins} mins on site</div>
            </div>
          ))}
        </div>
      </section>

      {loading ? (
        <div style={centerStyle}>
          <p>Loading scheduler…</p>
        </div>
      ) : (
        <div style={boardWrap}>
          <section
            style={unassignedLane}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropToUnassigned}
          >
            <div style={laneHeader}>
              <div>
                <div style={laneTitle}>Unassigned</div>
                <div style={laneCount}>{unassignedCards.length} item(s)</div>
              </div>
            </div>

            <div style={cardsColumn}>
              {unassignedCards.length ? unassignedCards.map((c) => (
                <SchedulerCard
                  key={cardKey(c)}
                  card={c}
                  date={date}
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
                <div style={emptyLaneText}>None</div>
              )}
            </div>
          </section>

          <section style={driversScroller}>
            <div style={driversRow}>
              {(drivers || []).map((d) => {
                const driverId = String(d.id);
                const list = (cardsByDriverId[driverId] || []).map((c) =>
                  c?.type === "block" ? { ...c, _driverId: driverId } : c
                );

                return (
                  <div
                    key={d.id}
                    style={driverLane}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDropToDriver(e, d.id)}
                  >
                    <div style={laneHeader}>
                      <div>
                        <div style={laneTitle}>{driverLabel(d)}</div>
                        <div style={laneCount}>{list.length} item(s)</div>
                      </div>
                    </div>

                    <div style={cardsColumn}>
                      {list.length ? list.map((c) => (
                        <SchedulerCard
                          key={cardKey(c)}
                          card={c}
                          date={date}
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
                          onMoveUp={() => moveCardWithinDriver(c, d.id, -1)}
                          onMoveDown={() => moveCardWithinDriver(c, d.id, 1)}
                        />
                      )) : (
                        <div style={emptyLaneText}>Drop jobs or return-to-yard here</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function SchedulerCard({
  card,
  date,
  customerLabel,
  customerPhone,
  skipLabel,
  fmtGBP,
  onDragStart,
  onOpenJob,
  onComplete,
  timing,
  onUnassign,
  onMoveUp,
  onMoveDown,
}) {
  const kind = getCardKind(card, date);
  const isSwap = card.type === "swap";
  const isJob = card.type === "job";
  const isBlock = card.type === "block";

  let title = "";
  let sub = "";
  let compactMeta = "";
  let completeLabel = "Complete";

  if (isBlock) {
    title = card.label || "Block";
    sub = `${card.duration_mins || 0} mins`;
  } else if (isSwap) {
    const collect = card.collect;
    const deliver = card.deliver;
    title = `Swap ${deliver?.job_number || collect?.job_number || ""}`.trim();
    sub = customerLabel(deliver?.customer_id || collect?.customer_id);
    compactMeta = [skipLabel(deliver?.skip_type_id || collect?.skip_type_id), fmtGBP(deliver?.price_inc_vat ?? collect?.price_inc_vat)]
      .filter(Boolean)
      .join(" · ");
    completeLabel = "Complete";
  } else if (isJob) {
    const j = card.job;
    const isCollection = String(j.collection_date || "") === String(date);
    title = `${j.job_number || "Job"} · ${isCollection ? "Collection" : "Delivery"}`;
    sub = customerLabel(j.customer_id);
    compactMeta = [skipLabel(j.skip_type_id), fmtGBP(j.price_inc_vat), j.site_postcode || ""]
      .filter(Boolean)
      .join(" · ");
    completeLabel = isCollection ? "Collect" : "Deliver";
  }

  const cardStyle = getCardStyle(kind);

  return (
    <div
      style={cardStyle}
      draggable
      onDragStart={(e) => onDragStart(e, card)}
    >
      <div style={cardTopRow}>
        <div style={{ minWidth: 0 }}>
          <div style={smallBadge(kind)}>{kind === "block" ? "Yard" : title.split("·")[1]?.trim() || title.split(" ")[0]}</div>
          <div style={cardTitleCompact}>{title}</div>
          <div style={cardSubCompact}>{sub || "—"}</div>
          {compactMeta ? <div style={cardMetaCompact}>{compactMeta}</div> : null}
          {!isBlock ? (
            <div style={cardAddressCompact}>
              {isSwap ? buildAddress(card.deliver || card.collect) : buildAddress(card.job)}
            </div>
          ) : null}
          {!isBlock && (
            <div style={cardPhoneCompact}>
              {isSwap
                ? customerPhone(card.deliver?.customer_id || card.collect?.customer_id)
                : customerPhone(card.job?.customer_id)}
            </div>
          )}
        </div>

        <div style={miniButtonColumn}>
          {!isBlock ? (
            <button type="button" style={btnMini} onClick={() => onOpenJob(card)}>
              Open
            </button>
          ) : null}
          <button type="button" style={btnMini} onClick={onMoveUp}>↑</button>
          <button type="button" style={btnMini} onClick={onMoveDown}>↓</button>
        </div>
      </div>

      {timing ? (
        <div style={timingPillCompact}>
          {timing.arrive} → {timing.depart}
          {Number.isFinite(Number(timing.travel_mins)) ? ` · ${timing.travel_mins}m travel` : ""}
        </div>
      ) : null}

      <div style={cardActionRowCompact}>
        <button type="button" style={btnMini} onClick={onUnassign}>
          Unassign
        </button>
        {!isBlock ? (
          <button type="button" style={btnMiniPrimary} onClick={() => onComplete(card)}>
            {completeLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getCardStyle(kind) {
  if (kind === "delivery") {
    return {
      ...cardBaseCompact,
      background: "#eef8f1",
      border: "1px solid #cfe9d6",
    };
  }
  if (kind === "collection") {
    return {
      ...cardBaseCompact,
      background: "#edf5ff",
      border: "1px solid #cfe0fb",
    };
  }
  if (kind === "swap") {
    return {
      ...cardBaseCompact,
      background: "#fff4e9",
      border: "1px solid #f7dfc2",
    };
  }
  return {
    ...cardBaseCompact,
    background: "#f6f0ff",
    border: "1px solid #ddd0fb",
  };
}

function smallBadge(kind) {
  const map = {
    delivery: { background: "#d9f0df", color: "#2f6d42", text: "Delivery" },
    collection: { background: "#dceaff", color: "#28579e", text: "Collection" },
    swap: { background: "#ffe7cf", color: "#9a5a1c", text: "Swap" },
    block: { background: "#ece2ff", color: "#6b46c1", text: "Return yard" },
  };
  const cfg = map[kind] || map.delivery;

  return {
    display: "inline-block",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    padding: "3px 7px",
    borderRadius: 999,
    background: cfg.background,
    color: cfg.color,
    marginBottom: 6,
  };
}

const pageStyle = {
  padding: 16,
};

const centerStyle = {
  minHeight: "60vh",
  display: "grid",
  placeItems: "center",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 12,
  flexWrap: "wrap",
};

const topStrip = {
  marginBottom: 12,
};

const helpCard = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
};

const helpHeaderRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const helpTitle = {
  fontSize: 16,
  fontWeight: 800,
  color: "#111827",
};

const helpSub = {
  marginTop: 4,
  fontSize: 12,
  lineHeight: 1.45,
  color: "#4b5563",
  maxWidth: 980,
};

const helpSteps = {
  marginTop: 10,
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "#374151",
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 10,
};

const compactTimingGrid = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(8, minmax(90px, 1fr))",
  gap: 8,
};

const fieldWrap = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const fieldLabel = {
  fontSize: 11,
  color: "#6b7280",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const timingActionsRow = {
  marginTop: 12,
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const timingStatusText = {
  fontSize: 12,
  color: "#6b7280",
};

const paletteRow = {
  marginBottom: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const legendRow = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const legendChipBase = {
  fontSize: 11,
  fontWeight: 700,
  padding: "5px 9px",
  borderRadius: 999,
  border: "1px solid transparent",
};

const legendChipDelivery = {
  ...legendChipBase,
  background: "#eef8f1",
  borderColor: "#cfe9d6",
  color: "#2f6d42",
};

const legendChipCollection = {
  ...legendChipBase,
  background: "#edf5ff",
  borderColor: "#cfe0fb",
  color: "#28579e",
};

const legendChipSwap = {
  ...legendChipBase,
  background: "#fff4e9",
  borderColor: "#f7dfc2",
  color: "#9a5a1c",
};

const legendChipBlock = {
  ...legendChipBase,
  background: "#f6f0ff",
  borderColor: "#ddd0fb",
  color: "#6b46c1",
};

const paletteWrap = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const paletteTile = {
  background: "#f6f0ff",
  border: "1px solid #ddd0fb",
  borderRadius: 10,
  padding: "8px 10px",
  cursor: "grab",
  minWidth: 140,
};

const paletteTileTitle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#4c1d95",
};

const paletteTileSub = {
  fontSize: 11,
  color: "#6b7280",
  marginTop: 2,
};

const boardWrap = {
  display: "grid",
  gridTemplateColumns: "300px minmax(0, 1fr)",
  gap: 12,
  alignItems: "start",
};

const driversScroller = {
  minWidth: 0,
  overflowX: "auto",
  overflowY: "hidden",
  paddingBottom: 4,
};

const driversRow = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  minWidth: "max-content",
};

const laneBase = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 10,
  boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
  minHeight: 120,
};

const unassignedLane = {
  ...laneBase,
  position: "sticky",
  top: 0,
};

const driverLane = {
  ...laneBase,
  width: 320,
  minWidth: 320,
  maxWidth: 320,
};

const laneHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "baseline",
  marginBottom: 8,
};

const laneTitle = {
  fontSize: 15,
  fontWeight: 800,
  color: "#111827",
};

const laneCount = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 2,
};

const cardsColumn = {
  display: "grid",
  gap: 8,
};

const emptyLaneText = {
  color: "#6b7280",
  padding: 10,
  fontSize: 13,
};

const cardBaseCompact = {
  borderRadius: 10,
  padding: 9,
  display: "grid",
  gap: 8,
  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
};

const cardTopRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "flex-start",
};

const cardTitleCompact = {
  fontSize: 13,
  fontWeight: 800,
  color: "#111827",
  lineHeight: 1.25,
};

const cardSubCompact = {
  fontSize: 12,
  color: "#374151",
  marginTop: 1,
  lineHeight: 1.25,
};

const cardMetaCompact = {
  fontSize: 11,
  color: "#4b5563",
  marginTop: 3,
  lineHeight: 1.25,
};

const cardAddressCompact = {
  fontSize: 11,
  color: "#6b7280",
  marginTop: 4,
  lineHeight: 1.3,
};

const cardPhoneCompact = {
  fontSize: 11,
  color: "#2563eb",
  marginTop: 3,
};

const miniButtonColumn = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  alignItems: "flex-end",
};

const timingPillCompact = {
  fontSize: 11,
  color: "#0f172a",
  background: "rgba(255,255,255,0.75)",
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 999,
  padding: "4px 8px",
  width: "fit-content",
};

const cardActionRowCompact = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const inputCompact = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
  background: "#fff",
};

const btnPrimary = {
  border: "none",
  borderRadius: 9,
  padding: "9px 12px",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

const btnPrimaryAlt = {
  border: "none",
  borderRadius: 9,
  padding: "9px 12px",
  background: "#2563eb",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondary = {
  border: "1px solid #d1d5db",
  borderRadius: 9,
  padding: "9px 12px",
  background: "#fff",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

const btnGhost = {
  border: "1px solid #d1d5db",
  borderRadius: 9,
  padding: "8px 11px",
  background: "#fff",
  color: "#111827",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 12,
};

const btnMini = {
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 7,
  padding: "5px 7px",
  background: "rgba(255,255,255,0.85)",
  color: "#111827",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  lineHeight: 1,
};

const btnMiniPrimary = {
  border: "none",
  borderRadius: 7,
  padding: "6px 8px",
  background: "#111827",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  lineHeight: 1,
};

const alertError = {
  marginBottom: 12,
  padding: "10px 12px",
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#9f1239",
  borderRadius: 10,
};
