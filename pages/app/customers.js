// pages/app/customers.js
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

export default function CustomersPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

  // For new customer form
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Load customers once we know who the subscriber is
  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return; // useAuthProfile will handle redirect if not signed in

    async function loadData() {
      setErrorMsg("");

      const { data, error } = await supabase
        .from("customers")
        .select("id, name, contact_name, email, phone")
        .eq("subscriber_id", subscriberId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Customers error:", error);
        setErrorMsg("Could not load customers.");
        return;
      }

      setCustomers(data || []);
    }

    loadData();
  }, [checking, subscriberId]);

  async function handleAddCustomer(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Customer name is required.");
      return;
    }

    if (!subscriberId) {
      setErrorMsg("Could not find your subscriber when adding customer.");
      return;
    }

    setSaving(true);

    try {
      // Insert new customer for this subscriber
      const { data: inserted, error: insertError } = await supabase
        .from("customers")
        .insert([
          {
            subscriber_id: subscriberId,
            name: name.trim(),
            contact_name: contactName.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
          },
        ])
        .select("id, name, contact_name, email, phone")
        .single();

      if (insertError) {
        console.error("Insert customer error:", insertError);
        setErrorMsg("Could not save customer.");
        setSaving(false);
        return;
      }

      // Prepend to list so it appears at the top
      setCustomers((prev) => [inserted, ...prev]);

      // Clear form
      setName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setSaving(false);
    } catch (err) {
      console.error("Unexpected error adding customer:", err);
      setErrorMsg("Something went wrong while adding the customer.");
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
        <p>Loading your customers…</p>
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
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Customers</h1>
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

      {/* Add Customer Form */}
      <section
        style={{
          marginBottom: 32,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          maxWidth: 600,
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Add a customer</h2>
        <form onSubmit={handleAddCustomer}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Customer name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
              placeholder="Cox Skip & Waste Management Ltd"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Contact name
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
              placeholder="Jane Smith"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
              placeholder="accounts@example.com"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
              placeholder="01633 123456"
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
            {saving ? "Saving…" : "Add customer"}
          </button>
        </form>
      </section>

      {/* Customers List */}
      <section>
        {customers.length === 0 ? (
          <p>No customers found yet.</p>
        ) : (
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              maxWidth: 800,
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
                  Name
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Contact
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Email
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Phone
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {c.name}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {c.contact_name}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {c.email}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {c.phone}
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
