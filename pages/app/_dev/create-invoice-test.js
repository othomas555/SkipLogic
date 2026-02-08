// pages/app/_dev/create-invoice-test.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function CreateInvoiceTestPage() {
  const { checking, user, subscriberId, errorMsg } = useAuthProfile();

  const [jobId, setJobId] = useState("a675f074-8742-4ccb-8b80-2ed711f77582");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  async function getToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    const token = data?.session?.access_token || null;
    if (!token) throw new Error("No access token (are you logged in via /login?)");
    return token;
  }

  async function createInvoice() {
    setBusy(true);
    setErr("");
    setResult(null);

    try {
      const token = await getToken();
      const id = String(jobId || "").trim();
      if (!id) throw new Error("job_id is required");

      const res = await fetch("/api/xero/xero_create_invoice", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ job_id: id }),
      });

      const json = await res.json().catch(() => ({}));
      setResult({ status: res.status, json });
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setResult(null);
    setErr("");
  }, [jobId]);

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app/settings/invoicing" style={linkStyle}>
            ← Back to Invoicing Settings
          </Link>
          <h1 style={{ margin: "10px 0 0" }}>Create Invoice Test</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Dev-only page to trigger /api/xero/xero_create_invoice for a job_id.
          </p>
        </div>
      </header>

      <section style={cardStyle}>
        <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>
          <div><strong>User:</strong> {user?.email || user?.id || "none"}</div>
          <div><strong>subscriberId:</strong> {subscriberId || "none"}</div>
          <div><strong>Auth checking:</strong> {String(checking)}</div>
          <div><strong>Auth error:</strong> {errorMsg || "none"}</div>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Job ID</h2>

        <input
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          style={inputStyle}
          placeholder="paste jobs.id here"
        />

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button style={btnPrimaryDark} onClick={createInvoice} disabled={busy}>
            {busy ? "Creating…" : "Create invoice"}
          </button>

          <div style={{ fontSize: 12, color: "#666" }}>
            Uses your current invoicing settings account codes.
          </div>
        </div>

        {err ? <p style={{ color: "red", marginTop: 12 }}>{err}</p> : null}

        <h3 style={{ marginTop: 14 }}>Result</h3>
        <pre style={preStyle}>{JSON.stringify(result, null, 2)}</pre>
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f7f7f7",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const linkStyle = {
  textDecoration: "underline",
  color: "#0070f3",
  fontSize: 13,
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const inputStyle = {
  width: "100%",
  maxWidth: 720,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
};

const btnPrimaryDark = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};

const preStyle = {
  background: "#f6f6f6",
  padding: 12,
  borderRadius: 10,
  overflow: "auto",
  minHeight: 60,
};
