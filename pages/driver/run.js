// pages/driver/run.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";

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
  const runDate = useMemo(() => todayYMDLocal(), []);

  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [driver, setDriver] = useState(null); // {id,name,subscriber_id}
  const [run, setRun] = useState(null); // {id,run_date,items,updated_at}
  const [jobsById, setJobsById] = useState({}); // { [id]: job }

  const items = useMemo(() => {
    const raw = run?.items;
    return Array.isArray(raw) ? raw : [];
  }, [run]);

  async function loadSession() {
    setChecking(true);
    const { data } = await supabase.auth.getSession();
    setUser(data?.session?.user || null);
    setChecking(false);
  }

  async function loadRun({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setErrorMsg("");

    try {
      const { data: sess } = await supabase.auth.getSession();
      const u = sess?.session?.user;
      setUser(u || null);

      if (!u) {
        setDriver(null);
        setRun(null);
        setJobsById({});
        return;
      }

      const { data, error } = await supabase.rpc("get_my_run", { p_run_date: runDate });
      if (error) throw error;

      if (!data?.ok) {
        setDriver(null);
        setRun(null);
        setJobsById({});
        setErrorMsg(data?.error || "Could not load run.");
        return;
      }

      setDriver(data.driver || null);
      setRun(data.run || null);

      const jobsObj = data.jobs && typeof data.jobs === "object" ? data.jobs : {};
      setJobsById(jobsObj);
    } catch (e) {
      console.error(e);
      setErrorMsg(e?.message || String(e));
      setDriver(null);
      setRun(null);
      setJobsById({});
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadSession().then(() => loadRun({ silent: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // polling: simple + good enough
  useEffect(() => {
    const t = setInterval(() => loadRun({ silent: true }), 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshNow() {
    setRefreshing(true);
    await loadRun({ silent: true });
    setRefreshing(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login"); // IMPORTANT: NOT /app/login-driver
  }

  if (checking) {
    return (
      <main style={wrap}>
        <p>Checking sign-in…</p>
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
              {driver?.name ? `Driver: ${driver.name}` : `Signed in: ${user.email}`}
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
        ) : !driver ? (
          <div style={card}>This login email is not linked to an active driver.</div>
        ) : !run ? (
          <div style={card}>No run assigned for today.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.length === 0 ? <div style={card}>Run is empty.</div> : null}

            {items.map((it, idx) => {
              const key = `${run.id}:${idx}`;

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
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {job?.job_status ? `Status: ${job.job_status}` : null}
                      </div>
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
                        <b>Skip:</b> {job?.skip_type_name || "—"}
                      </div>
                    </div>

                    {notes ? (
                      <details style={{ marginTop: 10 }}>
                        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Notes</summary>
                        <div
                          style={{
                            marginTop: 8,
                            background: "#fafafa",
                            border: "1px solid #eee",
                            padding: 10,
                            borderRadius: 12,
                            whiteSpace: "pre-wrap",
                          }}
                        >
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
