// pages/signup.js
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

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

export default function SignUpPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

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

  async function handleSignUp(e) {
    e.preventDefault();
    closeToast();

    const cn = (companyName || "").trim();
    const fn = (fullName || "").trim();
    const ph = (phone || "").trim();
    const em = (email || "").trim();

    if (!cn) return showToast("error", "Missing company name", "Enter your company name.");
    if (!fn) return showToast("error", "Missing name", "Enter your full name.");
    if (!ph) return showToast("error", "Missing phone", "Enter your phone number.");
    if (!em) return showToast("error", "Missing email", "Enter your email address.");
    if (!password || password.length < 8) return showToast("error", "Weak password", "Use at least 8 characters.");

    setWorking(true);

    try {
      // 1) Create auth user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: em,
        password,
        options: {
          data: {
            company_name: cn,
            full_name: fn,
            phone: ph,
          },
        },
      });

      if (signUpError) {
        showToast("error", "Sign up failed", signUpError.message || "Could not create account.");
        setWorking(false);
        return;
      }

      // Supabase may not return a session if email confirmations are enabled.
      // Try to sign in immediately (works when confirmations are OFF).
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: em,
        password,
      });

      if (signInError || !signInData?.session?.user) {
        showToast(
          "error",
          "Check your email",
          "Your account was created, but you may need to confirm your email before signing in. If confirmations are OFF, tell me and we’ll adjust."
        );
        setWorking(false);
        return;
      }

      // 2) Bootstrap tenant (subscriber + profile)
      const token = await getAccessToken();
      if (!token) {
        showToast("error", "Setup failed", "Signed in but no access token. Refresh and try again.");
        setWorking(false);
        return;
      }

      const resp = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_name: cn,
          full_name: fn,
          phone: ph,
        }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json.ok) {
        const msg = json?.error || json?.details || "Tenant bootstrap failed.";
        showToast("error", "Setup failed", String(msg));
        setWorking(false);
        return;
      }

      showToast("success", "Account created", "You’re in. Redirecting to the app…");
      setTimeout(() => router.replace("/app"), 450);
    } catch (err) {
      showToast("error", "Sign up failed", "Unexpected error creating your account.");
      setWorking(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fafafa" }}>
      <Toast open={toast.open} kind={toast.kind} title={toast.title} message={toast.message} onClose={closeToast} />

      <div style={{ maxWidth: 560, margin: "0 auto", paddingTop: 30 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.2 }}>SkipLogic</div>
          <div style={{ color: "#555", marginTop: 6 }}>
            Create your account — <b>30-day free trial</b> (card setup comes next)
          </div>
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
          <form onSubmit={handleSignUp}>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 900 }}>Company name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Cox Skips & Waste Management Ltd"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 900 }}>Full name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 900 }}>Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07…"
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 900 }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 900 }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
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
                  fontWeight: 950,
                  cursor: working ? "default" : "pointer",
                  marginTop: 6,
                }}
              >
                {working ? "Creating account…" : "Create account"}
              </button>

              <div style={{ fontSize: 13, color: "#444" }}>
                Already have an account?{" "}
                <a href="/signin" style={{ fontWeight: 900 }}>
                  Sign in
                </a>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
