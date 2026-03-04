// pages/_app.js
import "../styles/globals.css";
import "../styles/theme.css";

import { useRouter } from "next/router";
import { useAuthProfile } from "../lib/useAuthProfile";
import AppShell from "../components/AppShell";

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const isAppRoute = router.pathname.startsWith("/app");

  // Non-app routes (marketing/auth) render without AppShell
  if (!isAppRoute) {
    return <Component {...pageProps} />;
  }

  const { checking, user, profile, errorMsg } = useAuthProfile();

  if (checking) {
    return (
      <main style={center}>
        <div style={authPanel}>
          <div style={brandRow}>
            <div style={brandMark} aria-hidden="true" />
            <div>
              <div style={brandName}>SkipLogic</div>
              <div style={brandTag}>Preparing your workspace…</div>
            </div>
          </div>

          <div style={loadingBarWrap} aria-hidden="true">
            <div style={loadingBar} />
          </div>

          <p style={muted}>Loading…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={center}>
        <div style={authPanel}>
          <div style={brandRow}>
            <div style={brandMark} aria-hidden="true" />
            <div>
              <div style={brandName}>SkipLogic</div>
              <div style={brandTag}>You’re not signed in.</div>
            </div>
          </div>

          <p style={muted}>
            Please sign in to access your workspace.
          </p>

          <button style={btnPrimary} onClick={() => router.push("/login")}>
            Go to login
          </button>

          <div style={tinyRow}>
            <span style={tinyMuted}>New here?</span>
            <button style={linkBtn} onClick={() => router.push("/signup")}>
              Create an account
            </button>
          </div>
        </div>
      </main>
    );
  }

  // App routes render inside dark wrapper (hybrid theme)
  return (
    <div className="sl-dark">
      <AppShell
        profile={profile}
        title={pageProps?.title}
        subtitle={pageProps?.subtitle}
        right={pageProps?.right}
      >
        {errorMsg ? (
          <div style={errorBox}>
            <b>Auth warning:</b> {errorMsg}
          </div>
        ) : null}
        <Component {...pageProps} />
      </AppShell>
    </div>
  );
}

/* ====== Inline styles (kept simple; uses theme variables) ====== */

const center = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-sans)",
  background: "var(--l-bg)",
  padding: 20,
};

const authPanel = {
  width: "min(520px, 100%)",
  background: "rgba(255,255,255,0.92)",
  border: "1px solid var(--l-border)",
  borderRadius: "var(--r-lg)",
  padding: 18,
  boxShadow: "var(--shadow-2)",
};

const brandRow = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 10,
};

const brandMark = {
  width: 36,
  height: 36,
  borderRadius: "var(--r-md)",
  background:
    "linear-gradient(135deg, var(--brand-mint), rgba(58,181,255,0.9))",
  boxShadow: "0 10px 30px rgba(11,18,32,0.10)",
};

const brandName = {
  fontWeight: 900,
  letterSpacing: "-0.02em",
  color: "var(--l-ink)",
  lineHeight: 1.1,
};

const brandTag = {
  fontSize: 13,
  color: "var(--l-muted)",
  marginTop: 2,
};

const muted = {
  marginTop: 10,
  marginBottom: 0,
  color: "var(--l-muted)",
  lineHeight: 1.5,
};

const btnPrimary = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: "var(--r-md)",
  border: 0,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: "-0.01em",
  color: "#071013",
  background: "linear-gradient(135deg, var(--brand-mint), rgba(58,181,255,0.9))",
};

const tinyRow = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 12,
};

const tinyMuted = {
  fontSize: 13,
  color: "var(--l-muted)",
};

const linkBtn = {
  border: 0,
  background: "transparent",
  cursor: "pointer",
  padding: 0,
  fontSize: 13,
  fontWeight: 800,
  color: "rgba(11,18,32,0.92)",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

const errorBox = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255, 96, 96, 0.10)",
  border: "1px solid rgba(255, 96, 96, 0.30)",
  color: "rgba(180, 20, 40, 0.95)",
  fontSize: 13,
};

const loadingBarWrap = {
  height: 10,
  borderRadius: 999,
  overflow: "hidden",
  border: "1px solid rgba(11,18,32,0.10)",
  background: "rgba(11,18,32,0.04)",
  marginTop: 12,
};

const loadingBar = {
  height: "100%",
  width: "55%",
  borderRadius: 999,
  background:
    "linear-gradient(90deg, rgba(55,245,155,0.85), rgba(58,181,255,0.85))",
};
