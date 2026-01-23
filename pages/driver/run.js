// pages/driver/run.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

function todayYMDLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addrLine(job) {
  const xs = [job?.site_address_line1, job?.site_address_line2, job?.site_town].filter(Boolean);
  return xs.join(", ");
}

export default function DriverRunPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const runDate = useMemo(() => todayYMDLocal(), []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [driverRow, setDriverRow] = useState(null); // drivers row
  const [runRow, setRunRow] = useState(null); // driver_runs row
  const [jobsById, setJobsById] = useState({});

  const items = useMemo(() => {
    const raw = runRow?.items;
    return Array.isArray(raw) ? raw : [];
  }, [runRow]);

  async function loadAll({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setErrorMsg("");

    try {
      if (!subscriberId || !user?.email) {
        setDriverRow(null);
        setRunRow(null);
        setJobsById({});
        return;
      }

      // 1) Find operational driver by logged-in email (simple + working)
      const { data: drv, error: drvErr } = await supabase
        .from("drivers")
        .select("id, subscriber_id, name, callsign, email")
        .eq("subscriber_id", subscriberId)
        .eq("email", user.email)
        .maybeSingle();

      if (drvErr) throw drvErr;

      if (!drv) {
        setDriverRow(null);
        setRunRow(null);
        setJobsById({});
        setErrorMsg("This login email is not linked to a driver record. Office: set the driver email to match.");
        return;
      }

      setDriverRow(drv);

      // 2) Load today’s run
      const { data: run, error: runErr } = await supabase
        .from("driver_runs")
        .select("id, subscriber_id, driver_id, run_date, items, updated_at")
        .eq("subscriber_id", subscriberId)
        .eq("driver_id", drv.id)
        .eq("run_date", runDate)
        .maybeSingle();

      if (runErr) throw runErr;

      setRunRow(run || null);

      // 3) Load referenced jobs (best effort)
      const ids = [];
      if (run && Array.isArray(run.items)) {
        for (const it of run.items) {
          if (it && it.type === "job" && it.job_id) ids.push(it.job_id);
        }
      }
      const uniq = Array.from(new Set(ids));
      if (!uniq.length) {
        setJobsById({});
        return;
      }

      const { data: jobs, error: jobsErr } = await supabase
        .from("jobs")
        .select(
          `
          id,
          job_number,
          site_name,
          site_address_line1,
          site_address_line2,
          site_town,
          site_postcode,
          job_status,
          notes,
          payment_type,
          skip_type_id,
          skip_types ( id, name )
        `
        )
        .in("id", uniq);

      if (jobsErr) {
        console.warn("DriverRun: jobs lookup failed", jobsErr);
        setJobsById({});
        return;
      }

      const map = {};
      for (const j of jobs || []) map[j.id] = j;
      setJobsById(map);
    } catch (e) {
      console.error(e);
      setErrorMsg(e?.message || String(e));
      setDriverRow(null);
      setRunRow(null);
      setJobsById({});
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (checking) return;
    if (!user) return;
    loadAll({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId]);

  // Polling is fine for now (45s)
  useEffect(() => {
    if (checking) return;
    if (!user) return;
    const t = setInterval(() => loadAll({ silent: true }), 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId]);

  async function refreshNow() {
    setRefreshing(true);
    await loadAll({ silent: true });
    setRefreshing(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (checking) {
    return (
      <main style={wrap}>
        <p>Checking sign-in…</p>
      </main>
    );
  }

  if (authError) {
    return (
      <main style={wrap}>
        <div style={card}>
          <div style={errBox}>{authError}</div>
          <Link href="/login">Go to login</Link>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={wrap}>
        <div style={card}>
          <p>You are not signed in.</p>
          <Link href="/login">Go to login</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>Today</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{runDate}</div>
            <div style={{ fontSize: 13, color: "#333", marginTop: 2 }}>
              {driverRow?.name ? `Driver: ${driverRow.name}` : `Signed in: ${user.email}`}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={refreshNow} style={btn} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button onClick={logout} style={btn}>
              Logout
            </button>
          </div>
        </div>

        {errorMsg ? <div style={errBox}>{errorMsg}</div> : null}

        {loading ? (
          <div style={card}>Loading…</div>
        ) : !driverRow ? (
          <div style={card}>No driver record found for this login.</div>
        ) : !runRow ? (
          <div style={card}>No run assigned for today.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.length === 0 ? <div style={card}>Run is empty.</div> : null}

            {items.map((it, idx) => {
              const key = `${runRow.id}:${idx}`;

              if (!it || typeof it !== "object") {
                return (
                  <div key={key} style={card}>
                    <b>Item {idx + 1}:</b> invalid item
                  </div>
                );
              }

              if (it.type === "yard_break") {
                return (
                  <div key={key} style={{ ...card, borderStyle: "dashed" }}>
                    <b>Return to yard / Tip return</b>
                  </div>
                );
              }

              if (it.type === "driver_break") {
                return (
                  <div key={key} style={{ ...card, borderStyle: "dashed" }}>
                    <b>Driver break</b>
                  </div>
                );
              }

              if (it.type === "job") {
                const job = it.job_id ? jobsById[it.job_id] : null;
                const notes = String(job?.notes || "").trim();

                return (
                  <div key={key} style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900 }}>
                        {idx + 1}. {job?.job_number || "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>{job?.job_status ? `Status: ${job.job_status}` : null}</div>
                    </div>

                    <div style={{ marginTop: 6, fontWeight: 800 }}>{job?.site_name || "—"}</div>
                    <div style={{ marginTop: 4, color: "#444", lineHeight: 1.35 }}>{addrLine(job)}</div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      <b>Postcode:</b> {job?.site_postcode || "—"}
                    </div>

                    <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
                      <div>
                        <b>Payment:</b> {job?.payment_type || "—"}
                      </div>
                      <div>
                        <b>Skip:</b> {job?.skip_types?.name || "—"}
                      </div>
                    </div>

                    {notes ? (
                      <details style={{ marginTop: 10 }}>
                        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Notes</summary>
                        <div style={{ marginTop: 8, background: "#fafafa", border: "1px solid #eee", padding: 10, borderRadius: 12, whiteSpace: "pre-wrap" }}>
                          {notes}
                        </div>
                      </details>
                    ) : null}
                  </div>
                );
              }

              return (
                <div key={key} style={card}>
                  <b>Item {idx + 1}:</b> unknown type <code>{String(it.type)}</code>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 12, color: "#666", paddingBottom: 30 }}>
          Order rule: items render in the exact JSON order from <code>driver_runs.items</code> (no sorting).
        </div>
      </div>
    </main>
  );
}

const wrap = {
  minHeight: "100vh",
  background: "#f5f5f5",
  padding: 12,
  fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
};

const topBar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 4px",
  flexWrap: "wrap",
};

const card = {
  background: "#fff",
  borderRadius: 14,
  padding: 12,
  border: "1px solid #eee",
  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
};

const btn = {
  border: "1px solid #ddd",
  background: "#fff",
  padding: "10px 12px",
  borderRadius: 12,
  cursor: "pointer",
};

const errBox = {
  background: "#ffecec",
  color: "#7a1212",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #f0b4b4",
  marginBottom: 10,
  whiteSpace: "pre-wrap",
};
