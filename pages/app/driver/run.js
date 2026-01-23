// pages/app/driver/run.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";

function ymdTodayLocal() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function niceAddr(job) {
  const parts = [
    job?.site_address_line1,
    job?.site_address_line2,
    job?.site_town,
  ].map((x) => String(x || "").trim()).filter(Boolean);
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
  const [jobsByNumber, setJobsByNumber] = useState({});

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

      // Resolve jobs by job_number (preserve order in rendering; this is just a lookup map)
      const items = Array.isArray(runRow?.items) ? runRow.items : [];
      const jobNumbers = Array.from(new Set(items.map((it) => String(it?.job_number || "").trim()).filter(Boolean)));

      if (jobNumbers.length) {
        const { data: jobs, error: jobsErr } = await supabase
          .from("jobs")
          .select(
            [
              "job_number",
              "site_name",
              "site_address_line1",
              "site_address_line2",
              "site_town",
              "site_postcode",
              "job_status",
              "notes",
              // TODO: add these when available in schema:
              // "payment_type",
              // "skip_type",
            ].join(",")
          )
          .in("job_number", jobNumbers);

        if (!jobsErr && Array.isArray(jobs)) {
          const map = {};
          for (const j of jobs) map[String(j.job_number)] = j;
          setJobsByNumber(map);
        } else {
          setJobsByNumber({});
        }
      } else {
        setJobsByNumber({});
      }

      if (!silent) setLoading(false);
    } catch (e) {
      setErr("Something went wrong loading your run.");
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadAll({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll every 45s (acceptable per your spec)
  useEffect(() => {
    const t = setInterval(() => {
      loadAll({ silent: true });
    }, 45000);
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
            <div style={{ fontSize: 18, fontWeight: 700 }}>{runDate}</div>
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
            <div style={{ fontWeight: 700, marginBottom: 6 }}>No run assigned</div>
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
              const jobNo = String(it?.job_number || "").trim();
              const job = jobNo ? jobsByNumber[jobNo] : null;
              const notes = String(job?.notes || "").trim();
              const hasNotes = Boolean(notes);

              return (
                <div
                  key={`${jobNo || "item"}-${idx}`}
                  style={{ background: "#fff", borderRadius: 14, padding: 12, boxShadow: "0 6px 18px rgba(0,0,0,0.06)" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>
                        {jobNo || "—"}
                        {job?.job_status ? <span style={{ fontWeight: 600, color: "#666" }}> · {job.job_status}</span> : null}
                      </div>
                      <div style={{ marginTop: 4, color: "#111", fontWeight: 700 }}>{job?.site_name || "—"}</div>
                      <div style={{ marginTop: 4, color: "#444", lineHeight: 1.35 }}>
                        {job ? niceAddr(job) : "Loading address…"}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13 }}>
                        <span style={{ fontWeight: 700 }}>Postcode:</span>{" "}
                        <span style={{ fontWeight: 700 }}>{job?.site_postcode || "—"}</span>
                      </div>

                      {/* TODO: show payment type + skip type once fields exist */}
                      {/* <div style={{ marginTop: 6, fontSize: 13 }}>
                        <span style={{ fontWeight: 700 }}>Payment:</span> {job?.payment_type || "—"} ·{" "}
                        <span style={{ fontWeight: 700 }}>Skip:</span> {job?.skip_type || "—"}
                      </div> */}
                    </div>

                    {hasNotes ? (
                      <div style={{ flexShrink: 0 }}>
                        <span style={{ display: "inline-block", background: "#fff3cd", color: "#7a5a00", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          Notes
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {hasNotes ? (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>View notes</summary>
                      <div style={{ marginTop: 8, background: "#fafafa", border: "1px solid #eee", padding: 10, borderRadius: 12, color: "#222", whiteSpace: "pre-wrap" }}>
                        {notes}
                      </div>
                    </details>
                  ) : null}

                  {/* Read-only initially. Buttons here are placeholders for next step. */}
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      disabled
                      style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "#f3f3f3", color: "#777" }}
                      title="Next step: mark delivered + photo"
                    >
                      Mark delivered (next)
                    </button>
                    <button
                      disabled
                      style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "#f3f3f3", color: "#777" }}
                      title="Next step: mark collected + photo"
                    >
                      Mark collected (next)
                    </button>
                  </div>
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
