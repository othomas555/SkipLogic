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

function stableItemsFingerprint(items, jobsById) {
  const minimal = (Array.isArray(items) ? items : []).map((it) => {
    if (!it || typeof it !== "object") return { bad: true };
    if (it.type !== "job") return { type: it.type };
    const j = it.job_id ? jobsById?.[String(it.job_id)] : null;
    return {
      type: "job",
      job_id: it.job_id,
      job_number: j?.job_number,
      job_status: j?.job_status,
      scheduled_date: j?.scheduled_date,
      collection_date: j?.collection_date,
    };
  });
  return JSON.stringify(minimal);
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

export default function DriverWorkPage() {
  const router = useRouter();

  const today = useMemo(() => ymd(new Date()), []);
  const [date, setDate] = useState(today);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [jobsById, setJobsById] = useState({});
  const [err, setErr] = useState("");

  const [tab, setTab] = useState("run");
  const [hasUpdate, setHasUpdate] = useState(false);
  const lastFingerprintRef = useRef("");

  const [actingJobId, setActingJobId] = useState("");
  const [toast, setToast] = useState("");

  // photo state per job
  const [photoFilesByJob, setPhotoFilesByJob] = useState({}); // { [jobId]: { delivered?: File, collected?: File, swap_full?: File, swap_empty?: File } }

  function setJobPhoto(jobId, kind, file) {
    setPhotoFilesByJob((prev) => ({
      ...prev,
      [jobId]: {
        ...(prev[jobId] || {}),
        [kind]: file || null,
      },
    }));
  }

  async function load({ silent = false } = {}) {
    if (!silent) {
      setErr("");
      setLoading(true);
    }

    try {
      const res = await fetch(`/api/driver/jobs?date=${encodeURIComponent(date)}`);
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

      const fp = stableItemsFingerprint(nextItems, nextJobsById);
      if (!lastFingerprintRef.current) lastFingerprintRef.current = fp;
      else if (fp !== lastFingerprintRef.current) setHasUpdate(true);

      setItems(nextItems);
      setJobsById(nextJobsById);
      setLoading(false);
    } catch {
      setErr("Failed to load jobs");
      setLoading(false);
    }
  }

  async function applyUpdateNow() {
    setHasUpdate(false);
    await load({ silent: false });
    lastFingerprintRef.current = stableItemsFingerprint(items, jobsById);
  }

  async function hardRefresh() {
    setHasUpdate(false);
    await load({ silent: false });
    lastFingerprintRef.current = stableItemsFingerprint(items, jobsById);
  }

  async function logout() {
    await fetch("/api/driver/logout", { method: "POST" }).catch(() => {});
    router.replace("/driver");
  }

  async function uploadOne(jobId, kind, file) {
    if (!file) return null;
    const res = await fetch(`/api/driver/upload-photo?job_id=${encodeURIComponent(jobId)}&kind=${encodeURIComponent(kind)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });

    if (res.status === 401) {
      router.replace("/driver");
      return null;
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json?.error || "Upload failed");
    return { kind, url: json.url, path: json.path };
  }

  async function markComplete(job) {
    if (!job?.id) return;

    setToast("");
    setErr("");

    const jobId = String(job.id);
    const kindSet = photoFilesByJob[jobId] || {};
    const t = job.type;

    // Require files before confirmation (clear UX)
    if (t === "delivery") {
      if (!kindSet.delivered) return setErr("Photo required: delivered (take a photo of the skip after it is dropped).");
    } else if (t === "collection") {
      if (!kindSet.collected) return setErr("Photo required: collected (take a photo of the skip before lifting).");
    } else if (t === "delivery+collection") {
      if (!kindSet.swap_full || !kindSet.swap_empty) return setErr("Photos required for tip return: full skip + empty skip.");
    } else {
      return setErr("Cannot complete: unknown job type.");
    }

    const ok = confirm(`Are you sure?\n\n${job.job_number || ""}\n${buildAddress(job)}`);
    if (!ok) return;

    setActingJobId(jobId);

    try {
      // Upload required photos
      const uploads = [];

      if (t === "delivery") {
        uploads.push(await uploadOne(jobId, "delivered", kindSet.delivered));
      } else if (t === "collection") {
        uploads.push(await uploadOne(jobId, "collected", kindSet.collected));
      } else if (t === "delivery+collection") {
        uploads.push(await uploadOne(jobId, "swap_full", kindSet.swap_full));
        uploads.push(await uploadOne(jobId, "swap_empty", kindSet.swap_empty));
      }

      const photos = uploads.filter(Boolean);

      // Complete job (server enforces photo rule too)
      const res = await fetch("/api/driver/complete-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id, date, job_type: t, photos }),
      });

      if (res.status === 401) {
        router.replace("/driver");
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || "Could not mark complete");

      setToast("Marked complete.");
      setActingJobId("");
      await hardRefresh();
    } catch (e) {
      setErr(e?.message || "Could not mark complete");
      setActingJobId("");
    }
  }

  useEffect(() => {
    load({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    const t = setInterval(() => load({ silent: true }), 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const jobItems = useMemo(() => (items || []).filter((it) => it && typeof it === "object" && it.type === "job" && it.job_id), [items]);

  const deliveries = useMemo(() => jobItems.filter((it) => {
    const j = jobsById[String(it.job_id)];
    return j?.type === "delivery" || j?.type === "delivery+collection";
  }), [jobItems, jobsById]);

  const collections = useMemo(() => jobItems.filter((it) => {
    const j = jobsById[String(it.job_id)];
    return j?.type === "collection" || j?.type === "delivery+collection";
  }), [jobItems, jobsById]);

  const shown = useMemo(() => {
    if (tab === "deliveries") return deliveries.map((it) => ({ type: "job", job_id: it.job_id }));
    if (tab === "collections") return collections.map((it) => ({ type: "job", job_id: it.job_id }));
    if (tab === "all") return jobItems.map((it) => ({ type: "job", job_id: it.job_id }));
    return items;
  }, [tab, items, deliveries, collections, jobItems]);

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
          <button onClick={hardRefresh} style={btnSecondary} type="button">Refresh</button>
        </div>
      </header>

      {hasUpdate ? (
        <div style={bannerUpdate}>
          <div>
            <div style={{ fontWeight: 900 }}>Schedule updated</div>
            <div style={{ color: "#444", fontSize: 13, marginTop: 2 }}>The office changed your run. Tap to refresh.</div>
          </div>
          <button onClick={applyUpdateNow} style={btnPrimary} type="button">Update now</button>
        </div>
      ) : null}

      {toast ? <div style={alertOk}>{toast}</div> : null}
      {err ? <div style={alertError}>{err}</div> : null}

      <div style={tabsRow}>
        <TabButton active={tab === "run"} onClick={() => setTab("run")}>Run ({items.length})</TabButton>
        <TabButton active={tab === "deliveries"} onClick={() => setTab("deliveries")}>Deliveries ({deliveries.length})</TabButton>
        <TabButton active={tab === "collections"} onClick={() => setTab("collections")}>Collections ({collections.length})</TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>All ({jobItems.length})</TabButton>
      </div>

      {loading ? (
        <div style={cardStyle}>Loading…</div>
      ) : (
        <section style={cardStyle}>
          {!shown.length ? (
            <div style={{ color: "#666" }}>None</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {shown.map((it, idx) => {
                if (!it || typeof it !== "object") return null;

                if (it.type === "yard_break") {
                  return <div key={`yb:${idx}`} style={{ ...jobCard, borderStyle: "dashed" }}><div style={{ fontWeight: 900 }}>Return to yard / Tip return</div></div>;
                }

                if (it.type === "driver_break") {
                  return <div key={`db:${idx}`} style={{ ...jobCard, borderStyle: "dashed" }}><div style={{ fontWeight: 900 }}>Break</div></div>;
                }

                if (it.type === "job") {
                  const job = jobsById[String(it.job_id)] || null;
                  const busy = actingJobId === String(job?.id || "");
                  const fileState = job?.id ? (photoFilesByJob[String(job.id)] || {}) : {};
                  return (
                    <JobCard
                      key={String(it.job_id) + ":" + idx}
                      job={job}
                      index={idx + 1}
                      showIndex={tab === "run"}
                      busy={busy}
                      photos={fileState}
                      onSetPhoto={(kind, file) => setJobPhoto(String(job.id), kind, file)}
                      onNavigate={() => openGoogleMaps(job)}
                      onComplete={() => markComplete(job)}
                    />
                  );
                }

                return null;
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function TopNav({ current, onLogout }) {
  const router = useRouter();
  return (
    <div style={topNav}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.push("/driver/work")} style={current === "work" ? navBtnActive : navBtn}>Run</button>
        <button type="button" onClick={() => router.push("/driver/checks")} style={current === "checks" ? navBtnActive : navBtn}>Vehicle checks</button>
      </div>
      <button type="button" onClick={onLogout} style={navBtnDanger}>Logout</button>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return <button type="button" onClick={onClick} style={active ? tabBtnActive : tabBtn}>{children}</button>;
}

function JobCard({ job, index, showIndex, onNavigate, onComplete, busy, photos, onSetPhoto }) {
  const typeLabel =
    job?.type === "delivery" ? "Delivery" :
    job?.type === "collection" ? "Collection" :
    job?.type === "delivery+collection" ? "Tip return (swap)" :
    "Job";

  if (!job) return <div style={jobCard}><div style={{ fontWeight: 900 }}>Job missing</div></div>;

  // Photo requirements by type
  const req =
    job.type === "delivery" ? [{ kind: "delivered", label: "Photo after delivery", hint: "Take a photo of the skip once it’s dropped." }] :
    job.type === "collection" ? [{ kind: "collected", label: "Photo before collection", hint: "Take a photo of the skip before lifting." }] :
    job.type === "delivery+collection" ? [
      { kind: "swap_full", label: "Photo of full skip", hint: "Take a photo of the full skip before lifting." },
      { kind: "swap_empty", label: "Photo of empty skip", hint: "Take a photo of the empty skip after drop." },
    ] :
    [];

  return (
    <div style={jobCard}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {showIndex ? <span style={pillIndex}>{index}</span> : null}
            <div style={{ fontWeight: 900 }}>{job.job_number || "Job"}</div>
            <span style={pillType}>{typeLabel}</span>
          </div>

          <div style={{ marginTop: 6, color: "#111", fontWeight: 800 }}>{job.site_name || "—"}</div>
          <div style={{ marginTop: 4, color: "#555", lineHeight: 1.3 }}>
            {[job.site_address_line1, job.site_address_line2, job.site_town, job.site_postcode].filter(Boolean).join(", ")}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, color: "#222" }}>
            <div><b>Payment:</b> {job.payment_type || "—"}</div>
            <div><b>Skip:</b> {job.skip_type_name || "—"}</div>
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

      {req.length ? (
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
      ) : null}

      <div style={actionsRow}>
        <button type="button" style={btnSecondarySmall} onClick={onNavigate} disabled={!buildAddress(job)}>Navigate</button>
        <button type="button" style={btnPrimarySmall} onClick={onComplete} disabled={busy}>
          {busy ? "Working…" : "Mark complete"}
        </button>
      </div>
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
