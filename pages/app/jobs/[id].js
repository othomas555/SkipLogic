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
          collection_date,
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

  // ✅ format status nicely
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

  // ✅ Save general job detail edits (address, notes, delivery date, payment, collection_date)
  async function handleSave() {
    if (!job) return;
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
        collection_date: job.collection_date || null,
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

  // ✅ Status transitions (also handles collection_date for awaiting_collection)
  async function updateJobStatus(newStatus) {
    if (!job) return;
    setSaving(true);
    setErrorMsg("");

    const updates = {
      job_status: newStatus,
    };

    // When booking collection, store the chosen collection_date
    if (newStatus === "awaiting_collection") {
      updates.collection_date = job.collection_date || null;
    }

    const { data, error } = await supabase
      .from("jobs")
      .update(updates)
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId)
      .select(
        `
        id,
        job_number,
        customer_id,
        skip_type_id,
        job_status,
        scheduled_date,
        collection_date,
        notes,
        site_name,
        site_address_line1,
        site_address_line2,
        site_town,
        site_postcode,
        payment_type
      `
      )
      .single();

    if (error) {
      console.error("Status update error:", error);
      setErrorMsg("Could not update job status.");
      setSaving(false);
      return;
    }

    setJob(data);
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
        <p>
          <a href="/app/jobs">← Back to jobs</a>
        </p>
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

      {(authError || errorMsg) && (
        <p style={{ color: "red", marginTop: 8 }}>{authError || errorMsg}</p>
      )}

      {/* Overview */}
      <section
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 24,
          maxWidth: 700,
        }}
      >
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Overview</h2>

        <p style={{ margin: "4px 0" }}>
          <strong>Status:</strong> {formatJobStatus(job.job_status)}
        </p>
        <p style={{ margin: "4px 0" }}>
          <strong>Delivery date:</strong>{" "}
          {job.scheduled_date || "Not set"}
        </p>
        <p style={{ margin: "4px 0" }}>
          <strong>Collection date:</strong>{" "}
          {job.collection_date || "Ready whenever"}
        </p>
        <p style={{ margin: "4px 0" }}>
          <strong>Payment:</strong> {job.payment_type || "Unknown"}
        </p>
      </section>

      {/* ✅ Status Actions */}
      <section
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 24,
          maxWidth: 700,
        }}
      >
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Status actions</h2>

        {job.job_status === "booked" && (
          <div style={{ marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => updateJobStatus("on_hire")}
              disabled={saving}
              style={{
                padding: "8px 12px",
                borderRadius: 4,
                border: "none",
                background: "#0070f3",
                color: "#fff",
                cursor: saving ? "default" : "pointer",
                fontSize: 14,
              }}
            >
              Mark delivered (On hire)
            </button>
            <p style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
              Use this when the skip has been dropped off on site.
            </p>
          </div>
        )}

        {job.job_status === "on_hire" && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                Ready for collection from (optional)
              </label>
              <input
                type="date"
                value={job.collection_date || ""}
                onChange={(e) =>
                  setJob({ ...job, collection_date: e.target.value })
                }
                style={{
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
              <div style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
                Leave blank if the skip is ready for collection at any time.
              </div>
            </div>

            <button
              type="button"
              onClick={() => updateJobStatus("awaiting_collection")}
              disabled={saving}
              style={{
                padding: "8px 12px",
                borderRadius: 4,
                border: "none",
                background: "#fa8c16",
                color: "#fff",
                cursor: saving ? "default" : "pointer",
                fontSize: 14,
              }}
            >
              Book collection (Awaiting collection)
            </button>
            <p style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
              This will mark the job as awaiting collection and store the date
              above if provided.
            </p>
          </>
        )}

        {job.job_status === "awaiting_collection" && (
          <>
            <p style={{ fontSize: 14, marginBottom: 8 }}>
              Skip is awaiting collection.
              <br />
              Collection date:{" "}
              <strong>{job.collection_date || "Any time"}</strong>
            </p>
            <button
              type="button"
              onClick={() => updateJobStatus("collected")}
              disabled={saving}
              style={{
                padding: "8px 12px",
                borderRadius: 4,
                border: "none",
                background: "#389e0d",
                color: "#fff",
                cursor: saving ? "default" : "pointer",
                fontSize: 14,
              }}
            >
              Mark collected
            </button>
          </>
        )}

        {job.job_status === "collected" && (
          <p style={{ fontSize: 14, color: "#555" }}>
            This job has been marked as <strong>collected</strong>.
          </p>
        )}

        {/* Fallback if some other status value appears */}
        {!["booked", "on_hire", "awaiting_collection", "collected"].includes(
          job.job_status || ""
        ) && (
          <p style={{ fontSize: 14, color: "#555" }}>
            No actions available for this status.
          </p>
        )}
      </section>

      {/* Editable job details */}
      <section
        style={{
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          marginBottom: 24,
          maxWidth: 700,
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
