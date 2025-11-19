// pages/app/jobs.js
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

export default function JobsPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);

  // Skip types state
  const [skipTypes, setSkipTypes] = useState([]);
  const [selectedSkipTypeId, setSelectedSkipTypeId] = useState("");

  const [errorMsg, setErrorMsg] = useState("");

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [saving, setSaving] = useState(false);

  // New form fields
  const [siteName, setSiteName] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteTown, setSiteTown] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [scheduledDate, setScheduledDate] = useState(""); // yyyy-mm-dd string
  const [notes, setNotes] = useState("");
  const [paymentType, setPaymentType] = useState("card"); // card | cash | account etc.

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return; // useAuthProfile handles redirect if not signed in

    async function loadData() {
      setErrorMsg("");

      // 1) Load customers for this subscriber
      const { data: customerData, error: customersError } = await supabase
        .from("customers")
        .select("id, first_name, last_name, company_name")
        .eq("subscriber_id", subscriberId)
        .order("last_name", { ascending: true });

      if (customersError) {
        console.error("Customers error:", customersError);
        setErrorMsg("Could not load customers.");
        return;
      }

      setCustomers(customerData || []);

      // 2) Load jobs for this subscriber
      const { data: jobData, error: jobsError } = await supabase
        .from("jobs")
        .select(
          `
          id,
          customer_id,
          skip_type_id,
          job_status,
          scheduled_date,
          notes,
          site_name,
          site_address_line1,
          site_town,
          site_postcode,
          payment_type
        `
        )
        .eq("subscriber_id", subscriberId)
        .order("created_at", { ascending: false });

      if (jobsError) {
        console.error("Jobs error:", jobsError);
        setErrorMsg("Could not load jobs.");
        return;
      }

      setJobs(jobData || []);

      // 3) Load skip types for this subscriber
      const { data: skipTypesData, error: skipTypesError } = await supabase
        .from("skip_types")
        .select("id, name, quantity_owned")
        .eq("subscriber_id", subscriberId)
        .order("name", { ascending: true });

      if (skipTypesError) {
        console.error("Skip types error:", skipTypesError);
        // don’t hard fail the page, just show message
        setErrorMsg("Could not load skip types.");
      } else {
        setSkipTypes(skipTypesData || []);
      }
    }

    loadData();
  }, [checking, subscriberId]);

  async function handleAddJob(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!selectedCustomerId) {
      setErrorMsg("Please select a customer.");
      return;
    }

    if (!selectedSkipTypeId) {
      setErrorMsg("Please select a skip type.");
      return;
    }

    if (!subscriberId) {
      setErrorMsg("Could not find your subscriber when adding job.");
      return;
    }

    setSaving(true);

    try {
      // Find the selected skip type
      const selectedSkip = skipTypes.find((s) => s.id === selectedSkipTypeId);

      if (!selectedSkip) {
        setErrorMsg("Selected skip type not found.");
        setSaving(false);
        return;
      }

      // Insert job - aligned with jobs table shape
      const { data: inserted, error: insertError } = await supabase
        .from("jobs")
        .insert([
          {
            subscriber_id: subscriberId,
            customer_id: selectedCustomerId,
            skip_type_id: selectedSkipTypeId,
            site_name: siteName || null,
            site_address_line1: siteAddress1 || null,
            site_address_line2: siteAddress2 || null,
            site_town: siteTown || null,
            site_postcode: sitePostcode || null,
            scheduled_date: scheduledDate || null,
            notes: notes || `Standard skip: ${selectedSkip.name}`,
            payment_type: paymentType || null,
            // job_status will default to 'booked'
          },
        ])
        .select(
          `
          id,
          customer_id,
          skip_type_id,
          job_status,
          scheduled_date,
          notes,
          site_name,
          site_address_line1,
          site_town,
          site_postcode,
          payment_type
        `
        )
        .single();

      if (insertError) {
        console.error("Insert job error:", insertError);
        setErrorMsg("Could not save job.");
        setSaving(false);
        return;
      }

      // Create initial DELIVER event for this job
      const { data: event, error: eventError } = await supabase.rpc(
        "create_job_event",
        {
          _subscriber_id: subscriberId,
          _job_id: inserted.id,
          _event_type: "DELIVER",
          _scheduled_at: null,
          _completed_at: null,
          _notes: "Initial delivery booked",
        }
      );

      if (eventError) {
        console.error("Create job event error:", eventError);
        setErrorMsg(
          `Job was created but the delivery event failed: ${eventError.message}`
        );
        setSaving(false);
        return;
      }

      // Prepend new job to list
      setJobs((prev) => [inserted, ...prev]);

      // Reset form
      setSelectedCustomerId("");
      setSelectedSkipTypeId("");
      setSiteName("");
      setSiteAddress1("");
      setSiteAddress2("");
      setSiteTown("");
      setSitePostcode("");
      setScheduledDate("");
      setNotes("");
      setPaymentType("card");
      setSaving(false);
    } catch (err) {
      console.error("Unexpected error adding job:", err);
      setErrorMsg("Something went wrong while adding the job.");
      setSaving(false);
    }
  }

  function formatCustomerLabel(c) {
    const baseName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (c.company_name) {
      // e.g. "Acme Ltd – John Smith"
      return `${c.company_name} – ${baseName || "Unknown contact"}`;
    }
    return baseName || "Unknown customer";
  }

  function findCustomerNameById(customerId) {
    const c = customers.find((cust) => cust.id === customerId);
    if (!c) return "Unknown customer";
    const baseName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (c.company_name) {
      return `${c.company_name} – ${baseName || "Unknown contact"}`;
    }
    return baseName || "Unknown customer";
  }

  function findSkipTypeNameById(skipTypeId) {
    const s = skipTypes.find((st) => st.id === skipTypeId);
    if (!s) return "Unknown skip type";
    return `${s.name} (${s.quantity_owned} owned)`;
  }

  if (checking) {
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
        <p>Loading your jobs…</p>
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
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Jobs</h1>
        {user?.email && (
          <p style={{ fontSize: 14, color: "#555" }}>
            Signed in as {user.email}
          </p>
        )}
        <p style={{ marginTop: 8 }}>
          <a href="/app" style={{ fontSize: 14 }}>
            ← Back to dashboard
          </a>
        </p>
      </header>

      {(authError || errorMsg) && (
        <p style={{ color: "red", marginBottom: 16 }}>
          {authError || errorMsg}
        </p>
      )}

      {/* Book A Standard Skip Form */}
      <section
        style={{
          marginBottom: 32,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          maxWidth: 700,
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>
          Book A Standard Skip
        </h2>
        <form onSubmit={handleAddJob}>
          {/* Customer */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Customer *
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatCustomerLabel(c)}
                </option>
              ))}
            </select>
          </div>

          {/* Skip type */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Skip type *
            </label>
            <select
              value={selectedSkipTypeId}
              onChange={(e) => setSelectedSkipTypeId(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            >
              <option value="">Select a skip type…</option>
              {skipTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.quantity_owned} owned)
                </option>
              ))}
            </select>
          </div>

          {/* Delivery site */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Site name / description (optional)
            </label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Front drive, Unit 3, Rear yard"
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
              Site address line 1
            </label>
            <input
              type="text"
              value={siteAddress1}
              onChange={(e) => setSiteAddress1(e.target.value)}
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
              Site address line 2 (optional)
            </label>
            <input
              type="text"
              value={siteAddress2}
              onChange={(e) => setSiteAddress2(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            />
          </div>

          <div
            style={{
              marginBottom: 12,
              display: "flex",
              gap: 8,
            }}
          >
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 4 }}>Town</label>
              <input
                type="text"
                value={siteTown}
                onChange={(e) => setSiteTown(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>
            <div style={{ width: 160 }}>
              <label style={{ display: "block", marginBottom: 4 }}>
                Postcode
              </label>
              <input
                type="text"
                value={sitePostcode}
                onChange={(e) => setSitePostcode(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>
          </div>

          {/* Delivery date */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Delivery date
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
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
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            >
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="account">Account</option>
            </select>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "8px 16px",
              borderRadius: 4,
              border: "none",
              cursor: saving ? "default" : "pointer",
              backgroundColor: saving ? "#999" : "#0070f3",
              color: "#fff",
              fontWeight: 500,
            }}
          >
            {saving ? "Saving…" : "Book A Standard Skip"}
          </button>
        </form>
      </section>

      {/* Jobs List */}
      <section>
        {jobs.length === 0 ? (
          <p>No jobs found yet.</p>
        ) : (
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              maxWidth: 1000,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Customer
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Skip type
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Site / Postcode
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Delivery date
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Payment
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Job status
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {findCustomerNameById(j.customer_id)}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {findSkipTypeNameById(j.skip_type_id)}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.site_name
                      ? `${j.site_name}, ${j.site_postcode || ""}`
                      : j.site_postcode || ""}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.scheduled_date || ""}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.payment_type || ""}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.job_status || "unknown"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
