// pages/app/jobs/day-planner.js
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function DayPlannerPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;

    async function loadData() {
      setErrorMsg("");
      setLoading(true);

      // Load customers (for labels)
      const { data: customerData, error: customersError } = await supabase
        .from("customers")
        .select("id, first_name, last_name, company_name")
        .eq("subscriber_id", subscriberId)
        .order("last_name", { ascending: true });

      if (customersError) {
        console.error("Customers error:", customersError);
        setErrorMsg("Could not load customers.");
        setLoading(false);
        return;
      }
      setCustomers(customerData || []);

      // Load jobs
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
          payment_type
        `
        )
        .eq("subscriber_id", subscriberId)
        .order("scheduled_date", { ascending: true });

      if (jobsError) {
        console.error("Jobs error:", jobsError);
        setErrorMsg("Could not load jobs.");
        setLoading(false);
        return;
      }

      setJobs(jobData || []);
      setLoading(false);
    }

    loadData();
  }, [checking, subscriberId]);

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

  // Build day-by-day events from jobs
  function buildDayEvents() {
    const eventsByDate = {};

    jobs.forEach((job) => {
      // Delivery event
      if (job.scheduled_date) {
        const date = job.scheduled_date;
        if (!eventsByDate[date]) eventsByDate[date] = [];
        eventsByDate[date].push({
          type: "delivery",
          job,
        });
      }

      // Collection event
      if (job.collection_date) {
        const date = job.collection_date;
        if (!eventsByDate[date]) eventsByDate[date] = [];
        eventsByDate[date].push({
          type: "collection",
          job,
        });
      }
    });

    const dates = Object.keys(eventsByDate).sort(); // yyyy-mm-dd sorts nicely
    return { dates, eventsByDate };
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
        <p>Loading day planner…</p>
      </main>
    );
  }

  const { dates, eventsByDate } = buildDayEvents();

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Day planner</h1>
        {user?.email && (
          <p style={{ fontSize: 14, color: "#555" }}>
            Signed in as {user.email}
          </p>
        )}
        <p style={{ marginTop: 8 }}>
          <a href="/app/jobs" style={{ fontSize: 14 }}>
            ← Back to jobs list
          </a>
        </p>
      </header>

      {(authError || errorMsg) && (
        <p style={{ color: "red", marginBottom: 16 }}>
          {authError || errorMsg}
        </p>
      )}

      {dates.length === 0 ? (
        <p>No scheduled deliveries or collections yet.</p>
      ) : (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 900,
          }}
        >
          {dates.map((date) => (
            <div
              key={date}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                background: "#fafafa",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  marginBottom: 8,
                  fontSize: 18,
                }}
              >
                {date}
              </h2>

              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ddd",
                        padding: "6px 8px",
                        fontSize: 13,
                      }}
                    >
                      Type
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ddd",
                        padding: "6px 8px",
                        fontSize: 13,
                      }}
                    >
                      Job #
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ddd",
                        padding: "6px 8px",
                        fontSize: 13,
                      }}
                    >
                      Customer
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ddd",
                        padding: "6px 8px",
                        fontSize: 13,
                      }}
                    >
                      Site / Postcode
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ddd",
                        padding: "6px 8px",
                        fontSize: 13,
                      }}
                    >
                      Status
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ddd",
                        padding: "6px 8px",
                        fontSize: 13,
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {eventsByDate[date].map((evt, idx) => {
                    const j = evt.job;
                    const typeLabel =
                      evt.type === "delivery" ? "Delivery" : "Collection";
                    const typeColor =
                      evt.type === "delivery" ? "#0070f3" : "#fa8c16";

                    return (
                      <tr key={j.id + "-" + evt.type + "-" + idx}>
                        <td
                          style={{
                            borderBottom: "1px solid #eee",
                            padding: "6px 8px",
                            fontSize: 13,
                          }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 6px",
                              borderRadius: 999,
                              fontSize: 11,
                              background: typeColor,
                              color: "#fff",
                            }}
                          >
                            {typeLabel}
                          </span>
                        </td>
                        <td
                          style={{
                            borderBottom: "1px solid #eee",
                            padding: "6px 8px",
                            fontSize: 13,
                          }}
                        >
                          {j.job_number || j.id}
                        </td>
                        <td
                          style={{
                            borderBottom: "1px solid #eee",
                            padding: "6px 8px",
                            fontSize: 13,
                          }}
                        >
                          {findCustomerNameById(j.customer_id)}
                        </td>
                        <td
                          style={{
                            borderBottom: "1px solid #eee",
                            padding: "6px 8px",
                            fontSize: 13,
                          }}
                        >
                          {j.site_name
                            ? `${j.site_name}, ${j.site_postcode || ""}`
                            : j.site_postcode || ""}
                        </td>
                        <td
                          style={{
                            borderBottom: "1px solid #eee",
                            padding: "6px 8px",
                            fontSize: 13,
                          }}
                        >
                          {formatJobStatus(j.job_status)}
                        </td>
                        <td
                          style={{
                            borderBottom: "1px solid #eee",
                            padding: "6px 8px",
                            fontSize: 13,
                          }}
                        >
                          <a href={`/app/jobs/${j.id}`}>View / Edit</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
