// pages/_app.js
import { useRouter } from "next/router";
import { useAuthProfile } from "../lib/useAuthProfile";
import AppShell from "../components/AppShell";

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const isAppRoute = router.pathname.startsWith("/app");

  if (!isAppRoute) {
    return <Component {...pageProps} />;
  }

  const { checking, user, profile, errorMsg } = useAuthProfile();

  if (checking) {
    return (
      <main style={center}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={center}>
        <div style={card}>
          <h1 style={{ margin: 0 }}>SkipLogic</h1>
          <p style={{ marginTop: 8, color: "#6b7280" }}>You must be signed in.</p>
          <button style={btn} onClick={() => router.push("/login")}>
            Go to login
          </button>
        </div>
      </main>
    );
  }

  return (
    <AppShell profile={profile} title={pageProps?.title} subtitle={pageProps?.subtitle} right={pageProps?.right}>
      {errorMsg ? (
        <div style={errorBox}>
          <b>Auth warning:</b> {errorMsg}
        </div>
      ) : null}
      <Component {...pageProps} />
    </AppShell>
  );
}

const center = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f7f7f7",
  padding: 20,
};

const card = {
  width: "min(520px, 100%)",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const btn = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};

const errorBox = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 12,
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#9f1239",
  fontSize: 13,
};
