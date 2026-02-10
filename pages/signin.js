// pages/signin.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

function Toast({ open, kind = "info", title, message, onClose }) {
  if (!open) return null;
  const bg = kind === "error" ? "#fff1f0" : kind === "success" ? "#e6ffed" : "#f0f5ff";
  const border = kind === "error" ? "#ffccc7" : kind === "success" ? "#b7eb8f" : "#adc6ff";
  const color = kind === "error" ? "#8a1f1f" : kind === "success" ? "#1f6b2a" : "#1d39c4";

  return (
    <div
      role="dialog"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        zIndex: 2000,
        width: "min(520px, calc(100vw - 32px))",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, color, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{message}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "1px solid #ddd",
            background: "#fff",
            borderRadius: 10,
            padding: "6px 10px",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

export default function SignInPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [working, setWorking] = useState(false);

  const [toast, setToast] = useState({ open: false, kind: "info", title: "", message: "" });
  function showToast(kind, title, message) {
    setToast({ open: true, kind, title, message });
  }
  function closeToast() {
    setToast((t) => ({ ...t, open: false }));
  }

  useEffect(() => {
    // If already signed in, go straight to /app
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) router.replace("/app");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignIn(e) {
    e.preventDefault();
    closeToast();

    const em = (email || "").trim();
    if (!em) return showToast("error", "Missing email", "Enter your email.");
    if (!password) return showToast("error", "Missing password", "Enter your password.");

    setWorking(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: em,
        password,
      });

      if (error) {
        showToast("error", "Sign in failed", error.message || "Could not sign in.");
        setWorking(false);
        return;
      }

      if (!data?.session?.user) {
        showToast("error", "Sign in failed", "No user session returned.");
        setWorking(false);
        return;
      }

      showToast("success", "Signed in", "Welcome back. Redirecting…");
      // small delay so you see the popup
      setTimeout(() => router.replace("/app"), 350);
    } catch (err) {
      showToast("error", "Sign in failed", "Unexpected error signing in.");
      setWorking(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fafafa" }}>
      <Toast open={toast.open} kind={toast.kind} title={toast.title} message={toast.message} onClose={closeToast} />

      <div style={{ maxWidth: 520, margin: "0 auto", paddingTop: 40 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.2 }}>SkipLogic</div>
          <div style={{ color: "#555", marginTop: 6 }}>Sign in to your account</div>
        </div>

        <section
          style={{
            background: "#fff",
            border: "1px solid #e6e6e6",
            borderRadius: 14,
            padding: 18,
            boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
          }}
        >
          <form onSubmit={handleSignIn}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 800 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 800 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  outline: "none",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={working}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "none",
                background: working ? "#999" : "#0070f3",
                color: "#fff",
                fontWeight: 900,
                cursor: working ? "default" : "pointer",
              }}
            >
              {working ? "Signing in…" : "Sign in"}
            </button>

            <div style={{ marginTop: 12, fontSize: 13, color: "#444" }}>
              No account yet?{" "}
              <a href="/signup" style={{ fontWeight: 900 }}>
                Create one
              </a>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
