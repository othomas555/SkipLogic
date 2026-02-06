// pages/driver/work.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

function ymd(d) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function openGoogleMaps(job) {
  const addr = buildAddress(job);
  if (!addr) return;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * A "work item" is what we render in driver/run.
 * - job: one job row
 * - swap: one card representing two linked jobs (collect + deliver)
 * - yard_break / driver_break: as before
 */
function stableItemsFingerprint(items, jobsById, swapByGroup) {
  const minimal = (Array.isArray(items) ? items : []).map((it) => {
    if (!it || typeof it !== "object") return { bad: true };

    if (it.type === "swap") {
      const g = swapByGroup?.[String(it.swap_group_id)];
      const c = g?.collect ? jobsById?.[String(g.collect.id)] : null;
      const d = g?.deliver ? jobsById?.[String(g.deliver.id)] : null;
      return {
        type: "swap",
        swap_group_id: it.swap_group_id,
        collect_job_number: c?.job_number,
        deliver_job_number: d?.job_number,
        collect_status: c?.job_status,
        deliver_status: d?.job_status,
        collect_date: c?.collection_date,
        deliver_date: d?.scheduled_date,
        collect_actual: c?.collection_actual_date || null,
        deliver_actual: d?.delivery_actual_date || null,
      };
    }

    if (it.type !== "job") return { type: it.type };

    const j = it.job_id ? jobsById?.[String(it.job_id)] : null;
    return {
      type: "job",
      job_id: it.job_id,
      job_number: j?.job_number,
      job_status: j?.job_status,
      scheduled_date: j?.scheduled_date,
      collection_date: j?.collection_date,
      delivery_actual_date: j?.delivery_actual_date || null,
      collection_actual_date: j?.collection_actual_date || null,
      swap_group_id: j?.swap_group_id || null,
      swap_role: j?.swap_role || null,
    };
  });

  return JSON.stringify(minimal);
}

export default function DriverWorkPage() {
  const router = useRouter();

  const today = useMemo(() => ymd(new Date()), []);
  const [date, setDate] = useState(today);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [jobsById, setJobsById] = useState({});
  const [err, setErr] = useState("");

  const [tab, setTab] = useState("run"); // run | deliveries | collections | all | completed
  const [hasUpdate, setHasUpdate] = useState(false);
  const lastFingerprintRef = useRef("");

  const [actingKey, setActingKey] = useState(""); // jobId OR `swap:${swapGroupId}`
  const [toast, setToast] = useState("");

  // photo state per key (jobId OR swap:groupId)
  const [photoFilesByKey, setPhotoFilesByKey] = useState({}); // { [key]: { delivered?, collected?, swap_full?, swap_empty? } }

  function setKeyPhoto(key, kind, file) {
    setPhotoFilesByKey((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [kind]: file || null,
      },
    }));
  }

  function isCompletedJob(j) {
    if (!j) return false;
    if (j.delivery_actual_date) return true;
    if (j.collection_actual_date) return true;
    if (String(j.job_status || "") === "completed") return true;
    // Some systems mark delivered/collected as "done" for that leg
    if (String(j.job_status || "") === "delivered") return true;
    if (String(j.job_status || "") === "collected") return true;
    return false;
  }

  async function load({ silent = false } = {}) {
    if (!silent) {
      setErr("");
      setLoading(true);
    }

    try {
      const includeCompleted = tab === "completed";
      const url = `/api/driver/jobs?date=${encodeURIComponent(date)}${includeCompleted ? "&include_completed=1" : ""}`;

      const res = await fetch(url);
      if (res.status === 401) {
        router.replace("/driver");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErr(json?.error || "Failed to load jobs");
        setLoading(false);
        return;
      }

      const nextItems = Array.isArray(json.items) ? json.items : [];
      const nextJobsById = json.jobsById && typeof json.jobsById === "object" ? json.jobsById : {};

      setItems(nextItems);
      setJobsById(nextJobsById);

      setLoading(false);
    } catch {
      setErr("Failed to load jobs");
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, tab]);

  useEffect(() => {
    const t = setInterval(() => load({ silent: true }), 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, tab]);

  /**
   * Build swap groups from jobsById.
   * We group swaps where we can see both roles:
   * - collect: swap_role === "collect"
   * - deliver: swap_role === "deliver"
   */
  const swapByGroup = useMemo(() => {
    const m = {};
    for (const jid of Object.keys(jobsById || {})) {
      const j = jobsById[jid];
      if (!j?.swap_group_id) continue;

      const g = String(j.swap_group_id);
      if (!m[g]) m[g] = { swap_group_id: g, collect: null, deliver: null };

      if (j.swap_role === "collect") m[g].collect = j;
      if (j.swap_role === "deliver") m[g].deliver = j;
    }
    return m;
  }, [jobsById]);

  function isCollectDue(j) {
    if (!j) return false;
    if (String(j.collection_date || "") !== String(date)) return false;
    if (j.collection_actual_date) return false;
    if (String(j.job_status || "") === "collected" || String(j.job_status || "") === "completed") return false;
    return true;
  }

  function isDeliverDue(j) {
    if (!j) return false;
    if (String(j.scheduled_date || "") !== String(date)) return false;
    if (j.delivery_actual_date) return false;
    if (String(j.job_status || "") === "delivered" || String(j.job_status || "") === "completed") return false;
    return true;
  }

  /**
   * Convert raw items -> grouped items (swap becomes one card).
   * Keep breaks in the run ordering.
   *
   * For COMPLETED tab:
   * - collapse swaps when BOTH legs are completed.
   */
  const groupedItems = useMemo(() => {
    const out = [];
    const seenSwap = new Set();

    const isCompletedView = tab === "completed";

    for (const it of items || []) {
      if (!it || typeof it !== "object") continue;

      if (it.type !== "job") {
        // In completed view, breaks aren’t useful; hide them
        if (!isCompletedView) out.push(it);
        continue;
      }

      const j = it.job_id ? jobsById[String(it.job_id)] : null;
      if (!j) continue;

      // Swap grouping
      if (j.swap_group_id) {
        const gId = String(j.swap_group_id);
        const g = swapByGroup[gId];

        const c = g?.collect || null;
        const d = g?.deliver || null;

        if (c && d) {
          if (isCompletedView) {
            const swapCompleted = isCompletedJob(c) && isCompletedJob(d);
            if (swapCompleted) {
              if (!seenSwap.has(gId)) {
                seenSwap.add(gId);
                out.push({ type: "swap_completed", swap_group_id: gId });
              }
              continue; // hide individual legs in completed view
            }
          } else {
            const swapIsRenderable = isCollectDue(c) && isDeliverDue(d);
            if (swapIsRenderable) {
              if (!seenSwap.has(gId)) {
                seenSwap.add(gId);
                out.push({ type: "swap", swap_group_id: gId });
              }
              continue; // hide individual legs
            }
          }
        }
      }

      // Normal job row
      out.push({ type: "job", job_id: it.job_id });
    }

    // For completed view: only keep completed jobs (and completed swaps)
    if (isCompletedView) {
      return out.filter((it) => {
        if (it.type === "swap_completed") return true;
        if (it.type !== "job") return false;
        const j = jobsById[String(it.job_id)];
        return isCompletedJob(j);
      });
    }

    return out;
  }, [items, jobsById, swapByGroup, date, tab]);

  // Fingerprint/update banner (ignore in completed view)
  useEffect(() => {
    if (tab === "completed") return;
    const fp = stableItemsFingerprint(groupedItems, jobsById, swapByGroup);
    if (!lastFingerprintRef.current) lastFingerprintRef.current = fp;
    else if (fp !== lastFingerprintRef.current) setHasUpdate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedItems, jobsById, tab]);

  async function applyUpdateNow() {
    setHasUpdate(false);
    await load({ silent: false });
    lastFingerprintRef.current = stableItemsFingerprint(groupedItems, jobsById, swapByGroup);
  }

  async function hardRefresh() {
    setHasUpdate(false);
    await load({ silent: false });
    lastFingerprintRef.current = stableItemsFingerprint(groupedItems, jobsById, swapByGroup);
  }

  async function logout() {
    await fetch("/api/driver/logout", { method: "POST" }).catch(() => {});
    router.replace("/driver");
  }

  async function uploadOne(jobId, kind, file) {
    if (!file) return null;
    const res = await fetch(
      `/api/driver/upload-photo?job_id=${encodeURIComponent(jobId)}&kind=${encodeURIComponent(kind)}`,
      {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      }
    );

    if (res.status === 401) {
      router.replace("/driver");
      return null;
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json?.error || "Upload failed");
    return { kind, url: json.url, path: json.path };
  }

  async function completeSwap(swapGroupId) {
    const gId = String(swapGroupId);
    const g = swapByGroup[gId];
    const c = g?.collect || null;
    const d = g?.deliver || null;

    if (!c || !d) return setErr("Swap missing jobs (collect/deliver). Refresh.");

    // hard require both due today (keeps it clean)
    if (!isCollectDue(c) || !isDeliverDue(d)) {
      return setErr("This swap is not due today (or already completed).");
    }

    const key = `swap:${gId}`;
    const kindSet = photoFilesByKey[key] || {};

    setToast("");
    setErr("");

    if (!kindSet.swap_full || !kindSet.swap_empty) {
      return setErr("Photos required for swap: full skip + empty skip.");
    }

    const ok = confirm(
      `Are you sure?\n\nSWAP\nCollect: ${c.job_number || ""}\nDeliver: ${d.job_number || ""}\n${buildAddress(d || c)}`
    );
    if (!ok) return;

    setActingKey(key);

    try {
      // Upload photos against sensible job ids:
      // - swap_full belongs to collection leg
      // - swap_empty belongs to delivery leg
      const uploads = [];
      uploads.push(await uploadOne(String(c.id), "swap_full", kindSet.swap_full));
      uploads.push(await uploadOne(String(d.id), "swap_empty", kindSet.swap_empty));
      const photos = uploads.filter(Boolean);

      const res = await fetch("/api/driver/complete-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "swap",
          date,
          collect_job_id: c.id,
          deliver_job_id: d.id,
          photos,
        }),
      });

      if (res.status === 401) {
        router.replace("/driver");
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || "Could not mark swap complete");

      setToast("Swap marked complete.");
      setActingKey("");
      await hardRefresh();
    } catch (e) {
      setErr(e?.message || "Could not mark swap complete");
      setActingKey("");
    }
  }

  async function completeSingleJob(job) {
    if (!job?.id) return;

    setToast("");
    setErr("");

    const jobId = String(job.id);
    const kindSet = photoFilesByKey[jobId] || {};

    // Determine type: rely on swap_role / dates
    const isCollect =
      job.swap_role === "collect" ||
      (!!job.collection_date && String(job.collection_date) === String(date) && !job.collection_actual_date);
    const isDeliver = !isCollect;

    // Require files
    if (isDeliver) {
      if (!kindSet.delivered) return setErr("Photo required: delivered (take a photo of the skip after it is dropped).");
    } else {
      if (!kindSet.collected) return setErr("Photo required: collected (take a photo of the skip before lifting).");
    }

    const ok = confirm(`Are you sure?\n\n${job.job_number || ""}\n${buildAddress(job)}`);
    if (!ok) return;

    setActingKey(jobId);

    try {
      const uploads = [];
      if (isDeliver) uploads.push(await uploadOne(jobId, "delivered", kindSet.delivered));
      else uploads.push(await uploadOne(jobId, "collected", kindSet.collected));

      const photos = uploads.filter(Boolean);

      const res = await fetch("/api/driver/complete-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.id,
          date,
          job_type: isDeliver ? "delivery" : "collection",
          photos,
        }),
      });

      if (res.status === 401) {
        router.replace("/driver");
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || "Could not mark complete");

      setToast("Marked complete.");
      setActingKey("");
      await hardRefresh();
    } catch (e) {
      setErr(e?.message || "Could not mark complete");
      setActingKey("");
    }
  }

  const shown = useMemo(() => {
    // For tabs: treat swap as both delivery+collection
    if (tab === "completed") {
      return groupedItems;
    }

    if (tab === "deliveries") {
      return groupedItems.filter((it) => {
        if (it.type === "swap") return true;
        if (it.type !== "job") return false;
        const j = jobsById[String(it.job_id)];
        return isDeliverDue(j);
      });
    }

    if (tab === "collections") {
      return groupedItems.filter((it) => {
        if (it.type === "swap") return true;
        if (it.type !== "job") return false;
        const j = jobsById[String(it.job_id)];
        return isCollectDue(j);
      });
    }

    if (tab === "all") {
      return groupedItems.filter((it) => it.type === "job" || it.type === "swap");
    }

    return groupedItems;
  }, [tab, groupedItems, jobsById, date]);

  const deliveriesCount = useMemo(() => {
    let n = 0;
    for (const it of groupedItems) {
      if (it.type === "swap") n += 1;
      else if (it.type === "job") {
        const j = jobsById[String(it.job_id)];
        if (isDeliverDue(j)) n += 1;
      }
    }
    return n;
  }, [groupedItems, jobsById, date]);

  const collectionsCount = useMemo(() => {
    let n = 0;
    for (const it of groupedItems) {
      if (it.type === "swap") n += 1;
      else if (it.type === "job") {
        const j = jobsById[String(it.job_id)];
        if (isCollectDue(j)) n += 1;
      }
    }
    return n;
  }, [groupedItems, jobsById, date]);

  const completedCount = useMemo(() => {
    let n = 0;
    const seenSwap = new Set();

    for (const jid of Object.keys(jobsById || {})) {
      const j = jobsById[jid];
      if (!j) continue;

      if (j.swap_group_id) {
        const gId = String(j.swap_group_id);
        const g = swapByGroup[gId];
        const c = g?.collect || null;
        const d = g?.deliver || null;
        if (c && d && isCompletedJob(c) && isCompletedJob(d)) {
          if (!seenSwap.has(gId)) {
            seenSwap.add(gId);
            n += 1;
          }
          continue;
        }
      }

      if (isCompletedJob(j)) n += 1;
    }

    return n;
  }, [jobsById, swapByGroup]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <TopNav current="work" onLogout={logout} />
        <div style={cardStyle}>Loading…</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <TopNav current="work" onLogout={logout} />

      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Driver run</h1>
          <div style={{ color: "#555", marginTop: 4 }}>{date}</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || today)} style={dateInput} />
          <button onClick={hardRefresh} style={btnSecondary} type="button">
            Refresh
          </button>
        </div>
      </header>

      {hasUpdate && tab !== "completed" ? (
        <div style={bannerUpdate}>
          <div>
            <div style={{ fontWeight: 900 }}>Schedule updated</div>
            <div style={{ color: "#444", fontSize: 13, marginTop: 2 }}>The office changed your run. Tap to refresh.</div>
          </div>
          <button onClick={applyUpdateNow} style={btnPrimary} type="button">
            Update now
          </button>
        </div>
      ) : null}

      {toast ? <div style={alertOk}>{toast}</div> : null}
      {err ? <div style={alertError}>{err}</div> : null}

      <div style={tabsRow}>
        <TabButton active={tab === "run"} onClick={() => setTab("run")}>
          Run ({groupedItems.filter((x) => x.type === "job" || x.type === "swap" || x.type === "yard_break" || x.type === "driver_break").length})
        </TabButton>
        <TabButton active={tab === "deliveries"} onClick={() => setTab("deliveries")}>
          Deliveries ({deliveriesCount})
        </TabButton>
        <TabButton active={tab === "collections"} onClick={() => setTab("collections")}>
          Collections ({collectionsCount})
        </TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>
          All
        </TabButton>
        <TabButton active={tab === "completed"} onClick={() => setTab("completed")}>
          Completed ({completedCount})
        </TabButton>
      </div>

      <section style={cardStyle}>
        {!shown.length ? (
          <div style={{ color: "#666" }}>None</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {shown.map((it, idx) => {
              if (!it || typeof it !== "object") return null;

              if (it.type === "yard_break") {
                return (
                  <div key={`yb:${idx}`} style={{ ...jobCard, borderStyle: "dashed" }}>
                    <div style={{ fontWeight: 900 }}>Return to yard / Tip return</div>
                  </div>
                );
              }

              if (it.type === "driver_break") {
                return (
                  <div key={`db:${idx}`} style={{ ...jobCard, borderStyle: "dashed" }}>
                    <div style={{ fontWeight: 900 }}>Break</div>
                  </div>
                );
              }

              if (it.type === "swap") {
                const gId = String(it.swap_group_id);
                const g = swapByGroup[gId];
                const c = g?.collect || null;
                const d = g?.deliver || null;

                const key = `swap:${gId}`;
                const busy = actingKey === key;
                const photos = photoFilesByKey[key] || {};

                return (
                  <SwapCard
                    key={`swap:${gId}:${idx}`}
                    collect={c}
                    deliver={d}
                    index={idx + 1}
                    showIndex={tab === "run"}
                    busy={busy}
                    photos={photos}
                    onSetPhoto={(kind, file) => setKeyPhoto(key, kind, file)}
                    onNavigate={() => openGoogleMaps(d || c)}
                    onComplete={() => completeSwap(gId)}
                    readOnly={false}
                  />
                );
              }

              if (it.type === "swap_completed") {
                const gId = String(it.swap_group_id);
                const g = swapByGroup[gId];
                const c = g?.collect || null;
                const d = g?.deliver || null;

                return (
                  <SwapCard
                    key={`swap_completed:${gId}:${idx}`}
                    collect={c}
                    deliver={d}
                    index={idx + 1}
                    showIndex={false}
                    busy={false}
                    photos={{}}
                    onSetPhoto={() => {}}
                    onNavigate={() => openGoogleMaps(d || c)}
                    onComplete={() => {}}
                    readOnly={true}
                  />
                );
              }

              if (it.type === "job") {
                const job = jobsById[String(it.job_id)] || null;
                if (!job) return null;

                const key = String(job.id);
                const busy = actingKey === key;
                const photos = photoFilesByKey[key] || {};

                const readOnly = tab === "completed" && isCompletedJob(job);

                return (
                  <JobCard
                    key={String(it.job_id) + ":" + idx}
                    job={job}
                    index={idx + 1}
                    showIndex={tab === "run"}
                    busy={busy}
                    photos={photos}
                    onSetPhoto={(kind, file) => setKeyPhoto(String(job.id), kind, file)}
                    onNavigate={() => openGoogleMaps(job)}
                    onComplete={() => completeSingleJob(job)}
                    date={date}
                    readOnly={readOnly}
                  />
                );
              }

              return null;
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function TopNav({ current, onLogout }) {
  const router = useRouter();
  return (
    <div style={topNav}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.push("/driver/work")} style={current === "work" ? navBtnActive : navBtn}>
          Run
        </button>
        <button type="button" onClick={() => router.push("/driver/checks")} style={current === "checks" ? navBtnActive : navBtn}>
          Vehicle checks
        </button>
        <button type="button" onClick={() => router.push("/driver/menu")} style={navBtn}>
          Menu
        </button>
      </div>
      <button type="button" onClick={onLogout} style={navBtnDanger}>
        Logout
      </button>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={active ? tabBtnActive : tabBtn}>
      {children}
    </button>
  );
}

function SwapCard({ collect, deliver, index, showIndex, onNavigate, onComplete, busy, photos, onSetPhoto, readOnly }) {
  const addr = buildAddress(deliver || collect);
  const price = deliver?.price_inc_vat;

  const cDone = collect?.collection_actual_date || (collect?.job_status === "collected" || collect?.job_status === "completed");
  const dDone = deliver?.delivery_actual_date || (deliver?.job_status === "delivered" || deliver?.job_status === "completed");

  return (
    <div style={{ ...jobCard, borderLeft: "6px solid #111", opacity: readOnly ? 0.85 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {showIndex ? <span style={pillIndex}>{index}</span> : null}
            <div style={{ fontWeight: 900 }}>SWAP</div>
            <span style={pillType}>{readOnly ? "Completed" : "Tip return (swap)"}</span>
          </div>

          <div style={{ marginTop: 6, color: "#111", fontWeight: 800 }}>
            Collect: {collect?.job_number || "—"} → Deliver: {deliver?.job_number || "—"}
          </div>

          <div style={{ marginTop: 4, color: "#555", lineHeight: 1.3 }}>{addr || "—"}</div>

          <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, color: "#222" }}>
            <div>
              <b>Payment:</b> {deliver?.payment_type || collect?.payment_type || "—"}
            </div>
            <div>
              <b>New skip:</b> {deliver?.skip_type_name || "—"}
            </div>
            {readOnly ? (
              <>
                <div>
                  <b>Collected:</b> {cDone ? "Yes" : "No"}
                </div>
                <div>
                  <b>Delivered:</b> {dDone ? "Yes" : "No"}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 90 }}>
          <div style={{ fontWeight: 900 }}>{fmtGBP(price)}</div>
          {(collect?.job_status || deliver?.job_status) ? (
            <div style={{ marginTop: 6, color: "#777", fontSize: 12 }}>
              {collect?.job_status || deliver?.job_status}
            </div>
          ) : null}
        </div>
      </div>

      {!readOnly ? (
        <>
          <div style={photoBox}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Required photos</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={photoRow}>
                <div style={{ fontWeight: 900 }}>Photo of full skip</div>
                <div style={{ fontSize: 12, color: "#555" }}>Take a photo of the full skip before lifting.</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onSetPhoto("swap_full", e.target.files?.[0] || null)}
                  style={{ marginTop: 6 }}
                />
                <div style={{ fontSize: 12, color: photos?.swap_full ? "#1f6b2a" : "#8a1f1f", marginTop: 4 }}>
                  {photos?.swap_full ? "Selected ✓" : "Not selected"}
                </div>
              </label>

              <label style={photoRow}>
                <div style={{ fontWeight: 900 }}>Photo of empty skip</div>
                <div style={{ fontSize: 12, color: "#555" }}>Take a photo of the empty skip after drop.</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onSetPhoto("swap_empty", e.target.files?.[0] || null)}
                  style={{ marginTop: 6 }}
                />
                <div style={{ fontSize: 12, color: photos?.swap_empty ? "#1f6b2a" : "#8a1f1f", marginTop: 4 }}>
                  {photos?.swap_empty ? "Selected ✓" : "Not selected"}
                </div>
              </label>
            </div>
          </div>

          <div style={actionsRow}>
            <button type="button" style={btnSecondarySmall} onClick={onNavigate} disabled={!addr}>
              Navigate
            </button>
            <button type="button" style={btnPrimarySmall} onClick={onComplete} disabled={busy}>
              {busy ? "Working…" : "Mark complete"}
            </button>
          </div>
        </>
      ) : (
        <div style={actionsRow}>
          <button type="button" style={btnSecondarySmall} onClick={onNavigate} disabled={!addr}>
            Navigate
          </button>
        </div>
      )}
    </div>
  );
}

function JobCard({ job, index, showIndex, onNavigate, onComplete, busy, photos, onSetPhoto, date, readOnly }) {
  const isCollect =
    job.swap_role === "collect" ||
    (!!job.collection_date && String(job.collection_date) === String(date) && !job.collection_actual_date);
  const typeLabel = isCollect ? "Collection" : "Delivery";

  const completedAt = isCollect ? job.collection_actual_date : job.delivery_actual_date;

  // Photo requirements
  const req = isCollect
    ? [{ kind: "collected", label: "Photo before collection", hint: "Take a photo of the skip before lifting." }]
    : [{ kind: "delivered", label: "Photo after delivery", hint: "Take a photo of the skip once it’s dropped." }];

  if (!job) return <div style={jobCard}><div style={{ fontWeight: 900 }}>Job missing</div></div>;

  return (
    <div style={{ ...jobCard, opacity: readOnly ? 0.85 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {showIndex ? <span style={pillIndex}>{index}</span> : null}
            <div style={{ fontWeight: 900 }}>{job.job_number || "Job"}</div>
            <span style={pillType}>{readOnly ? "Completed" : typeLabel}</span>
          </div>

          <div style={{ marginTop: 6, color: "#111", fontWeight: 800 }}>{job.site_name || "—"}</div>
          <div style={{ marginTop: 4, color: "#555", lineHeight: 1.3 }}>
            {[job.site_address_line1, job.site_address_line2, job.site_town, job.site_postcode].filter(Boolean).join(", ")}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, color: "#222" }}>
            <div><b>Payment:</b> {job.payment_type || "—"}</div>
            <div><b>Skip:</b> {job.skip_type_name || "—"}</div>
            {readOnly ? (
              <div><b>Done:</b> {completedAt || job.job_status || "Yes"}</div>
            ) : null}
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 90 }}>
          <div style={{ fontWeight: 900 }}>{fmtGBP(job.price_inc_vat)}</div>
          {job.job_status ? <div style={{ marginTop: 6, color: "#777", fontSize: 12 }}>{job.job_status}</div> : null}
        </div>
      </div>

      {job.notes ? (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 900 }}>Notes</summary>
          <div style={notesBox}>{job.notes}</div>
        </details>
      ) : null}

      {!readOnly ? (
        <>
          <div style={photoBox}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Required photos</div>
            <div style={{ display: "grid", gap: 10 }}>
              {req.map((r) => (
                <label key={r.kind} style={photoRow}>
                  <div style={{ fontWeight: 900 }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{r.hint}</div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => onSetPhoto(r.kind, e.target.files?.[0] || null)}
                    style={{ marginTop: 6 }}
                  />
                  <div style={{ fontSize: 12, color: photos?.[r.kind] ? "#1f6b2a" : "#8a1f1f", marginTop: 4 }}>
                    {photos?.[r.kind] ? "Selected ✓" : "Not selected"}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={actionsRow}>
            <button type="button" style={btnSecondarySmall} onClick={onNavigate} disabled={!buildAddress(job)}>
              Navigate
            </button>
            <button type="button" style={btnPrimarySmall} onClick={onComplete} disabled={busy}>
              {busy ? "Working…" : "Mark complete"}
            </button>
          </div>
        </>
      ) : (
        <div style={actionsRow}>
          <button type="button" style={btnSecondarySmall} onClick={onNavigate} disabled={!buildAddress(job)}>
            Navigate
          </button>
        </div>
      )}
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 14,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f6f6f6",
};

const topNav = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" };
const navBtn = { padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 900 };
const navBtnActive = { ...navBtn, border: "1px solid #111" };
const navBtnDanger = { padding: "10px 12px", borderRadius: 12, border: 0, background: "#111", color: "#fff", cursor: "pointer", fontWeight: 900 };

const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, flexWrap: "wrap", marginBottom: 10 };
const dateInput = { padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "#fff" };
const btnSecondary = { padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 900 };
const btnPrimary = { padding: "10px 12px", borderRadius: 12, border: 0, background: "#111", color: "#fff", cursor: "pointer", fontWeight: 900 };

const bannerUpdate = { border: "1px solid #f0b4b4", background: "#fff5f5", color: "#111", borderRadius: 12, padding: 12, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 12 };

const alertError = { padding: 12, borderRadius: 12, border: "1px solid #f0b4b4", background: "#fff5f5", color: "#8a1f1f", marginBottom: 12, whiteSpace: "pre-wrap" };
const alertOk = { padding: 12, borderRadius: 12, border: "1px solid #bfe7c0", background: "#f2fff2", color: "#1f6b2a", marginBottom: 12, whiteSpace: "pre-wrap" };

const tabsRow = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 };
const tabBtn = { padding: "10px 12px", borderRadius: 999, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 900 };
const tabBtnActive = { ...tabBtn, border: "1px solid #111" };

const cardStyle = { background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" };
const jobCard = { border: "1px solid #eee", borderRadius: 12, padding: 12 };

const pillIndex = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 999, border: "1px solid #111", fontWeight: 900, fontSize: 12 };
const pillType = { display: "inline-block", fontSize: 11, padding: "3px 8px", borderRadius: 999, border: "1px solid #e0e0e0", background: "#fafafa", color: "#333", fontWeight: 900 };

const notesBox = { marginTop: 8, background: "#fafafa", border: "1px solid #eee", borderRadius: 10, padding: 10, whiteSpace: "pre-wrap" };

const actionsRow = { marginTop: 10, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" };
const btnSecondarySmall = { padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 900 };
const btnPrimarySmall = { padding: "10px 12px", borderRadius: 12, border: 0, background: "#111", color: "#fff", cursor: "pointer", fontWeight: 900 };

const photoBox = { marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fafafa" };
const photoRow = { display: "block" };
