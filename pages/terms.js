import Link from "next/link";

export default function TermsPage() {
  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fafafa" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", paddingTop: 18 }}>
        <Link href="/" style={{ textDecoration: "none" }}>← Back</Link>
        <h1 style={{ marginTop: 14 }}>Terms</h1>
        <p style={{ color: "#555", lineHeight: 1.7 }}>
          Placeholder terms page. Next we’ll add proper subscription terms, acceptable use, data processing, and cancellation policy.
        </p>
      </div>
    </main>
  );
}
