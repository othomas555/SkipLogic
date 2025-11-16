// pages/app/customers.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

export default function CustomersPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

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

      // 2) Load customers (RLS should limit this to your subscriber)
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, contact_name, email, phone")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Customers error:", error);
        setErrorMsg("Could not load customers.");
        setChecking(false);
        return;
      }

      setCustomers(data || []);
      setChecking(false);
    }

    loadData();
  }, [router]);

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
    </main>
  );
}
