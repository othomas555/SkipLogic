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
  // minimal fingerprint for update banner
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

export default function DriverWorkPage() {
  const router = useRouter();

  const today = useMemo(() => ymd(new Date()), []);
  const [date, setDate] = useState(today);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [jobsById, setJobsById] = useState({});
  const [err, setErr] = useState("");

  const [tab, setTab] = useState("run"); // run | deliveries | collections | all
  const [hasUpdate, setHasUpdate] = useState(false);
  const lastFingerprintRef = useRef("");

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
      if (!lastFingerprintRef.current) {
        lastFingerprintRef.current = fp;
      } else if (fp !== lastFingerprintRef.current) {
        setHasUpdate(true);
      }

      setItems(nextItems);
      setJobsById(nextJobsById);
      setLoading(false);
    } catch (e) {
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

  useEffect(() => {
    load({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Poll for updates every 45 seconds
  useEffect(() => {
    const t = setInterval(() => load({ silent: true }), 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Derive “job items” for tabs (never re-order run tab)
  const jobItems = useMemo(() => {
    return (items || []).filter((it) => it && typeof it === "object" && it.type === "job" && it.job_id);
  }, [items]);

  const deliveries = useMemo(() => {
    return jobItems.filter((it) => {
      const j = jobsById[String(it.job_id)];
      return j?.type === "delivery" || j?.type === "delivery+collection";
    });
  }, [jobItems, jobsById]);

  const collections = useMemo(() => {
    return jobItems.filter((it) => {
      const j = jobsById[String(it.job_id)];
      return j?.type === "collection" || j?.type === "delivery+collection";
    });
  }, [jobItems, jobsById]);

  const shown = useMemo(() => {
    if (tab === "deliveries") return deliveries.map((it) => ({ type: "job", job_id: it.job_id }));
    if (tab === "collections") return collections.map((it) => ({ type: "job", job_id: it.job_id }));
    if (tab === "all") return jobItems.map((it) => ({ type: "job", job_id: it.job_id }));
    return items; // run tab shows full items incl yard_break etc
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
          <button onClick={hardRefresh} style={btnSecondary} type="button">
            Refresh
          </button>
        </div>
      </header>

      {hasUpdate ? (
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

      {err ? <div style={alertError}>{err}</div> : null}

      <div style={tabsRow}>
        <TabButton active={tab === "run"} onClick={() => setTab("run")}>
          Run ({items.length})
        </TabButton>
        <TabButton active={tab === "deliveries"} onClick={() => setTab("deliveries")}>
          Deliveries ({deliveries.length})
        </TabButton>
        <TabButton active={tab === "collections"} onClick={() => setTab("collections")}>
          Collections ({collections.length})
        </TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>
          All ({jobItems.length})
        </TabButton>
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

                if (it.type === "job") {
                  const job = jobsById[String(it.job_id)] || null;
                  return (
                    <JobCard
                      key={String(it.job_id) + ":" + idx}
                      job={job}
                      index={idx + 1}
                      showIndex={tab === "run"}
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
        <button type="button" onClick={() => router.push("/driver/work")} style={current === "work" ? navBtnActive : navBtn}>
          Run
        </button>
        <button type="button" onClick={() => router.push("/driver/checks")} style={current === "checks" ? navBtnActive : navBtn}>
          Vehicle checks
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

function JobCard({ job, index, showIndex }) {
  const typeLabel =
    job?.type === "delivery"
      ? "Delivery"
      : job?.type === "collection"
      ? "Collection"
      : job?.type === "delivery+collection"
      ? "Tip return (swap)"
      : "Job";

  if (!job) {
    return (
      <div style={jobCard}>
        <div style={{ fontWeight: 900 }}>Job missing</div>
      </div>
    );
  }

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
            <div>
              <b>Payment:</b> {job.payment_type || "—"}
            </div>
            <div>
              <b>Skip:</b> {job.skip_type_name || "—"}
            </div>
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

      {/* Next step (later): buttons + photo capture */}
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 14,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f6f6f6",
};

const topNav = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 12,
  flexWrap: "wrap",
};

const navBtn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const navBtnActive = {
  ...navBtn,
  border: "1px solid #111",
};

const navBtnDanger = {
  padding: "10px 12px",
  borderRadius: 12,
  border: 0,
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 10,
};

const dateInput = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
};

const btnSecondary = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const btnPrimary = {
  padding: "10px 12px",
  borderRadius: 12,
  border: 0,
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const bannerUpdate = {
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#111",
  borderRadius: 12,
  padding: 12,
  display: "flex",
  gap: 12,
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  marginBottom: 12,
};

const alertError = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#8a1f1f",
  marginBottom: 12,
  whiteSpace: "pre-wrap",
};

const tabsRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
};

const tabBtn = {
  padding: "10px 12px",
  borderRadius: 999,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const tabBtnActive = {
  ...tabBtn,
  border: "1px solid #111",
};

const cardStyle = {
  background: "#fff",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};

const jobCard = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
};

const pillIndex = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: 999,
  border: "1px solid #111",
  fontWeight: 900,
  fontSize: 12,
};

const pillType = {
  display: "inline-block",
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid #e0e0e0",
  background: "#fafafa",
  color: "#333",
  fontWeight: 900,
};

const notesBox = {
  marginTop: 8,
  background: "#fafafa",
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 10,
  whiteSpace: "pre-wrap",
};
