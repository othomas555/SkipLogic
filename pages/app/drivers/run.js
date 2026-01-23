// pages/app/drivers/run.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function isYMD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function todayYMDLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

export default function DriverRunViewerPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const driverId = typeof router.query.driver_id === "string" ? router.query.driver_id : "";
  const runDate = typeof router.query.date === "string" && isYMD(router.query.date) ? router.query.date : todayYMDLocal();

  const [loading, setLoading] = useState(true);
  const [runRow, setRunRow] = useState(null);
  const [jobsById, setJobsById] = useState({});
  const [errorMsg, setErrorMsg] = useState("");

  // Optional: lightweight polling (off by default)
  const [autoRefresh, setAutoRefresh] = useState(false);

  const items = useMemo(() => {
    const raw = runRow?.items;
    return Array.isArray(raw) ? raw : [];
  }, [runRow]);

  const jobIds = useMemo(() => {
    const ids = [];
    for (const it of items) {
      if (it && it.type === "job" && it.job_id) ids.push(it.job_id);
    }
    // De-dupe but preserve first occurrence order
    const seen = new Set();
    return ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  }, [items]);

  async function loadRunAndJobs() {
    setErrorMsg("");
    setLoading(true);
    try {
      if (!subscriberId) {
        setRunRow(null);
        setJobsById({});
        return;
      }
      if (!driverId) {
        setRunRow(null);
        setJobsById({});
        return;
      }

      // 1) Load the run row (office RLS applies via profiles)
      const { data: run, error: runErr } = await supabase
        .from("driver_runs")
        .select("id, subscriber_id, driver_id, run_date, items, created_at, updated_at, updated_by")
        .eq("subscriber_id", subscriberId)
        .eq("driver_id", driverId)
        .eq("run_date", runDate)
        .maybeSingle();

      if (runErr) throw runErr;

      setRunRow(run || null);

      // 2) Load referenced jobs (best-effort; don’t fail the whole page if missing columns)
      if (!run || !Array.isArray(run.items)) {
        setJobsById({});
        return;
      }

      const ids = [];
      for (const it of run.items) {
        if (it && it.type === "job" && it.job_id) ids.push(it.job_id);
      }
      const uniq = Array.from(new Set(ids));
      if (!uniq.length) {
        setJobsById({});
        return;
      }

      // Select a safe subset. If your jobs table differs, this still won’t crash the page.
      const { data: jobs, error: jobsErr } = await supabase
        .from("jobs")
        .select("id, job_number, site_name, site_address1, site_address2, site_city, site_postcode, status, job_type")
        .in("id", uniq);

      if (jobsErr) {
        // Don’t hard fail; show IDs only if jobs fetch fails
        console.warn("DriverRunViewer: jobs lookup failed", jobsErr);
        setJobsById({});
        return;
      }

      const map = {};
      for (const j of jobs || []) map[j.id] = j;
      setJobsById(map);
    } catch (e) {
      console.error(e);
      setErrorMsg(e?.message || String(e));
      setRunRow(null);
      setJobsById({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (checking) return;
    if (!user) return;
    loadRunAndJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId, driverId, runDate]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      loadRunAndJobs();
    }, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, checking, user, subscriberId, driverId, runDate]);

  if (checking) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <p>Checking sign-in…</p>
      </main>
    );
  }

  if (authError) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <p style={{ color: "crimson" }}>{authError}</p>
        <p>
          <Link href="/login">Go to login</Link>
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <p>You are not signed in.</p>
        <p>
          <Link href="/login">Go to login</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Driver run (viewer)</h1>
          <div style={{ color: "#555", marginTop: 6 }}>
            Signed in as <b>{user.email}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto refresh (30s)
          </label>
          <button
            onClick={() => loadRunAndJobs()}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Refresh now
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          border: "1px solid #eee",
          borderRadius: 12,
          background: "#fafafa",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#666" }}>driver_id</div>
          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}>
            {driverId || "— (add ?driver_id=...)"}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#666" }}>date</div>
          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}>{runDate}</div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#666" }}>run row</div>
          <div>{runRow ? "FOUND" : "NOT FOUND"}</div>
        </div>

        <div style={{ marginLeft: "auto" }}>
          <Link href="/app/drivers" style={{ textDecoration: "none", color: "#0b66ff" }}>
            ← Back to drivers
          </Link>
        </div>
      </div>

      {errorMsg ? (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #ffd0d0", background: "#fff5f5", borderRadius: 12 }}>
          <b style={{ color: "crimson" }}>Error:</b> {errorMsg}
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <p>Loading…</p>
        ) : !driverId ? (
          <p>
            Add <code>?driver_id=&lt;uuid&gt;</code> to the URL. Optional: <code>&amp;date=YYYY-MM-DD</code>
          </p>
        ) : !runRow ? (
          <p>No run found for that driver/date.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.length === 0 ? <p>No items in this run.</p> : null}

            {items.map((it, idx) => {
              const key = `${runRow.id}:${idx}`;
              if (!it || typeof it !== "object") {
                return (
                  <div key={key} style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fff" }}>
                    <b>Item {idx + 1}:</b> (invalid item)
                  </div>
                );
              }

              if (it.type === "yard_break") {
                return (
                  <div
                    key={key}
                    style={{
                      padding: 12,
                      border: "1px dashed #bbb",
                      borderRadius: 12,
                      background: "#fff",
                    }}
                  >
                    <b>Yard break</b> (tip return / return to yard)
                  </div>
                );
              }

              if (it.type === "driver_break") {
                return (
                  <div
                    key={key}
                    style={{
                      padding: 12,
                      border: "1px dashed #bbb",
                      borderRadius: 12,
                      background: "#fff",
                    }}
                  >
                    <b>Driver break</b>
                  </div>
                );
              }

              if (it.type === "job") {
                const jobId = it.job_id;
                const job = jobId ? jobsById[jobId] : null;
                const title = job?.job_number || job?.site_name || (jobId ? `Job ${jobId}` : "Job");

                return (
                  <div key={key} style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ fontWeight: 700 }}>{idx + 1}. {title}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>{job?.status ? `Status: ${job.status}` : null}</div>
                    </div>

                    <div style={{ marginTop: 6, color: "#444" }}>
                      {job?.site_address1 || job?.site_address2 || job?.site_city || job?.site_postcode ? (
                        <div>
                          {[job.site_address1, job.site_address2, job.site_city, job.site_postcode].filter(Boolean).join(", ")}
                        </div>
                      ) : (
                        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                          job_id: {jobId || "—"}
                        </div>
                      )}
                      {job?.job_type ? <div style={{ fontSize: 12, color: "#666" }}>Type: {job.job_type}</div> : null}
                    </div>
                  </div>
                );
              }

              return (
                <div key={key} style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fff" }}>
                  <b>Item {idx + 1}:</b> unknown type <code>{String(it.type)}</code>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: "#666" }}>
        Rendering rule: items are displayed in the exact JSON array order stored in <code>driver_runs.items</code> (no sorting).
      </div>
    </main>
  );
}
