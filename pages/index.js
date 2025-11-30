// pages/index.js
import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#f5f5f5",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          width: "100%",
          background: "#fff",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <h1 style={{ marginBottom: "8px" }}>SkipLogic</h1>
        <p style={{ marginBottom: "24px", color: "#555" }}>
          Simple software for skip &amp; waste operators.
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <Link
            href="/login"
            style={{
              padding: "10px 18px",
              borderRadius: "999px",
              background: "#2563eb",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Log in
          </Link>
          <Link
            href="/app"
            style={{
              padding: "10px 18px",
              borderRadius: "999px",
              border: "1px solid #2563eb",
              color: "#2563eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Go to app
          </Link>
        </div>
      </div>
    </main>
  );
}
