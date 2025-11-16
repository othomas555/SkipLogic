// pages/index.js
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>SkipLogic Home</h1>
      <p style={{ marginBottom: 16 }}>
        If you can see this on Vercel, routing is working.
      </p>
      <a
        href="/login"
        style={{
          padding: "8px 16px",
          border: "1px solid #000",
          borderRadius: 6,
          textDecoration: "none",
        }}
      >
        Go to Login
      </a>
    </main>
  );
}
