// pages/app/jobs/[id].js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState("");

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [job, setJob] = useState(null);

  // Editable fields (basic)
  const [siteName, setSiteName] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [scheduledDate, setScheduledDate] = useState(""); // YYYY-MM-DD
  const [collectionDate, setCollectionDate] = useState(""); // YYYY-MM-DD
  const [paymentType, setPaymentType] = useState("");
  const [jobStatus, setJobStatus] = useState("");

  async function loadJob() {
    if (checking) return;
    if (!user || !subscriberId || !id) return;

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const { data, error } = await supabase
      .from("jobs")
      .select(
        `
        id,
        subscriber_id,
        job_number,
        customer_id,
        job_status,
        scheduled_date,
        collection_date,
        site_name,
        site_postcode,
        payment_type,
        created_at
      `
      )
      .eq("id", id)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (error) {
      console.error(error);
      setErrorMsg("Could not load job.");
      setLoading(false);
      return;
    }

    if (!data) {
      setErrorMsg("Job not found (or you don't have access).");
      setLoading(false);
      return;
    }

    setJob(data);
    setSiteName(data.site_name || "");
    setSitePostcode(data.site_postcode || "");
    setScheduledDate(data.scheduled_date || "");
    setCollectionDate(data.collection_date || "");
    setPaymentType(data.payment_type || "");
    setJobStatus(data.job_status || "");

    setLoading(false);
  }

  useEffect(() => {
    loadJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId, id]);

  const title = useMemo(() => {
    if (!job) return "Job";
    return job.job_number ? `Job ${job.job_number}` : "Job";
  }, [job]);

  async function saveJob() {
    if (!job?.id) return;

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    const patch = {
      site_name: siteName || null,
      site_postcode: sitePostcode || null,
      scheduled_date: scheduledDate || null,
      collection_date: collectionDate || null,
      payment_type: paymentType || null,
      job_status: jobStatus || null,
    };

    const { error } = await supabase
      .from("jobs")
      .update(patch)
      .eq("id", job.id)
      .eq("subscriber_id", subscriberId);

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg("Could not save job: " + (error.message || "Unknown error"));
      return;
    }

    setSuccessMsg("Saved.");
    await loadJob();
  }

  async function runAction(eventType) {
    if (!job?.id) return;

    setActing(eventType);
    setErrorMsg("");
    setSuccessMsg("");

    const { error } = await supabase.rpc("create_job_event", {
      _job_id: job.id,
      _subscriber_id: subscriberId,
      _event_type: eventType,
      _event_time: new Date().toISOString(),
      _scheduled_time: null,
      _notes: null,
    });

    setActing("");

    if (error) {
      console.error(error);
      setErrorMsg("Could not update job: " + (error.message || "Unknown error"));
      return;
    }

    setSuccessMsg(`Updated: ${eventType.replace(/_/g, " ")}`);
    await loadJob();
  }

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
        <h1>Job</h1>
        <p>You must be signed in.</p>
        <button onClick={() => router.push("/login")} style={btnSecondary}>
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>{title}</h1>
          <p style={{ margin: "6px 0 0", color: "#555", fontSize: 13 }}>
            Status: <b>{job.job_status || "—"}</b>
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/jobs" style={{ ...btnSecondary, textDecoration: "none", display: "inline-block" }}>
            ← Back to Jobs
          </Link>
          <button onClick={saveJob} disabled={saving} style={btnPrimary}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {(authError || errorMsg || successMsg) && (
        <div style={{ marginBottom: 14 }}>
          {(authError || errorMsg) ? (
            <p style={{ color: "red", margin: 0 }}>{authError || errorMsg}</p>
          ) : null}
          {successMsg ? <p style={{ color: "green", margin: 0 }}>{successMsg}</p> : null}
        </div>
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>Actions</h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {job.job_status === "booked" && (
            <button style={btnPrimary} disabled={acting === "delivered"} onClick={() => runAction("delivered")}>
              {acting === "delivered" ? "Working…" : "Mark Delivered"}
            </button>
          )}

          {job.job_status === "on_hire" && (
            <button
              style={btnDanger}
              disabled={acting === "undo_delivered"}
              onClick={() => runAction("undo_delivered")}
              title="Revert to booked (keeps scheduled date)"
            >
              {acting === "undo_delivered" ? "Working…" : "Undo Delivered"}
            </button>
          )}
        </div>

        <p style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
          Undo actions log an event (audit trail stays intact). Undo Delivered keeps the scheduled date.
        </p>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Edit job</h2>

        <div style={gridStyle}>
          <label style={labelStyle}>
            Site name
            <input value={siteName} onChange={(e) => setSiteName(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Site postcode
            <input value={sitePostcode} onChange={(e) => setSitePostcode(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Scheduled (delivery) date
            <input type="date" value={scheduledDate || ""} onChange={(e) => setScheduledDate(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Collection date
            <input type="date" value={collectionDate || ""} onChange={(e) => setCollectionDate(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Payment type
            <input value={paymentType} onChange={(e) => setPaymentType(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Job status
            <select value={jobStatus || ""} onChange={(e) => setJobStatus(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              <option value="booked">booked</option>
              <option value="on_hire">on_hire</option>
              <option value="awaiting_collection">awaiting_collection</option>
              <option value="collected">collected</option>
            </select>
          </label>
        </div>
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
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
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const h2Style = { fontSize: 16, margin: "0 0 10px" };

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "#333",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #ccc",
  fontSize: 13,
};

const btnPrimary = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #0070f3",
  background: "#0070f3",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondary = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontSize: 13,
};

const btnDanger = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#8a1f1f",
  cursor: "pointer",
  fontSize: 13,
};
