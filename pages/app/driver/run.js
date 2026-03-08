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
  const parts = [job?.site_address_line1, job?.site_address_line2, job?.site_town, job?.site_postcode]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function getJobKind(job, runDate) {
  if (!job) return "Job";
  if (String(job.collection_date || "") === String(runDate)) return "Collection";
  return "Delivery";
}

function jobStatusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "delivered" || s === "collected" || s === "completed") {
    return {
      bg: "#ecfdf3",
      border: "#b7ebc6",
      fg: "#166534",
    };
  }
  return {
    bg: "#ffffff",
    border: "#e5e7eb",
    fg: "#111827",
  };
}

function itemKey(item, runNumber, index) {
  const type = String(item?.type || "");
  if (type === "job") return `run-${runNumber}-job-${item.job_id || index}`;
  if (type === "swap") {
    return `run-${runNumber}-swap-${item.swap_group_id || item.collect_job_id || item.deliver_job_id || index}`;
  }
  if (type === "return_yard") return `run-${runNumber}-yard-${index}`;
  return `run-${runNumber}-item-${index}`;
}

function sectionLabel(runNumber) {
  return `Run ${runNumber}`;
}

export default function DriverTodayRunPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");

  const [profile, setProfile] = useState(null);
  const [driver, setDriver] = useState(null);
  const [runRows, setRunRows] = useState([]);
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
        .select("id, name, full_name")
        .eq("id", prof.driver_id)
        .single();

      if (drvErr || !drv) {
        setErr("Could not load driver.");
        if (!silent) setLoading(false);
        return;
      }
      setDriver(drv);

      const { data: rows, error: runErr } = await supabase
        .from("driver_runs")
        .select("id, subscriber_id, driver_id, run_date, run_number, status, items, updated_at")
        .eq("subscriber_id", prof.subscriber_id)
        .eq("driver_id", prof.driver_id)
        .eq("run_date", runDate)
        .order("run_number", { ascending: true });

      if (runErr) {
        setErr("Could not load today’s runs.");
        if (!silent) setLoading(false);
        return;
      }

      const safeRows = Array.isArray(rows) ? rows : [];
      setRunRows(safeRows);

      const jobIds = [];
      for (const row of safeRows) {
        const items = Array.isArray(row?.items) ? row.items : [];
        for (const it of items) {
          const type = String(it?.type || "");
          if (type === "job" && it?.job_id) jobIds.push(String(it.job_id));
          if (type === "swap") {
            if (it?.collect_job_id) jobIds.push(String(it.collect_job_id));
            if (it?.deliver_job_id) jobIds.push(String(it.deliver_job_id));
          }
        }
      }

      const uniqJobIds = Array.from(new Set(jobIds.filter(Boolean)));

      if (uniqJobIds.length) {
        const { data: jobs, error: jobsErr } = await supabase
          .from("jobs")
          .select(
            [
              "id",
              "job_number",
              "site_name",
              "site_address_line1",
              "site_address_line2",
              "site_town",
              "site_postcode",
              "job_status",
              "notes",
              "payment_type",
              "scheduled_date",
              "collection_date",
              "delivery_actual_date",
              "collection_actual_date",
              "swap_group_id",
              "swap_role",
              "skip_type_id",
            ].join(",")
          )
          .in("id", uniqJobIds);

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
    } catch (e) {
      console.error(e);
      setErr("Something went wrong loading your runs.");
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadAll({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const flattenedRuns = useMemo(() => {
    return (runRows || []).map((row) => {
      const items = Array.isArray(row?.items) ? row.items : [];
      return {
        ...row,
        items,
      };
    });
  }, [runRows]);

  const driverName = driver?.full_name || driver?.name || "Driver";

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={wrapStyle}>
          <div style={headerCardStyle}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Loading your run…</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={wrapStyle}>
        <div style={headerCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Today
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#111827", marginTop: 2 }}>{runDate}</div>
              <div style={{ fontSize: 14, color: "#374151", marginTop: 6 }}>{driverName}</div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button type="button" onClick={onRefresh} style={secondaryBtn} disabled={refreshing}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
              <button type="button" onClick={onLogout} style={secondaryBtn}>
                Log out
              </button>
            </div>
          </div>

          {err ? <div style={errorStyle}>{err}</div> : null}

          {!err && profile ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
              {flattenedRuns.length
                ? `${flattenedRuns.length} run${flattenedRuns.length === 1 ? "" : "s"} loaded`
                : "No saved runs for today"}
            </div>
          ) : null}
        </div>

        {!flattenedRuns.length ? (
          <div style={emptyCardStyle}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>No run saved yet</div>
            <div style={{ marginTop: 8, fontSize: 14, color: "#6b7280", lineHeight: 1.5 }}>
              Your office has not saved any runs for today yet.
            </div>
          </div>
        ) : null}

        {flattenedRuns.map((runRow) => (
          <section key={String(runRow.id || runRow.run_number)} style={runCardStyle}>
            <div style={runHeaderStyle}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#111827" }}>
                  {sectionLabel(runRow.run_number)}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                  {Array.isArray(runRow.items) ? runRow.items.length : 0} item(s)
                </div>
              </div>

              <div style={runBadgeStyle}>
                {String(runRow.status || "planned").toUpperCase()}
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {(runRow.items || []).map((item, index) => {
                const type = String(item?.type || "");

                if (type === "return_yard") {
                  return (
                    <div key={itemKey(item, runRow.run_number, index)} style={yardCardStyle}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#6b46c1", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Return to yard
                      </div>
                      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: "#4c1d95" }}>
                        Yard stop
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>
                        {Number(item?.duration_mins || 0)} mins
                      </div>
                    </div>
                  );
                }

                if (type === "swap") {
                  const collect = jobsById[String(item?.collect_job_id || "")] || null;
                  const deliver = jobsById[String(item?.deliver_job_id || "")] || null;
                  const baseJob = deliver || collect || null;
                  const tone = jobStatusTone(baseJob?.job_status);

                  return (
                    <div
                      key={itemKey(item, runRow.run_number, index)}
                      style={{
                        ...jobCardStyle,
                        background: "#fff4e9",
                        border: "1px solid #f7dfc2",
                      }}
                    >
                      <div style={topRowStyle}>
                        <div style={pillStyle("#ffe7cf", "#9a5a1c")}>Swap</div>
                        {baseJob?.job_status ? (
                          <div style={pillStyle(tone.bg, tone.fg)}>{String(baseJob.job_status).replace(/_/g, " ")}</div>
                        ) : null}
                      </div>

                      <div style={titleStyle}>
                        {deliver?.job_number || collect?.job_number || "Swap"}
                      </div>

                      {baseJob?.site_name ? <div style={siteNameStyle}>{baseJob.site_name}</div> : null}
                      {baseJob ? <div style={addrStyle}>{niceAddr(baseJob)}</div> : null}

                      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                        <div style={subRowStyle}>
                          <strong>Collect:</strong>{" "}
                          {collect?.job_number ? `${collect.job_number}` : "—"}
                        </div>
                        <div style={subRowStyle}>
                          <strong>Deliver:</strong>{" "}
                          {deliver?.job_number ? `${deliver.job_number}` : "—"}
                        </div>
                      </div>

                      {baseJob?.notes ? (
                        <div style={notesStyle}>
                          <div style={notesLabelStyle}>Notes</div>
                          <div>{baseJob.notes}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                }

                if (type === "job") {
                  const job = jobsById[String(item?.job_id || "")] || null;
                  const kind = getJobKind(job, runDate);
                  const tone = jobStatusTone(job?.job_status);

                  return (
                    <div
                      key={itemKey(item, runRow.run_number, index)}
                      style={{
                        ...jobCardStyle,
                        background: kind === "Collection" ? "#edf5ff" : "#eef8f1",
                        border: kind === "Collection" ? "1px solid #cfe0fb" : "1px solid #cfe9d6",
                      }}
                    >
                      <div style={topRowStyle}>
                        <div
                          style={pillStyle(
                            kind === "Collection" ? "#dceaff" : "#d9f0df",
                            kind === "Collection" ? "#28579e" : "#2f6d42"
                          )}
                        >
                          {kind}
                        </div>
                        {job?.job_status ? (
                          <div style={pillStyle(tone.bg, tone.fg)}>{String(job.job_status).replace(/_/g, " ")}</div>
                        ) : null}
                      </div>

                      <div style={titleStyle}>{job?.job_number || "Job"}</div>
                      {job?.site_name ? <div style={siteNameStyle}>{job.site_name}</div> : null}
                      {job ? <div style={addrStyle}>{niceAddr(job)}</div> : null}

                      {job?.payment_type ? (
                        <div style={subRowStyle}>
                          <strong>Payment:</strong> {job.payment_type}
                        </div>
                      ) : null}

                      {job?.notes ? (
                        <div style={notesStyle}>
                          <div style={notesLabelStyle}>Notes</div>
                          <div>{job.notes}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <div key={itemKey(item, runRow.run_number, index)} style={unknownCardStyle}>
                    Unknown run item
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
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

const pageStyle = {
  minHeight: "100vh",
  background: "#f5f5f5",
  padding: 12,
  fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
};

const wrapStyle = {
  maxWidth: 680,
  margin: "0 auto",
  display: "grid",
  gap: 12,
};

const headerCardStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
};

const runCardStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
  display: "grid",
  gap: 12,
};

const runHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const runBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "7px 10px",
  borderRadius: 999,
  background: "#111827",
  color: "#fff",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.04em",
};

const jobCardStyle = {
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 8,
};

const yardCardStyle = {
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 2,
  background: "#f6f0ff",
  border: "1px solid #ddd0fb",
};

const unknownCardStyle = {
  borderRadius: 14,
  padding: 12,
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#9f1239",
  fontWeight: 700,
};

const emptyCardStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
};

const topRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const titleStyle = {
  fontSize: 20,
  fontWeight: 900,
  color: "#111827",
  lineHeight: 1.15,
};

const siteNameStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: "#374151",
};

const addrStyle = {
  fontSize: 14,
  color: "#4b5563",
  lineHeight: 1.45,
};

const subRowStyle = {
  fontSize: 14,
  color: "#374151",
  lineHeight: 1.45,
};

const notesStyle = {
  marginTop: 4,
  padding: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 12,
  fontSize: 14,
  color: "#374151",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const notesLabelStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 6,
};

const secondaryBtn = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

const errorStyle = {
  marginTop: 12,
  padding: "10px 12px",
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#9f1239",
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 600,
};
