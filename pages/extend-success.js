import { useRouter } from "next/router";
import { useEffect, useState } from "react";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

export default function ExtendSuccessPage() {
  const router = useRouter();
  const rawJobId = router.query?.job_id;
  const rawSessionId = router.query?.session_id;

  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [jobNumber, setJobNumber] = useState("");
  const [newHireEndDate, setNewHireEndDate] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady) return;
    if (!sessionId) {
      setLoading(false);
      return;
    }

    let alive = true;
    let attempts = 0;
    let timer = null;

    async function poll() {
      try {
        const res = await fetch(`/api/term-hire/checkout-status?session_id=${encodeURIComponent(sessionId)}`);
        const json = await res.json().catch(() => ({}));

        if (!alive) return;

        if (!res.ok) {
          throw new Error(json?.error || "Could not load payment status");
        }

        setJobNumber(asText(json?.job_number));
        setNewHireEndDate(asText(json?.new_hire_end_date));
        setAmountPaid(asText(json?.amount_paid));

        if (json?.status === "paid") {
          setStatus("paid");
          setLoading(false);
          return;
        }

        attempts += 1;
        if (attempts < 12) {
          timer = setTimeout(poll, 1500);
          return;
        }

        setStatus("pending");
        setLoading(false);
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Could not load payment status");
        setLoading(false);
      }
    }

    poll();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [router.isReady, sessionId]);

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={eyebrowStyle}>SkipLogic</div>
        <h1 style={titleStyle}>Extension payment received</h1>

        {loading ? (
          <div style={infoStyle}>
            Thank you. We are confirming your payment and updating your skip hire now.
          </div>
        ) : error ? (
          <div style={warnStyle}>{error}</div>
        ) : status === "paid" ? (
          <div style={successStyle}>
            Thank you. Your skip hire has been extended successfully.
          </div>
        ) : (
          <div style={infoStyle}>
            Thank you. Your payment has been received. Your hire update is still being confirmed.
          </div>
        )}

        <div
          style={{
            marginBottom: 16,
            padding: 14,
            borderRadius: 12,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            color: "#374151",
            lineHeight: 1.7,
          }}
        >
          <div>
            <strong>Job:</strong> {jobNumber || jobId || "—"}
          </div>
          <div>
            <strong>Amount paid:</strong> {amountPaid || "—"}
          </div>
          <div>
            <strong>New hire end date:</strong> {newHireEndDate || "Updating…"}
          </div>
        </div>

        <a href="/" style={linkStyle}>Back to site</a>
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "#f8fafc",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
};
const cardStyle = {
  width: "100%",
  maxWidth: 680,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
};
const eyebrowStyle = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6b7280",
  marginBottom: 8,
};
const titleStyle = { margin: "0 0 12px", fontSize: 28, color: "#111827" };
const successStyle = {
  marginBottom: 14,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  lineHeight: 1.5,
};
const infoStyle = {
  marginBottom: 14,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #cfe0fb",
  background: "#edf5ff",
  color: "#1d4ed8",
  lineHeight: 1.5,
};
const warnStyle = {
  marginBottom: 14,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#991b1b",
  lineHeight: 1.5,
};
const linkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontWeight: 600,
  textDecoration: "none",
};
