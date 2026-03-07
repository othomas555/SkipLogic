import Link from "next/link";

export default function HomePage() {
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
        <div style={{ fontWeight: 800, fontSize: 18 }}>SkipLogic</div>

        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/pricing" style={{ textDecoration: "none", color: "#111" }}>
            Pricing
          </Link>

          <Link href="/login?type=office" style={{ textDecoration: "none", color: "#111" }}>
            Office login
          </Link>

          <Link href="/login?type=driver" style={{ textDecoration: "none", color: "#111" }}>
            Driver sign in
          </Link>

          <Link href="/pricing" style={{ textDecoration: "none" }}>
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

      <section style={{ maxWidth: 980, margin: "70px auto", textAlign: "center", padding: "0 20px" }}>
        <h1 style={{ fontSize: 44, fontWeight: 950, marginBottom: 14, letterSpacing: -0.4 }}>
          Skip hire software built for operators
        </h1>

        <p style={{ fontSize: 20, color: "#555", marginBottom: 26, lineHeight: 1.55 }}>
          Booking, scheduling, drivers, invoicing and compliance — in one system that’s designed around the reality of a
          skip yard.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/login?type=office" style={{ textDecoration: "none" }}>
            <button
              style={{
                background: "#1677ff",
                color: "#fff",
                border: "none",
                padding: "14px 22px",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Office login
            </button>
          </Link>

          <Link href="/login?type=driver" style={{ textDecoration: "none" }}>
            <button
              style={{
                background: "#fff",
                color: "#111",
                border: "1px solid #e5e7eb",
                padding: "14px 22px",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Driver sign in
            </button>
          </Link>

          <Link href="/signup" style={{ textDecoration: "none" }}>
            <button
              style={{
                background: "#fff",
                color: "#111",
                border: "1px solid #e5e7eb",
                padding: "14px 22px",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Create account
            </button>
          </Link>
        </div>

        <div style={{ marginTop: 14, color: "#777" }}>30-day free trial • card required • cancel anytime</div>
      </section>

      <section
        style={{
          maxWidth: 1100,
          margin: "40px auto 70px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
          padding: "0 20px",
        }}
      >
        {[
          { title: "Jobs & Scheduler", text: "Book jobs fast, manage runs, and keep the day under control." },
          { title: "Customers & Pricing", text: "Postcode pricing, account customers, and tidy customer records." },
          { title: "Driver Workflow", text: "Driver run lists, delivery/collection status, and proof trail." },
          { title: "Finance & Compliance", text: "Built to plug into Xero and fleet compliance workflows." },
        ].map((f) => (
          <div
            key={f.title}
            style={{ background: "#fff", padding: 18, borderRadius: 16, border: "1px solid #e5e7eb" }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>{f.title}</div>
            <div style={{ color: "#555", lineHeight: 1.6 }}>{f.text}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
