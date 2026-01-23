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

function formatAddr(job) {
  if (!job) return "";
  const parts = [
    job.site_address_line1,
    job.site_address_line2,
    job.site_town,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function pillStyle(bg, fg) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: bg,
    color: fg,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
}

export default function DriverRunViewerPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const driverId = typeof router.query.driver_id === "string" ? router.query.driver_id : "";
  const runDate =
    typeof router.query.date === "string" && isYMD(router.query.date) ? router.query.date : todayYMDLocal();

  const [loading, setLoading] = useState(true);
  const [runRow, setRunRow] = useState(null);
  const [jobsById, setJobsById] = useState({});
  const [errorMsg, setErrorMsg] = useState("");

  // Optional: lightweight polling
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Expand/collapse notes per item index (viewer UX)
  const [openNotes, setOpenNotes] = useState({}); // { [idx]: true }

  const items = useMemo(() => {
    const raw = runRow?.items;
    return Array.isArray(raw) ? raw : [];
  }, [runRow]);

  async function loadRunAndJobs({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setErrorMsg("");

    try {
      if (!subscriberId || !driverId) {
        setRunRow(null);
        setJobsById({});
        return;
      }

      // 1) Load the run row
      const { data: run, error: runErr } = await supabase
        .from("driver_runs")
        .select("id, subscriber_id, driver_id, run_date, items, created_at, updated_at, updated_by")
        .eq("subscriber_id", subscriberId)
        .eq("driver_id", driverId)
        .eq("run_date", runDate)
        .maybeSingle();

      if (runErr) throw runErr;

      setRunRow(run || null);

      // 2) Load referenced jobs (best-effort)
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

      // NOTE: We keep the select compatible with your current schema.
      // If/when you add payment_type / skip_type, we’ll include them here.
      const { data: jobs, error: jobsErr } = await supabase
        .from("jobs")
        .select(
          "id, job_number, site_name, site_address_line1, site_address_line2, site_town, site_postcode, job_status, notes"
        )
        .in("id", uniq);

      if (jobsErr) {
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
      if (!silent) setLoading(false);
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
      loadRunAndJobs({ silent: true });
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

  const headerBox = {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  };

  return (
    <main style={{ minHeight: "100vh", padding: 12, background: "#f5f5f5", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "6px 4px" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>Driver run (viewer)</h1>
            <div style={{ color: "#555", marginTop: 6, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
              Signed in as <b>{user.email}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#333" }}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto refresh (30s)
            </label>
            <button
              onClick={() => loadRunAndJobs()}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Refresh now
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, ...headerBox, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ minWidth: 240 }}>
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
            <div style={{ fontWeight: 800 }}>{runRow ? "FOUND" : "NOT FOUND"}</div>
          </div>

          <div style={{ marginLeft: "auto" }}>
            <Link href="/app/drivers" style={{ textDecoration: "none", color: "#0b66ff", fontWeight: 700 }}>
              ← Back to drivers
            </Link>
          </div>
        </div>

        {errorMsg ? (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid #ffd0d0", background: "#fff5f5", borderRadius: 14 }}>
            <b style={{ color: "crimson" }}>Error:</b> {errorMsg}
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          {loading ? (
            <div style={headerBox}>Loading…</div>
          ) : !driverId ? (
            <div style={headerBox}>
              Add <code>?driver_id=&lt;uuid&gt;</code> to the URL. Optional: <code>&amp;date=YYYY-MM-DD</code>
            </div>
          ) : !runRow ? (
            <div style={headerBox}>No run found for that driver/date.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {items.length === 0 ? <div style={headerBox}>No items in this run.</div> : null}

              {items.map((it, idx) => {
                const key = `${runRow.id}:${idx}`;

                if (!it || typeof it !== "object") {
                  return (
                    <div key={key} style={{ padding: 12, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
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
                        borderRadius: 14,
                        border: "1px dashed #999",
                        background: "#fff",
                        boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>Return to yard / Tip return</div>
                        <span style={pillStyle("#e8f0ff", "#143a8a")}>Break</span>
                      </div>
                      <div style={{ marginTop: 8, color: "#444", lineHeight: 1.35 }}>
                        Driver should return to the yard. If this is a tip return, driver will later be asked for <b>2 photos</b>.
                      </div>
                    </div>
                  );
                }

                if (it.type === "driver_break") {
                  return (
                    <div
                      key={key}
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px dashed #999",
                        background: "#fff",
                        boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>Driver break</div>
                        <span style={pillStyle("#f1f1f1", "#333")}>Break</span>
                      </div>
                    </div>
                  );
                }

                if (it.type === "job") {
                  const jobId = it.job_id;
                  const job = jobId ? jobsById[jobId] : null;

                  const jobNo = job?.job_number || "";
                  const siteName = job?.site_name || "";
                  const addr = formatAddr(job);
                  const postcode = String(job?.site_postcode || "").trim();
                  const status = String(job?.job_status || "").trim();

                  // Payment + skip type:
                  // - Prefer job fields if they exist (future)
                  // - Fall back to item payload if you already store them
                  const paymentType = (job && job.payment_type) || it.payment_type || "";
                  const skipType = (job && job.skip_type) || it.skip_type || "";

                  const notes = String(job?.notes || "").trim();
                  const hasNotes = Boolean(notes);

                  return (
                    <div
                      key={key}
                      style={{
                        padding: 12,
                        border: "1px solid #eee",
                        borderRadius: 14,
                        background: "#fff",
                        boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 900, fontSize: 15 }}>
                              {idx + 1}. {jobNo || "Job"}
                            </div>

                            {status ? <span style={pillStyle("#f1f1f1", "#333")}>{status}</span> : null}
                            {hasNotes ? <span style={pillStyle("#fff3cd", "#7a5a00")}>Notes</span> : null}
                          </div>

                          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: "#111" }}>
                            {siteName || (jobId ? `Job ${jobId}` : "—")}
                          </div>

                          <div style={{ marginTop: 6, color: "#444", lineHeight: 1.35 }}>
                            {addr ? (
                              <div>{addr}</div>
                            ) : (
                              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                                job_id: {jobId || "—"}
                              </div>
                            )}

                            {postcode ? (
                              <div style={{ marginTop: 6, fontSize: 13 }}>
                                <span style={{ fontWeight: 800 }}>Postcode:</span>{" "}
                                <span style={{ fontWeight: 800 }}>{postcode}</span>
                              </div>
                            ) : null}
                          </div>

                          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                            <div>
                              <span style={{ fontWeight: 800 }}>Payment:</span> {paymentType || "—"}
                            </div>
                            <div>
                              <span style={{ fontWeight: 800 }}>Skip:</span> {skipType || "—"}
                            </div>
                          </div>
                        </div>

                        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                          {/* Placeholder buttons for next step (driver actions) */}
                          <button
                            disabled
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid #ddd",
                              background: "#f3f3f3",
                              color: "#777",
                              cursor: "not-allowed",
                              minWidth: 150,
                              textAlign: "center",
                            }}
                            title="Next step: driver marks delivered + photo"
                          >
                            Mark delivered
                          </button>

                          <button
                            disabled
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid #ddd",
                              background: "#f3f3f3",
                              color: "#777",
                              cursor: "not-allowed",
                              minWidth: 150,
                              textAlign: "center",
                            }}
                            title="Next step: driver marks collected + photo"
                          >
                            Mark collected
                          </button>
                        </div>
                      </div>

                      {hasNotes ? (
                        <div style={{ marginTop: 10 }}>
                          <button
                            onClick={() => setOpenNotes((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                            style={{
                              border: "1px solid #eee",
                              background: "#fff",
                              padding: "10px 12px",
                              borderRadius: 12,
                              cursor: "pointer",
                              fontWeight: 800,
                            }}
                          >
                            {openNotes[idx] ? "Hide notes" : "View notes"}
                          </button>

                          {openNotes[idx] ? (
                            <div
                              style={{
                                marginTop: 10,
                                background: "#fafafa",
                                border: "1px solid #eee",
                                padding: 12,
                                borderRadius: 14,
                                color: "#222",
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.35,
                              }}
                            >
                              {notes}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <div key={key} style={{ padding: 12, border: "1px solid #eee", borderRadius: 14, background: "#fff" }}>
                    <b>Item {idx + 1}:</b> unknown type <code>{String(it.type)}</code>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: "#666", padding: "0 4px 18px" }}>
          Rendering rule: items are displayed in the exact JSON array order stored in <code>driver_runs.items</code> (no sorting).
        </div>
      </div>
    </main>
  );
}
