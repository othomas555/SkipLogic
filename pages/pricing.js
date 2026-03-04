import Link from "next/link";

function PlanCard({ name, price, tagline, bullets, ctaHref, featured }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: featured ? "2px solid #1677ff" : "1px solid #e5e7eb",
        padding: 18,
        boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
      }}
    >
      {featured ? (
        <div
          style={{
            display: "inline-block",
            padding: "4px 10px",
            borderRadius: 999,
            background: "#e6f4ff",
            color: "#0958d9",
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          Recommended
        </div>
      ) : null}

      <div style={{ marginTop: 10, fontSize: 18, fontWeight: 950 }}>{name}</div>
      <div style={{ marginTop: 6, color: "#555" }}>{tagline}</div>

      <div style={{ marginTop: 12 }}>
        <span style={{ fontSize: 34, fontWeight: 950 }}>£{Number(price).toFixed(0)}</span>
        <span style={{ color: "#666" }}> / month</span>
      </div>

      <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
        <b>30-day free trial</b> — card required, no charge until day 30
      </div>

      <ul style={{ marginTop: 14, paddingLeft: 18, color: "#333", lineHeight: 1.7 }}>
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

      <Link href={ctaHref} style={{ textDecoration: "none" }}>
        <button
          type="button"
          style={{
            width: "100%",
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 12,
            border: "none",
            background: "#1677ff",
            color: "#fff",
            fontWeight: 950,
            cursor: "pointer",
          }}
        >
          Start free trial
        </button>
      </Link>

      <div style={{ marginTop: 10, fontSize: 12, color: "#666", lineHeight: 1.4 }}>
        Cancel anytime. No contract.
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <main style={{ minHeight: "100vh", fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 40px",
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <Link href="/" style={{ fontWeight: 800, fontSize: 18, textDecoration: "none", color: "#111" }}>
          SkipLogic
        </Link>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link href="/signin" style={{ textDecoration: "none" }}>
            Sign in
          </Link>
          <Link href="/signup" style={{ textDecoration: "none" }}>
            <button
              style={{
                background: "#1677ff",
                color: "#fff",
                border: "none",
                padding: "10px 16px",
                borderRadius: 10,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Start free trial
            </button>
          </Link>
        </div>
      </header>

      <section style={{ maxWidth: 980, margin: "0 auto", padding: "46px 20px 10px", textAlign: "center" }}>
        <h1 style={{ fontSize: 40, fontWeight: 950, letterSpacing: -0.4, margin: 0 }}>Pricing</h1>
        <p style={{ marginTop: 12, color: "#555", fontSize: 18, lineHeight: 1.55 }}>
          Built for UK skip operators. Pick a plan, add a card, and start your <b>30-day free trial</b>.
        </p>
      </section>

      <section
        style={{
          maxWidth: 980,
          margin: "0 auto",
          padding: "18px 20px 40px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        <PlanCard
          name="SkipLogic Pro 50"
          price={99}
          tagline="For smaller operators"
          bullets={[
            "Jobs, customers, pricing & scheduling",
            "Driver runs + job status tracking",
            "Email confirmations & reminders",
            "Xero integration (optional add-on)",
          ]}
          ctaHref="/signup"
        />

        <PlanCard
          name="SkipLogic Pro 100"
          price={129}
          tagline="Best value for growing fleets"
          bullets={[
            "Everything in Pro 50",
            "More volume headroom",
            "Priority support",
            "Add-ons: Driver Checks, Vehicle Monitoring, Xero",
          ]}
          ctaHref="/signup"
          featured
        />
      </section>

      <section style={{ maxWidth: 980, margin: "0 auto", padding: "0 20px 60px" }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 18 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Add-ons (paid extras)</div>
          <div style={{ color: "#444", lineHeight: 1.7 }}>
            • Driver Checks (daily walkarounds + defect reporting)<br />
            • Vehicle Monitoring (compliance alerts, MOT/inspection tracking)<br />
            • Xero Integration (invoices, payments, monthly account invoicing)<br />
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
            We’ll wire these as Stripe add-ons once the core onboarding is complete.
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
          <Link href="/terms" style={{ color: "#333" }}>
            Terms
          </Link>
          <Link href="/privacy" style={{ color: "#333" }}>
            Privacy
          </Link>
        </div>
      </section>
    </main>
  );
}
