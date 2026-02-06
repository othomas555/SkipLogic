// pages/app/jobs/scheduler.js
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function ymdTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtGBP(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(x);
}

function buildAddress(job) {
  if (!job) return "";
  return [job.site_address_line1, job.site_address_line2, job.site_town, job.site_postcode].filter(Boolean).join(", ");
}

/**
 * Decide whether a job should appear on the schedule as "work to do".
 * Adjust this if your statuses differ.
 */
function isWorkToDo(job, selectedDate) {
  if (!job) return false;

  // If job is already completed for its leg, exclude.
  // Delivery leg is complete if delivery_actual_date exists OR status delivered/completed.
  // Collection leg is complete if collection_actual_date exists OR status collected/completed.
  const status = String(job.job_status || "");

  if (job.swap_role === "collect") {
    if (job.collection_actual_date) return false;
    if (status === "collected" || status === "completed") return false;
    // it must be due today (collection_date)
    return String(job.collection_date || "") === String(selectedDate);
  }

  // default treat as delivery leg
  if (job.delivery_actual_date) return false;
  if (status === "delivered" || status === "completed") return false;
  // it must be due today (scheduled_date)
  return String(job.scheduled_date || "") === String(selectedDate);
}

function jobRunDate(job) {
  if (!job) return "";
  return job.swap_role === "collect" ? (job.collection_date || "") : (job.scheduled_date || "");
}

function groupIntoCards(jobs, selectedDate) {
  const used = new Set();
  const cards = [];

  // Group swap legs by swap_group_id (only when BOTH legs exist on the selected date)
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

  // Everything else as single-job cards
  for (const j of jobs || []) {
    if (!j?.id) continue;
    if (used.has(String(j.id))) continue;
    if (String(jobRunDate(j)) !== String(selectedDate)) continue;
    if (!isWorkToDo(j, selectedDate)) continue;

    cards.push({ type: "job", job: j });
  }

  // Sort by driver_run_group then job number so runs look stable
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

export default function SchedulerPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [date, setDate] = useState(() => ymdTodayLocal());

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [skipTypes, setSkipTypes] = useState([]);

  const [jobs, setJobs] = useState([]);

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
      // Drivers
      const { data: dRows, error: dErr } = await supabase
        .from("drivers")
        .select("id, name, email")
        .eq("subscriber_id", subscriberId)
        .order("name", { ascending: true });

      if (dErr) throw new Error("Failed to load drivers");
      setDrivers(dRows || []);

      // Customers (labels only)
      const { data: cRows, error: cErr } = await supabase
        .from("customers")
        .select("id, first_name, last_name, company_name")
        .eq("subscriber_id", subscriberId);

      if (cErr) throw new Error("Failed to load customers");
      setCustomers(cRows || []);

      // Skip types (labels only)
      const { data: sRows, error: sErr } = await supabase
        .from("skip_types")
        .select("id, name")
        .eq("subscriber_id", subscriberId);

      if (sErr) throw new Error("Failed to load skip types");
      setSkipTypes(sRows || []);

      // Jobs for this run date (delivery or collection date)
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

  const cards = useMemo(() => groupIntoCards(jobs, date), [jobs, date]);

  const unassignedCards = useMemo(() => {
    return cards.filter((c) => {
      const driverId = c.type === "swap"
        ? (c.assigned_driver_id || "")
        : (c.job?.assigned_driver_id || "");
      return !driverId;
    });
  }, [cards]);

  const cardsByDriverId = useMemo(() => {
    const m = {};
    for (const d of drivers || []) m[String(d.id)] = [];

    for (const c of cards) {
      const driverId = c.type === "swap"
        ? (c.assigned_driver_id || "")
        : (c.job?.assigned_driver_id || "");
      if (!driverId) continue;
      if (!m[String(driverId)]) m[String(driverId)] = [];
      m[String(driverId)].push(c);
    }

    // sort within each driver column
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => {
        const ag = Number(a.driver_run_group ?? a.job?.driver_run_group ?? 999999);
        const bg = Number(b.driver_run_group ?? b.job?.driver_run_group ?? 999999);
        if (ag !== bg) return ag - bg;

        const an = String(a.job?.job_number ?? a.collect?.job_number ?? "");
        const bn = String(b.job?.job_number ?? b.collect?.job_number ?? "");
        return an.localeCompare(bn);
      });
    }

    return m;
  }, [cards, drivers]);

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
          .update({
            assigned_driver_id: driverId,
            driver_run_group: group,
          })
          .eq("subscriber_id", subscriberId)
          .in("id", ids);

        if (error) throw new Error("Failed to assign swap");
      } else {
        const id = String(card.job?.id || "");
        if (!id) return;

        const { error } = await supabase
          .from("jobs")
          .update({
            assigned_driver_id: driverId,
            driver_run_group: group,
          })
          .eq("subscriber_id", subscriberId)
          .eq("id", id);

        if (error) throw new Error("Failed to assign job");
      }

      await loadAll();
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to assign");
    }
  }

  async function unassignCard(card) {
    if (!subscriberId) return;
    setErr("");

    try {
      if (card.type === "swap") {
        const ids = [card.collect?.id, card.deliver?.id].filter(Boolean).map(String);

        const { error } = await supabase
          .from("jobs")
          .update({
            assigned_driver_id: null,
            driver_run_group: null,
          })
          .eq("subscriber_id", subscriberId)
          .in("id", ids);

        if (error) throw new Error("Failed to unassign swap");
      } else {
        const id = String(card.job?.id || "");
        if (!id) return;

        const { error } = await supabase
          .from("jobs")
          .update({
            assigned_driver_id: null,
            driver_run_group: null,
          })
          .eq("subscriber_id", subscriberId)
          .eq("id", id);

        if (error) throw new Error("Failed to unassign job");
      }

      await loadAll();
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to unassign");
    }
  }

  function onDragStart(e, card) {
    try {
      e.dataTransfer.setData("application/json", JSON.stringify({
        type: card.type,
        swap_group_id: card.swap_group_id || null,
        job_id: card.job?.id || null,
        collect_id: card.collect?.id || null,
        deliver_id: card.deliver?.id || null,
      }));
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
        const card = cards.find((c) => c.type === "swap" && String(c.swap_group_id) === String(payload.swap_group_id));
        if (card) await assignCardToDriver(card, driverId);
        return;
      }
      if (payload.type === "job") {
        const card = cards.find((c) => c.type === "job" && String(c.job?.id) === String(payload.job_id));
        if (card) await assignCardToDriver(card, driverId);
        return;
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
        const card = cards.find((c) => c.type === "swap" && String(c.swap_group_id) === String(payload.swap_group_id));
        if (card) await unassignCard(card);
        return;
      }
      if (payload.type === "job") {
        const card = cards.find((c) => c.type === "job" && String(c.job?.id) === String(payload.job_id));
        if (card) await unassignCard(card);
        return;
      }
    } catch {}
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
          <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>
            Signed in as {user.email}
          </div>
          <div style={{ marginTop: 8 }}>
            <a href="/app/jobs" style={{ fontSize: 14 }}>← Back to jobs</a>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || ymdTodayLocal())}
            style={input}
          />
          <button type="button" onClick={loadAll} style={btnSecondary}>Refresh</button>
        </div>
      </header>

      {(authError || err) ? (
        <div style={alertError}>{authError || err}</div>
      ) : null}

      {loading ? (
        <div style={cardStyle}>Loading…</div>
      ) : (
        <div style={grid}>
          {/* Unassigned */}
          <section
            style={lane}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropToUnassigned}
          >
            <div style={laneHeader}>
              <div style={{ fontWeight: 900 }}>Unassigned</div>
              <div style={{ color: "#666", fontSize: 12 }}>{unassignedCards.length} item(s)</div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {unassignedCards.length ? unassignedCards.map((c) => (
                <SchedulerCard
                  key={c.type === "swap" ? `swap:${c.swap_group_id}` : `job:${c.job.id}`}
                  card={c}
                  onDragStart={onDragStart}
                  customerLabel={customerLabel}
                  skipLabel={skipLabel}
                  fmtGBP={fmtGBP}
                />
              )) : (
                <div style={{ color: "#666", padding: 10 }}>None</div>
              )}
            </div>
          </section>

          {/* Drivers */}
          <section style={driversWrap}>
            {(drivers || []).map((d) => {
              const list = cardsByDriverId[String(d.id)] || [];
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
                        key={c.type === "swap" ? `swap:${c.swap_group_id}` : `job:${c.job.id}`}
                        card={c}
                        onDragStart={onDragStart}
                        customerLabel={customerLabel}
                        skipLabel={skipLabel}
                        fmtGBP={fmtGBP}
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

function SchedulerCard({ card, onDragStart, customerLabel, skipLabel, fmtGBP }) {
  if (!card) return null;

  if (card.type === "swap") {
    const c = card.collect;
    const d = card.deliver;

    const customerId = d?.customer_id || c?.customer_id;
    const addr = buildAddress(d || c);

    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, card)}
        style={{ ...jobCard, borderLeft: "6px solid #111" }}
        title="Swap (drag to assign)"
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={pill}>SWAP</span>
              <div style={{ fontWeight: 900 }}>
                Collect: {c?.job_number || "—"} → Deliver: {d?.job_number || "—"}
              </div>
            </div>

            <div style={{ marginTop: 6, fontSize: 13, color: "#222" }}>
              <b>Customer:</b> {customerLabel(customerId)}
            </div>

            <div style={{ marginTop: 4, color: "#555", fontSize: 13, lineHeight: 1.3 }}>
              {addr || "—"}
            </div>

            <div style={{ marginTop: 8, fontSize: 13, color: "#222", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div><b>Deliver skip:</b> {skipLabel(d?.skip_type_id)}</div>
              <div><b>Payment:</b> {d?.payment_type || c?.payment_type || "—"}</div>
            </div>
          </div>

          <div style={{ textAlign: "right", minWidth: 90 }}>
            <div style={{ fontWeight: 900 }}>{fmtGBP(d?.price_inc_vat)}</div>
            <div style={{ marginTop: 6, color: "#777", fontSize: 12 }}>
              group {String(card.driver_run_group ?? "—")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const j = card.job;
  const addr = buildAddress(j);

  const typeLabel = j?.swap_role === "collect" ? "COLLECTION" : "DELIVERY";

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card)}
      style={jobCard}
      title="Drag to assign"
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={pill}>{typeLabel}</span>
            <div style={{ fontWeight: 900 }}>{j?.job_number || "Job"}</div>
          </div>

          <div style={{ marginTop: 6, fontSize: 13, color: "#222" }}>
            <b>Customer:</b> {customerLabel(j?.customer_id)}
          </div>

          <div style={{ marginTop: 4, color: "#555", fontSize: 13, lineHeight: 1.3 }}>
            {addr || "—"}
          </div>

          <div style={{ marginTop: 8, fontSize: 13, color: "#222", display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div><b>Skip:</b> {skipLabel(j?.skip_type_id)}</div>
            <div><b>Payment:</b> {j?.payment_type || "—"}</div>
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 90 }}>
          <div style={{ fontWeight: 900 }}>{fmtGBP(j?.price_inc_vat)}</div>
          <div style={{ marginTop: 6, color: "#777", fontSize: 12 }}>
            group {String(j?.driver_run_group ?? "—")}
          </div>
        </div>
      </div>
    </div>
  );
}

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

const jobCard = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
  cursor: "grab",
};

const pill = {
  display: "inline-block",
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid #e0e0e0",
  background: "#fafafa",
  color: "#333",
  fontWeight: 900,
};

const input = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ccc",
  fontSize: 14,
  background: "#fff",
};

const btnSecondary = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
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
