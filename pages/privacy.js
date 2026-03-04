import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fafafa" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", paddingTop: 18 }}>
        <Link href="/" style={{ textDecoration: "none" }}>← Back</Link>
        <h1 style={{ marginTop: 14 }}>Privacy</h1>
        <p style={{ color: "#555", lineHeight: 1.7 }}>
          Placeholder privacy page. Next we’ll add what data you store, retention, subprocessors (Stripe/Supabase), and GDPR contact details.
        </p>
      </div>
    </main>
  );
}
