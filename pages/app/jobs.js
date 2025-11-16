// pages/app/jobs.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

export default function JobsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState(null);

  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);

  // NEW: skip types state
  const [skipTypes, setSkipTypes] = useState([]);
  const [selectedSkipTypeId, setSelectedSkipTypeId] = useState("");

  const [errorMsg, setErrorMsg] = useState("");

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [status, setStatus] = useState("open");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      // 1) Check auth
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      setUserEmail(user.email ?? null);

      // 2) Load customers (for dropdown)
      const { data: customerData, error: customersError } = await supabase
        .from("customers")
        .select("id, name")
        .order("name", { ascending: true });

      if (customersError) {
        console.error("Customers error:", customersError);
        setErrorMsg("Could not load customers.");
        setChecking(false);
        return;
      }

      setCustomers(customerData || []);

      // 3) Load jobs (for list)
      const { data: jobData, error: jobsError } = await supabase
        .from("jobs")
        .select(
          `
          id,
          description,
          status,
          customers (
            name
          )
        `
        )
        .order("created_at", { ascending: false });

      if (jobsError) {
        console.error("Jobs error:", jobsError);
        setErrorMsg("Could not load jobs.");
        setChecking(false);
        return;
      }

      setJobs(jobData || []);

      // 4) Load skip types (for Book A Standard Skip dropdown)
      const { data: skipTypesData, error: skipTypesError } = await supabase
        .from("skip_types")
        .select("id, name, quantity_owned")
        .order("name", { ascending: true });

      if (skipTypesError) {
        console.error("Skip types error:", skipTypesError);
        // don't hard fail the page, just show message
        setErrorMsg("Could not load skip types.");
      } else {
        setSkipTypes(skipTypesData || []);
      }

      setChecking(false);
    }

    loadData();
  }, [router]);

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

    setSaving(true);

    try {
      // Get profile so we know subscriber_id
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("subscriber_id")
        .single();

      if (profileError || !profile) {
        console.error("Profile error:", profileError);
        setErrorMsg("Could not find your subscriber when adding job.");
        setSaving(false);
        return;
      }

      const subscriberId = profile.subscriber_id;

      // Find the selected skip type
      const selectedSkip = skipTypes.find(
        (s) => s.id === selectedSkipTypeId
      );

      if (!selectedSkip) {
        setErrorMsg("Selected skip type not found.");
        setSaving(false);
        return;
      }

      // Insert job - store skip type name in description
      const { data: inserted, error: insertError } = await supabase
        .from("jobs")
        .insert([
          {
            subscriber_id: subscriberId,
            customer_id: selectedCustomerId,
            description: selectedSkip.name,
            status,
          },
        ])
        .select(
          `
          id,
          description,
          status,
          customers (
            name
          )
        `
        )
        .single();

      if (insertError) {
        console.error("Insert job error:", insertError);
        setErrorMsg("Could not save job.");
        setSaving(false);
        return;
      }

      // Prepend new job to list
      setJobs((prev) => [inserted, ...prev]);

      // Reset form
      setSelectedCustomerId("");
      setSelectedSkipTypeId("");
      setStatus("open");
      setSaving(false);
    } catch (err) {
      console.error("Unexpected error adding job:", err);
      setErrorMsg("Something went wrong while adding the job.");
      setSaving(false);
    }
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
        {userEmail && (
          <p style={{ fontSize: 14, color: "#555" }}>
            Signed in as {userEmail}
          </p>
        )}
        <p style={{ marginTop: 8 }}>
          <a href="/app" style={{ fontSize: 14 }}>
            ← Back to dashboard
          </a>
        </p>
      </header>

      {errorMsg && (
        <p style={{ color: "red", marginBottom: 16 }}>{errorMsg}</p>
      )}

      {/* Book A Standard Skip Form */}
      <section
        style={{
          marginBottom: 32,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          maxWidth: 600,
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>
          Book A Standard Skip
        </h2>
        <form onSubmit={handleAddJob}>
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
                  {c.name}
                </option>
              ))}
            </select>
          </div>

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

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            >
              <option value="open">Open</option>
              <option value="booked">Booked</option>
              <option value="completed">Completed</option>
            </select>
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
              maxWidth: 900,
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
                  Description (skip type)
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Status
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
                    {j.customers?.name || "Unknown customer"}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.description}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.status}
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
