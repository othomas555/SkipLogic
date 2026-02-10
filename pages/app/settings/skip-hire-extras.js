// pages/app/settings/skip-hire-extras.js
import Link from "next/link";

export default function SkipHireExtrasSettings() {
  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app/settings" style={linkStyle}>
            ← Back to settings
          </Link>
          <h1 style={{ margin: "10px 0 0" }}>Settings · Skip hire extras</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Extra weeks, mattresses, overweight, asbestos, etc. (Next)
          </p>
        </div>
      </header>

      <section style={cardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Coming next</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: "#333" }}>
          <li>Over-term hire pricing (e.g. £X per extra week after 14 days)</li>
          <li>Extras price list (mattress, plasterboard, fridge, asbestos handling)</li>
          <li>Overweight rules (by skip size + thresholds)</li>
          <li>How extras map into invoicing</li>
        </ul>
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
