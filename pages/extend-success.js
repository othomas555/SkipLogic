import { useRouter } from "next/router";

export default function ExtendSuccessPage() {
  const router = useRouter();
  const jobId = Array.isArray(router.query?.job_id) ? router.query.job_id[0] : router.query?.job_id;

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Extension payment received</h1>
        <div style={successStyle}>
          Thank you. Your extension payment has been received and your hire will be updated shortly.
        </div>
        <p style={textStyle}>
          Reference: <b>{jobId || "—"}</b>
        </p>
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
  maxWidth: 640,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
};
const titleStyle = { margin: "0 0 12px", fontSize: 28, color: "#111827" };
const textStyle = { margin: "0 0 14px", color: "#374151", lineHeight: 1.6 };
const successStyle = {
  marginBottom: 14,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
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
