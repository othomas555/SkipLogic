// pages/app/jobs/index.js
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function JobsListPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [lastEventsByJobId, setLastEventsByJobId] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;

    async function loadData() {
      setLoading(true);
      setErrorMsg("");

      // 1) Load customers for labels
      const { data: customerData, error: customersError } = await supabase
        .from("customers")
        .select(
          `
          id,
          first_name,
          last_name,
          company_name
        `
        )
        .eq("subscriber_id", subscriberId)
        .order("last_name", { ascending: true });

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
          skip_type_id,
          job_status,
          scheduled_date,
          collection_date,
          notes,
          site_name,
          site_address_line1,
          site_town,
          site_postcode,
          payment_type,
          price_inc_vat,
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

      const list = jobData || [];
      setJobs(list);

      // 3) Load last event per job
      if (list.length > 0) {
        const jobIds = list.map((j) => j.id);

        const { data: eventData, error: eventsError } = await supabase
          .from("job_events")
          .select(
            `
            id,
            job_id,
            event_type,
            event_status,
            event_ref,
            event_order,
            event_datetime,
            created_at
          `
          )
          .in("job_id", jobIds)
          .order("event_order", { ascending: true });

        if (eventsError) {
          console.error("Job events error:", eventsError);
          // Don't block the jobs list if this fails
        } else {
          const map = {};
          for (const ev of eventData || []) {
            const jobId = ev.job_id;
            const existing = map[jobId];

            // pick event with highest event_order; break ties by created_at
            if (
              !existing ||
              ev.event_order > existing.event_order ||
              (ev.event_order === existing.event_order &&
                ev.created_at > existing.created_at)
            ) {
              map[jobId] = ev;
            }
          }
          setLastEventsByJobId(map);
        }
      } else {
        setLastEventsByJobId({});
      }

      setLoading(false);
    }

    loadData();
  }, [checking, subscriberId]);

  function formatJobStatusLabel(status) {
    switch (status) {
      case "booked":
        return "Booked";
      case "delivered":
        return "Delivered";
      case "awaiting_collection":
        return "Awaiting collection";
      case "collected":
        return "Collected";
      case "cancelled":
        return "Cancelled";
      default:
        return status || "Unknown";
    }
  }

  function formatEventTypeLabel(type) {
    switch (type) {
      case "delivery":
        return "Delivery";
      case "collection":
        return "Collection";
      case "exchange":
        return "Exchange";
      case "move":
        return "Move";
      case "note":
        return "Note";
      default:
        return type || "Unknown";
    }
  }

  function formatEventStatusLabel(status) {
    switch (status) {
      case "planned":
        return "planned";
      case "assigned":
        return "assigned";
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "cancelled":
        return "cancelled";
      default:
        return status || "unknown";
    }
  }

  function formatCustomerLabel(customerId) {
    const c = customers.find((cust) => cust.id === customerId);
    if (!c) return "Unknown customer";
    const baseName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (c.company_name) {
      return `${c.company_name} – ${baseName || "Unknown contact"}`;
    }
    return baseName || "Unknown customer";
  }

  function getLastEventForJob(jobId) {
    return lastEventsByJobId[jobId] || null;
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
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Jobs</h1>
          {user?.email && (
            <p style={{ fontSize: 14, color: "#555" }}>
              Signed in as {user.email}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="/app/jobs/book"
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #0070f3",
              background: "#0070f3",
              color: "#fff",
              fontSize: 14,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            + Book a skip
          </a>
          <a
            href="/app/jobs/scheduler"
            style={{
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid #ccc",
              background: "#f5f5f5",
              color: "#333",
              fontSize: 14,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Open scheduler
          </a>
        </div>
      </header>

      {(authError || errorMsg) && (
        <p style={{ color: "red", marginBottom: 16 }}>
          {authError || errorMsg}
        </p>
      )}

      {jobs.length === 0 ? (
        <p>No jobs found yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 4px",
                  }}
                >
                  Job no.
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 4px",
                  }}
                >
                  Customer
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 4px",
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 4px",
                  }}
                >
                  Last event
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 4px",
                  }}
                >
                  Site
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 4px",
                  }}
                >
                  Payment
                </th>
                <th
                  style={{
                    textAlign: "right",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 4px",
                  }}
                >
                  Price inc VAT
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px 4px",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const lastEvent = getLastEventForJob(job.id);
                const siteLabel = job.site_name
                  ? `${job.site_name}, ${job.site_postcode || ""}`
                  : job.site_postcode || "";

                return (
                  <tr key={job.id}>
                    <td
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #eee",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {job.job_number || job.id}
                    </td>
                    <td
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      {formatCustomerLabel(job.customer_id)}
                    </td>
                    <td
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      {formatJobStatusLabel(job.job_status)}
                    </td>
                    <td
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #eee",
                        fontSize: 12,
                      }}
                    >
                      {lastEvent ? (
                        <>
                          <div>
                            {formatEventTypeLabel(lastEvent.event_type)}{" "}
                            {lastEvent.event_ref
                              ? `(${lastEvent.event_ref})`
                              : null}
                          </div>
                          <div style={{ color: "#666" }}>
                            {formatEventStatusLabel(lastEvent.event_status)}
                            {lastEvent.event_datetime
                              ? ` – ${new Date(
                                  lastEvent.event_datetime
                                ).toLocaleString()}`
                              : ""}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#999" }}>No events</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #eee",
                        fontSize: 12,
                      }}
                    >
                      {siteLabel || <span style={{ color: "#999" }}>–</span>}
                    </td>
                    <td
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #eee",
                        fontSize: 12,
                      }}
                    >
                      {job.payment_type || <span style={{ color: "#999" }}>–</span>}
                    </td>
                    <td
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #eee",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {job.price_inc_vat != null
                        ? `£${Number(job.price_inc_vat).toFixed(2)}`
                        : "–"}
                    </td>
                    <td
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #eee",
                        fontSize: 12,
                      }}
                    >
                      <a href={`/app/jobs/${job.id}`}>View / edit</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
