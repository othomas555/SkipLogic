// pages/app/driver/run.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";

function ymdTodayLocal() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function niceAddr(job) {
  const parts = [job?.site_address_line1, job?.site_address_line2, job?.site_town]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

export default function DriverTodayRunPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");

  const [profile, setProfile] = useState(null); // { subscriber_id, driver_id, role }
  const [driver, setDriver] = useState(null);   // { id, full_name }
  const [run, setRun] = useState(null);         // { id, run_date, items: [] }
  const [jobsById, setJobsById] = useState({});

  const runDate = useMemo(() => ymdTodayLocal(), []);

  async function loadAll({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setErr("");

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.replace("/login-driver");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, subscriber_id, role, driver_id")
        .eq("id", auth.user.id)
        .single();

      if (profErr || !prof) {
        setErr("No profile found for this login.");
        if (!silent) setLoading(false);
        return;
      }

      if (String(prof.role || "") !== "driver") {
        setErr("This login is not a driver account.");
        if (!silent) setLoading(false);
        return;
      }

      if (!prof.driver_id) {
        setErr("Driver account is not linked to a driver record. Office needs to enable login.");
        if (!silent) setLoading(false);
        return;
      }

      setProfile(prof);

      const { data: drv, error: drvErr } = await supabase
        .from("drivers")
        .select("id, full_name")
        .eq("id", prof.driver_id)
        .single();

      if (drvErr) {
        setErr("Could not load driver.");
        if (!silent) setLoading(false);
        return;
      }
      setDriver(drv);

      const { data: runRow, error: runErr } = await supabase
        .from("driver_runs")
        .select("id, subscriber_id, driver_id, run_date, items, updated_at")
        .eq("subscriber_id", prof.subscriber_id)
        .eq("driver_id", prof.driver_id)
        .eq("run_date", runDate)
        .maybeSingle();

      if (runErr) {
        setErr("Could not load today’s run.");
        if (!silent) setLoading(false);
        return;
      }

      setRun(runRow || null);

      // Resolve jobs by job_id referenced in items (best effort; preserves JSON order in rendering)
      const items = Array.isArray(runRow?.items) ? runRow.items : [];
      const jobIds = Array.from(
        new Set(items.map((it) => (it && it.type === "job" ? it.job_id : null)).filter(Boolean))
      );

      if (jobIds.length) {
        const { data: jobs, error: jobsErr } = await supabase
          .from("jobs")
          .select("id, job_number, site_name, site_address_line1, site_address_line2, site_town, site_postcode, job_status, notes, payment_type, skip_types(name)")
          .in("id", jobIds);

        if (!jobsErr && Array.isArray(jobs)) {
          const map = {};
          for (const j of jobs) map[String(j.id)] = j;
          setJobsById(map);
        } else {
          setJobsById({});
        }
      } else {
        setJobsById({});
      }

      if (!silent) setLoading(false);
    } catch {
      setErr("Something went wrong loading your run.");
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadAll({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll every 45s
  useEffect(() => {
    const t = setInterval(() => loadAll({ silent: true }), 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runDate]);

  async function onRefresh() {
    setRefreshing(true);
    await loadAll({ silent: true });
    setRefreshing(false);
  }

  async function onLogout() {
    await supabase.auth.signOut();
    router.replace("/login-driver");
  }

  const items = useMemo(() => (Array.isArray(run?.items) ? run.items : []), [run]);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f5f5", padding: 12, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 4px" }}>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>Today</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{runDate}</div>
            <div style={{ fontSize: 13, color: "#333", marginTop: 2 }}>
              {driver?.full_name ? `Driver: ${driver.full_name}` : "Driver"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              style={{ border: "1px solid #ddd", background: "#fff", padding: "10px 12px", borderRadius: 12, cursor: refreshing ? "not-allowed" : "pointer" }}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={onLogout}
              style={{ border: "1px solid #ddd", background: "#fff", padding: "10px 12px", borderRadius: 12, cursor: "pointer" }}
            >
              Logout
            </button>
          </div>
        </div>

        {err ? (
          <div style={{ background: "#ffecec", color: "#7a1212", padding: 12, borderRadius: 12, marginBottom: 10 }}>
            {err}
          </div>
        ) : null}

        {loading ? (
          <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}>
            Loading…
          </div>
        ) : null}

        {!loading && !run ? (
          <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>No run assigned</div>
            <div style={{ color: "#555" }}>Nothing scheduled for you today.</div>
          </div>
        ) : null}

        {!loading && run ? (
          <div style={{ display: "grid", gap: 10 }}>
            {items.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}>
                Run is empty.
              </div>
            ) : null}

            {items.map((it, idx) => {
              const key = `${run.id}:${idx}`;

              if (!it || typeof it !== "object") {
                return (
                  <div key={key} style={{ background: "#fff", borderRadius: 14, padding: 12, boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}>
                    <b>Item {idx + 1}:</b> invalid item
                  </div>
                );
              }

              if (it.type === "yard_break") {
                return (
                  <div key={key} style={{ background: "#fff", borderRadius: 14, padding: 12, border: "1px dashed #999" }}>
                    <b>Return to yard / Tip return</b>
                  </div>
                );
              }

              if (it.type === "driver_break") {
                return (
                  <div key={key} style={{ background: "#fff", borderRadius: 14, padding: 12, border: "1px dashed #999" }}>
                    <b>Driver break</b>
                  </div>
                );
              }

              if (it.type === "job") {
                const job = it.job_id ? jobsById[String(it.job_id)] : null;
                const notes = String(job?.notes || "").trim();
                const hasNotes = Boolean(notes);

                const skipName = job?.skip_types?.name || "—";
                const payment = job?.payment_type || "—";

                return (
                  <div key={key} style={{ background: "#fff", borderRadius: 14, padding: 12, boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 900 }}>
                          {job?.job_number || "—"} {job?.job_status ? <span style={{ fontWeight: 700, color: "#666" }}>· {job.job_status}</span> : null}
                        </div>
                        <div style={{ marginTop: 4, color: "#111", fontWeight: 800 }}>{job?.site_name || "—"}</div>
                        <div style={{ marginTop: 4, color: "#444", lineHeight: 1.35 }}>
                          {job ? niceAddr(job) : "Loading address…"}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13 }}>
                          <span style={{ fontWeight: 800 }}>Postcode:</span>{" "}
                          <span style={{ fontWeight: 800 }}>{job?.site_postcode || "—"}</span>
                        </div>

                        <div style={{ marginTop: 10, fontSize: 13, display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <div><span style={{ fontWeight: 800 }}>Payment:</span> {payment}</div>
                          <div><span style={{ fontWeight: 800 }}>Skip:</span> {skipName}</div>
                        </div>
                      </div>

                      {hasNotes ? (
                        <span style={{ display: "inline-block", background: "#fff3cd", color: "#7a5a00", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>
                          Notes
                        </span>
                      ) : null}
                    </div>

                    {hasNotes ? (
                      <details style={{ marginTop: 10 }}>
                        <summary style={{ cursor: "pointer", fontWeight: 800 }}>View notes</summary>
                        <div style={{ marginTop: 8, background: "#fafafa", border: "1px solid #eee", padding: 10, borderRadius: 12, color: "#222", whiteSpace: "pre-wrap" }}>
                          {notes}
                        </div>
                      </details>
                    ) : null}
                  </div>
                );
              }

              return (
                <div key={key} style={{ background: "#fff", borderRadius: 14, padding: 12, boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}>
                  <b>Item {idx + 1}:</b> unknown type <code>{String(it.type)}</code>
                </div>
              );
            })}
          </div>
        ) : null}

        <div style={{ marginTop: 14, fontSize: 12, color: "#666", padding: "0 4px 20px" }}>
          Auto-refresh every ~45 seconds. JSON order is preserved.
        </div>
      </div>
    </main>
  );
}
