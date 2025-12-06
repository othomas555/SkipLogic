// pages/app/jobs/index.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function JobsPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } =
    useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [actionLoadingKey, setActionLoadingKey] = useState(null); // jobId:eventType

  // -------- Load jobs + customers ----------
  async function loadData() {
    if (checking) return;

    if (!user) {
      setLoading(false);
      return;
    }

    if (!subscriberId) {
      setErrorMsg("No subscriber found for this user.");
      setLoading(false);
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    // 1) Load customers for name lookup
    const { data: customerData, error: customersError } = await supabase
      .from("customers")
      .select("id, first_name, last_name, company_name")
      .eq("subscriber_id", subscriberId)
      .order("company_name", { ascending: true });

    if (customersError) {
      console.error("Customers error:", customersError);
      setErrorMsg("Could not load customers.");
      setLoading(false);
      return;
    }
    setCustomers(customerData || []);

    // 2) Load jobs for this subscriber
    const { data: jobData, error: jobsError } = await supabase
      .from("jobs")
      .select(
        `
          id,
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
      .eq("subscriber_id", subscriberId)
      .order("created_at", { ascending: false });

    if (jobsError) {
      console.error("Jobs error:", jobsError);
      setErrorMsg("Could not load jobs.");
      setLoading(false);
      return;
    }

    setJobs(jobData || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [checking, user, subscriberId]);

  function findCustomerNameById(customerId) {
    const c = customers.find((cust) => cust.id === customerId);
    if (!c) return "Unknown customer";
    const baseName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (c.company_name) {
      return `${c.company_name} – ${baseName || "Unknown contact"}`;
    }
    return baseName || "Unknown customer";
  }

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

  function isActionLoading(jobId, eventType) {
    return actionLoadingKey === `${jobId}:${eventType}`;
  }

  // --------- Create job event helper ----------
  async function createJobEvent(jobId, eventType) {
    if (!subscriberId) {
      setErrorMsg("No subscriber found for this user.");
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    setActionLoadingKey(`${jobId}:${eventType}`);

    // ⚠️ IMPORTANT:
    // These argument names (_job_id, _subscriber_id, etc.) MUST match
    // your Postgres function definition for create_job_event.
    // If your function uses different names, just change them here.
    const { error } = await supabase.rpc("create_job_event", {
      _job_id: jobId,
      _subscriber_id: subscriberId,
      _event_type: eventType,
      _event_time: new Date().toISOString(),
      _scheduled_time: null,
      _notes: null,
    });

    setActionLoadingKey(null);

    if (error) {
      console.error("create_job_event error:", error);
      setErrorMsg(
        "Could not update job: " + (error.message || "Unknown error")
      );
      return;
    }

    // Nice friendly message
    const label = eventType.replace(/_/g, " ");
    setSuccessMsg(`Job updated: ${label}`);

    // Refresh list so status / dates update
    await loadData();
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
        <p>Loading jobs…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: 24,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1>Jobs</h1>
        <p>You must be signed in to view jobs.</p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid #ccc",
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>Jobs</h1>
          <p style={{ fontSize: 14, color: "#555", margin: 0 }}>
            Signed in as {user.email}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => router.push("/app")}
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #ccc",
              background: "#f5f5f5",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ← Back to dashboard
          </button>
          <button
            type="button"
            onClick={() => router.push("/app/jobs/book")}
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "none",
              background: "#0070f3",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            + Book new job
          </button>
        </div>
      </header>

      {(authError || errorMsg || successMsg) && (
        <div style={{ marginBottom: 16 }}>
          {authError || errorMsg ? (
            <p style={{ color: "red", margin: 0 }}>
              {authError || errorMsg}
            </p>
          ) : null}
          {successMsg ? (
            <p style={{ color: "green", margin: 0 }}>{successMsg}</p>
          ) : null}
        </div>
      )}

      {jobs.length === 0 ? (
        <p>No jobs found yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 900,
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Job #</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Delivery date</th>
                <th style={thStyle}>Collection date</th>
                <th style={thStyle}>Site / Postcode</th>
                <th style={thStyle}>Payment</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td style={tdStyle}>{job.job_number || job.id}</td>
                  <td style={tdStyle}>
                    {findCustomerNameById(job.customer_id)}
                  </td>
                  <td style={tdStyle}>{formatJobStatus(job.job_status)}</td>
                  <td style={tdStyle}>{job.scheduled_date || ""}</td>
                  <td style={tdStyle}>{job.collection_date || ""}</td>
                  <td style={tdStyle}>
                    {job.site_name
                      ? `${job.site_name}, ${job.site_postcode || ""}`
                      : job.site_postcode || ""}
                  </td>
                  <td style={tdStyle}>{job.payment_type || ""}</td>
                  <td style={tdStyle}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <a
                        href={`/app/jobs/${job.id}`}
                        style={{
                          fontSize: 12,
                          textDecoration: "underline",
                          marginBottom: 4,
                        }}
                      >
                        View / Edit
                      </a>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        {/* Mark Delivered: when booked */}
                        {job.job_status === "booked" && (
                          <button
                            type="button"
                            onClick={() =>
                              createJobEvent(job.id, "delivered")
                            }
                            disabled={isActionLoading(job.id, "delivered")}
                            style={smallPrimaryButton}
                          >
                            {isActionLoading(job.id, "delivered")
                              ? "Saving…"
                              : "Mark Delivered"}
                          </button>
                        )}

                        {/* On hire: can request collection, exchange, or mark collected */}
                        {job.job_status === "on_hire" && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                createJobEvent(
                                  job.id,
                                  "customer_requested_collection"
                                )
                              }
                              disabled={isActionLoading(
                                job.id,
                                "customer_requested_collection"
                              )}
                              style={smallSecondaryButton}
                            >
                              {isActionLoading(
                                job.id,
                                "customer_requested_collection"
                              )
                                ? "Saving…"
                                : "Customer Requested Collection"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                createJobEvent(
                                  job.id,
                                  "customer_requested_exchange"
                                )
                              }
                              disabled={isActionLoading(
                                job.id,
                                "customer_requested_exchange"
                              )}
                              style={smallSecondaryButton}
                            >
                              {isActionLoading(
                                job.id,
                                "customer_requested_exchange"
                              )
                                ? "Saving…"
                                : "Customer Requested Exchange"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                createJobEvent(job.id, "collected")
                              }
                              disabled={isActionLoading(job.id, "collected")}
                              style={smallPrimaryButton}
                            >
                              {isActionLoading(job.id, "collected")
                                ? "Saving…"
                                : "Mark Collected"}
                            </button>
                          </>
                        )}

                        {/* Awaiting collection: can mark collected */}
                        {job.job_status === "awaiting_collection" && (
                          <button
                            type="button"
                            onClick={() =>
                              createJobEvent(job.id, "collected")
                            }
                            disabled={isActionLoading(job.id, "collected")}
                            style={smallPrimaryButton}
                          >
                            {isActionLoading(job.id, "collected")
                              ? "Saving…"
                              : "Mark Collected"}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const thStyle = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "8px 6px",
  fontSize: 12,
  fontWeight: 600,
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: "6px",
  fontSize: 12,
};

const baseSmallButton = {
  padding: "4px 8px",
  fontSize: 11,
  borderRadius: 4,
  border: "1px solid transparent",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const smallPrimaryButton = {
  ...baseSmallButton,
  background: "#0070f3",
  color: "#fff",
  borderColor: "#0070f3",
};

const smallSecondaryButton = {
  ...baseSmallButton,
  background: "#f5f5f5",
  color: "#333",
  borderColor: "#ccc",
};
