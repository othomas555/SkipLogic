// pages/app/driver.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

function todayYMD() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function jobTypeForDay(job, selectedDate) {
  const isDelivery = job.scheduled_date === selectedDate;
  const isCollection = job.collection_date === selectedDate;
  if (isDelivery && isCollection) return "Delivery & Collection";
  if (isDelivery) return "Delivery";
  if (isCollection) return "Collection";
  return "Other";
}

function typeColor(type) {
  if (type === "Delivery") return "#0070f3";
  if (type === "Collection") return "#fa8c16";
  if (type === "Delivery & Collection") return "#722ed1";
  return "#595959";
}

// Keep this aligned with your scheduler “actionable” rules
function isActionableForDay(job, selectedDate) {
  const type = jobTypeForDay(job, selectedDate);
  const status = String(job.job_status || "").toLowerCase();

  // collection tasks: must NOT already be collected
  if (type === "Collection" || type === "Delivery & Collection") {
    if (status === "collected") return false;
    // If you use a separate actual date field and it exists, it also blocks
    if (job.collection_actual_date) return false;
  }

  // delivery tasks: must NOT already be delivered/collected
  if (type === "Delivery" || type === "Delivery & Collection") {
    if (status === "delivered" || status === "collected") return false;
    if (job.delivery_actual_date) return false;
  }

  // For “other” we don’t show it on driver page
  if (type === "Other") return false;

  return true;
}

export default function DriverDayPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedDate, setSelectedDate] = useState(todayYMD);

  const [drivers, setDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");

  const [skipTypeNameById, setSkipTypeNameById] = useState({});
  const [jobs, setJobs] = useState([]);

  // Load drivers + skip types once subscriber is known
  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;

    async function loadBase() {
      setLoading(true);
      setErrorMsg("");

      // Drivers
      const { data: driverRows, error: dErr } = await supabase
        .from("drivers")
        .select("id, name, callsign, email, is_active")
        .eq("subscriber_id", subscriberId)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (dErr) {
        console.error(dErr);
        setErrorMsg("Could not load drivers.");
        setDrivers([]);
      } else {
        const list = Array.isArray(driverRows) ? driverRows : [];
        setDrivers(list);

        // Try auto-pick:
        // 1) localStorage
        // 2) match by email
        let chosen = "";
        try {
          chosen = localStorage.getItem("skiplogic_driver_selected_id") || "";
        } catch {}

        const email = String(user?.email || "").trim().toLowerCase();
        if (!chosen && email) {
          const match = list.find((d) => String(d.email || "").trim().toLowerCase() === email);
          if (match?.id) chosen = match.id;
        }

        // If still none, choose first driver
        if (!chosen && list[0]?.id) chosen = list[0].id;

        setSelectedDriverId(chosen);
      }

      // Skip types
      const { data: stRows, error: stErr } = await supabase
        .from("skip_types")
        .select("id, name")
        .eq("subscriber_id", subscriberId)
        .order("name", { ascending: true });

      if (stErr) {
        console.error(stErr);
        setSkipTypeNameById({});
      } else {
        const map = {};
        (stRows || []).forEach((r) => {
          map[r.id] = r.name;
        });
        setSkipTypeNameById(map);
      }

      setLoading(false);
    }

    loadBase();
  }, [checking, subscriberId, user?.email]);

  // Persist driver selection
  useEffect(() => {
    if (!selectedDriverId) return;
    try {
      localStorage.setItem("skiplogic_driver_selected_id", selectedDriverId);
    } catch {}
  }, [selectedDriverId]);

  // Load jobs for the chosen driver + date
  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;
    if (!selectedDriverId) return;

    async function loadJobs() {
      setErrorMsg("");

      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, job_number, customer_id, job_status, scheduled_date, collection_date, site_name, site_address_line1, site_postcode, skip_type_id, payment_type, assigned_driver_id, created_at"
        )
        .eq("subscriber_id", subscriberId)
        .eq("assigned_driver_id", selectedDriverId)
        .or(`scheduled_date.eq.${selectedDate},collection_date.eq.${selectedDate}`)
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        setErrorMsg("Could not load jobs for this day.");
        setJobs([]);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      // Only show actionable work for that day
      const actionable = rows.filter((j) => isActionableForDay(j, selectedDate));
      setJobs(actionable);
    }

    loadJobs();
  }, [checking, subscriberId, selectedDriverId, selectedDate]);

  const selectedDriver = useMemo(() => {
    return drivers.find((d) => d.id === selectedDriverId) || null;
  }, [drivers, selectedDriverId]);

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Driver</h1>
        <p>You must be signed in.</p>
        <button onClick={() => router.push("/login")} style={btnPrimary}>
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>Driver day plan</h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>
            Signed in as <b>{user.email}</b>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/app" style={btnSecondaryLink}>
              ← Back to dashboard
            </Link>
            <Link href="/app/jobs/scheduler" style={btnSecondaryLink}>
              Open scheduler
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Driver</label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              style={inputStyle}
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {(d.callsign || d.name || "Driver") + (d.email ? ` (${d.email})` : "")}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {(authError || errorMsg) && (
        <div style={{ marginTop: 14 }}>
          <div style={alertError}>{authError || errorMsg}</div>
        </div>
      )}

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              {selectedDriver ? (selectedDriver.callsign || selectedDriver.name) : "Driver"} — Jobs
            </h2>
            <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
              Showing actionable deliveries/collections for <b>{selectedDate}</b>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#666", alignSelf: "flex-end" }}>
            Total: <b>{jobs.length}</b>
          </div>
        </div>

        {!jobs.length ? (
          <div style={{ marginTop: 12, fontSize: 13, color: "#666" }}>
            No planned work for this day.
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {jobs.map((job) => {
              const type = jobTypeForDay(job, selectedDate);
              const skipName =
                (job.skip_type_id && skipTypeNameById[job.skip_type_id]) || "";
              return (
                <div key={job.id} style={jobCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>
                      {job.job_number || job.id}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: typeColor(type),
                        color: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {type}
                    </div>
                  </div>

                  <div style={{ marginTop: 6, color: "#333", fontSize: 13 }}>
                    {job.site_name || "—"}
                  </div>

                  <div style={{ marginTop: 3, color: "#555", fontSize: 12 }}>
                    {job.site_address_line1 ? job.site_address_line1 : ""}
                    {job.site_postcode ? `${job.site_address_line1 ? ", " : ""}${job.site_postcode}` : ""}
                  </div>

                  <div style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={metaPill}>Status: {job.job_status || "—"}</div>
                    {skipName ? <div style={metaPill}>Skip: {skipName}</div> : null}
                    <div style={metaPill}>Payment: {job.payment_type || "—"}</div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <Link href={`/app/jobs/${job.id}`} style={smallLink}>
                      View / update job
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#fff",
};

const centerStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};

const cardStyle = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 14,
  marginTop: 14,
  background: "#fff",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  color: "#222",
  fontWeight: 700,
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
  minWidth: 220,
};

const btnPrimary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #0070f3",
  background: "#0070f3",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondaryLink = {
  ...btnSecondary,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const alertError = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#8a1f1f",
  fontSize: 13,
  whiteSpace: "pre-wrap",
};

const jobCard = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
};

const metaPill = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid #e5e5e5",
  background: "#fafafa",
  color: "#444",
};

const smallLink = {
  fontSize: 12,
  textDecoration: "underline",
  color: "#0070f3",
};
