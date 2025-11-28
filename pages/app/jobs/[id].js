import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const jobId = Array.isArray(id) ? id[0] : id;

  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (checking) return;
    if (!subscriberId || !jobId) return;

    async function loadJob() {
      setErrorMsg("");
      setLoading(true);

      const { data, error } = await supabase
        .from("jobs")
        .select(
          `
          id,
          job_number,
          customer_id,
          skip_type_id,
          job_status,
          scheduled_date,
          notes,
          site_name,
          site_address_line1,
          site_address_line2,
          site_town,
          site_postcode,
          payment_type
        `
        )
        .eq("subscriber_id", subscriberId)
        .eq("id", jobId)
        .single();

      if (error) {
        console.error("Error loading job:", error);
        setErrorMsg("Could not load job.");
      } else {
        setJob(data);
      }

      setLoading(false);
    }

    loadJob();
  }, [checking, subscriberId, jobId]);

  // ✅ NEW: format status nicely
  function formatJobStatus(status) {
    switch (status) {
      case "booked":
        return "Booked";
      case "on_hire":
        return "On hire";
      case "awaiting_collection":
        return "Awaiting collection";
      case "collected":
        return "Collected";
      default:
        return status || "Unknown";
    }
  }

  async function handleSave() {
    setSaving(true);
    setErrorMsg("");

    const { error } = await supabase
      .from("jobs")
      .update({
        site_name: job.site_name,
        site_address_line1: job.site_address_line1,
        site_address_line2: job.site_address_line2,
        site_town: job.site_town,
        site_postcode: job.site_postcode,
        scheduled_date: job.scheduled_date,
        notes: job.notes,
        payment_type: job.payment_type,
      })
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId);

    if (error) {
      console.error("Save error:", error);
      setErrorMsg("Could not save job.");
    }

    setSaving(false);
  }

  if (checking || loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p>Loading job…</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main style={{ padding: 24 }}>
        <p>Job not found.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>
        Job {job.job_number || job.id}
      </h1>

      <p>
        <a href="/app/jobs" style={{ fontSize: 14 }}>
          ← Back to jobs
        </a>
      </p>

      {errorMsg && (
        <p style={{ color: "red", marginTop: 8 }}>{errorMsg}</p>
      )}

      {/* Overview */}
      <section
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Overview</h2>

        <p>
          <strong>Status:</strong> {formatJobStatus(job.job_status)}
        </p>
        <p>
          <strong>Payment:</strong> {job.payment_type || "Unknown"}
        </p>
      </section>

      {/* Editable fields */}
      <section
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Job details</h2>

        {/* Site fields */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Site name / description
          </label>
          <input
            type="text"
            value={job.site_name || ""}
            onChange={(e) =>
              setJob({ ...job, site_name: e.target.value })
            }
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Address line 1
          </label>
          <input
            type="text"
            value={job.site_address_line1 || ""}
            onChange={(e) =>
              setJob({ ...job, site_address_line1: e.target.value })
            }
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Address line 2
          </label>
          <input
            type="text"
            value={job.site_address_line2 || ""}
            onChange={(e) =>
              setJob({ ...job, site_address_line2: e.target.value })
            }
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>Town</label>
          <input
            type="text"
            value={job.site_town || ""}
            onChange={(e) =>
              setJob({ ...job, site_town: e.target.value })
            }
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>Postcode</label>
          <input
            type="text"
            value={job.site_postcode || ""}
            onChange={(e) =>
              setJob({ ...job, site_postcode: e.target.value })
            }
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
          />
        </div>

        {/* Delivery date */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Delivery date
          </label>
          <input
            type="date"
            value={job.scheduled_date || ""}
            onChange={(e) =>
              setJob({ ...job, scheduled_date: e.target.value })
            }
            style={{
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
          />
        </div>

        {/* Payment type */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>
            Payment type
          </label>
          <select
            value={job.payment_type || ""}
            onChange={(e) =>
              setJob({ ...job, payment_type: e.target.value })
            }
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
            }}
          >
            <option value="">Select</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="account">Account</option>
          </select>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4 }}>Notes</label>
          <textarea
            value={job.notes || ""}
            onChange={(e) =>
              setJob({ ...job, notes: e.target.value })
            }
            rows={3}
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 4,
              border: "1px solid #ccc",
              resize: "vertical",
            }}
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            background: saving ? "#777" : "#0070f3",
            color: "#fff",
            fontWeight: 500,
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </section>
    </main>
  );
}
