// pages/signup.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

function safeJson(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function Toast({ open, kind = "info", title, message, actions = null, onClose }) {
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
        width: "min(640px, calc(100vw - 32px))",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 950, color, marginBottom: 6 }}>{title}</div>
          <div style={{ fontSize: 13, color: "#333", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{message}</div>
          {actions ? <div style={{ marginTop: 10 }}>{actions}</div> : null}
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
            fontWeight: 900,
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
  const [phone, setPhone] = useState(""); // optional for now

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [working, setWorking] = useState(false);

  const [toast, setToast] = useState({
    open: false,
    kind: "info",
    title: "",
    message: "",
    actions: null,
  });

  function showToast(kind, title, message, actions = null) {
    setToast({ open: true, kind, title, message, actions });
  }

  function closeToast() {
    setToast((t) => ({ ...t, open: false, actions: null }));
  }

  const debugContext = useMemo(() => {
    return {
      where: "pages/signup.js",
      at: new Date().toISOString(),
      host: typeof window !== "undefined" ? window.location.host : null,
    };
  }, []);

  useEffect(() => {
    // If already signed in, go to app (auth guard will redirect to subscribe if needed)
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) router.replace("/app");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resendConfirmationEmail(targetEmail) {
    const em = String(targetEmail || "").trim();
    if (!em) return;

    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: em });
      if (error) {
        showToast("error", "Could not resend email", error.message || "Resend failed.");
        return;
      }
      showToast("success", "Confirmation email sent", "Check spam/junk. Once confirmed, come back and sign in.");
    } catch {
      showToast("error", "Could not resend email", "Resend failed unexpectedly.");
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    closeToast();

    const cn = String(companyName || "").trim();
    const fn = String(fullName || "").trim();
    const ph = String(phone || "").trim();
    const em = String(email || "").trim();

    if (!cn) return showToast("error", "Missing company name", "Enter your company name.");
    if (!fn) return showToast("error", "Missing name", "Enter your full name.");
    if (!em) return showToast("error", "Missing email", "Enter your email address.");
    if (!password || password.length < 8) return showToast("error", "Weak password", "Use at least 8 characters (12+ recommended).");

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
            phone: ph, // stored in auth metadata only for now
          },
        },
      });

      if (signUpError) {
        console.error("SIGNUP ERROR:", signUpError);

        // Better UX for user_already_exists
        if (signUpError.code === "user_already_exists") {
          showToast(
            "error",
            "Account already exists",
            "That email address already has an account.\n\nUse Sign in. If you didn’t receive a confirmation email, click Resend.",
            (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a
                  href={`/signin?email=${encodeURIComponent(em)}`}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #1677ff",
                    background: "#1677ff",
                    color: "#fff",
                    textDecoration: "none",
                    fontWeight: 950,
                  }}
                >
                  Go to sign in
                </a>
                <button
                  type="button"
                  onClick={() => resendConfirmationEmail(em)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    color: "#111",
                    cursor: "pointer",
                    fontWeight: 950,
                  }}
                >
                  Resend confirmation email
                </button>
              </div>
            )
          );

          setWorking(false);
          return;
        }

        // Copy debug button for everything else
        const debug = {
          ...debugContext,
          step: "supabase.auth.signUp",
          email: em,
          signUpDataSummary: {
            user: signUpData?.user ? { id: signUpData.user.id, email: signUpData.user.email } : null,
            session: !!signUpData?.session,
          },
          error: signUpError,
        };

        showToast(
          "error",
          "Sign up failed",
          `Supabase said:\nmessage: ${String(signUpError.message || "")}\nstatus: ${signUpError.status ?? "n/a"}\ncode: ${
            signUpError.code ?? "n/a"
          }\n`,
          (
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(safeJson(debug));
                showToast("success", "Copied debug info", "Paste it back here and I’ll fix it.");
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #1677ff",
                background: "#1677ff",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 950,
              }}
            >
              Copy debug
            </button>
          )
        );

        setWorking(false);
        return;
      }

      // At this point: account created.
      // 2) Try sign-in immediately (works when confirmations are OFF)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: em,
        password,
      });

      // If confirmations are ON, sign-in will fail until they confirm.
      if (signInError || !signInData?.session?.user) {
        showToast(
          "success",
          "Account created",
          "Your account has been created.\n\nNext step: confirm your email address (check spam/junk). Once confirmed, sign in to continue to plan selection.",
          (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => resendConfirmationEmail(em)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #1677ff",
                  background: "#1677ff",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 950,
                }}
              >
                Resend confirmation email
              </button>
              <a
                href={`/signin?email=${encodeURIComponent(em)}`}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  color: "#111",
                  textDecoration: "none",
                  fontWeight: 950,
                }}
              >
                Go to sign in
              </a>
            </div>
          )
        );

        setWorking(false);
        return;
      }

      // 3) Bootstrap tenant (subscriber + profile updates)
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
          phone: ph, // accepted but not stored in profiles
        }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json.ok) {
        const debug = { ...debugContext, step: "/api/auth/bootstrap", status: resp.status, body: json };

        showToast(
          "error",
          "Setup failed",
          `Bootstrap endpoint returned:\nstatus: ${resp.status}\nerror: ${json?.error || "n/a"}\ndetail: ${json?.detail || "n/a"}`,
          (
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(safeJson(debug));
                showToast("success", "Copied debug info", "Paste it back here and I’ll fix it.");
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #1677ff",
                background: "#1677ff",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 950,
              }}
            >
              Copy debug
            </button>
          )
        );

        setWorking(false);
        return;
      }

      showToast("success", "Account ready", "Next: choose your plan and add a card to start the 30-day trial…");
      setTimeout(() => router.replace("/subscribe"), 450);
    } catch (err) {
      console.error("UNEXPECTED SIGNUP ERROR:", err);
      showToast("error", "Sign up failed", "Unexpected error creating your account. Check console for details.");
      setWorking(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fafafa" }}>
      <Toast open={toast.open} kind={toast.kind} title={toast.title} message={toast.message} actions={toast.actions} onClose={closeToast} />

      <div style={{ maxWidth: 560, margin: "0 auto", paddingTop: 30 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.2 }}>SkipLogic</div>
          <div style={{ color: "#555", marginTop: 6 }}>
            Create your account — <b>30-day free trial</b> (plan + card setup comes next)
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
                <label style={{ display: "block", marginBottom: 6, fontWeight: 950 }}>Company name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 950 }}>Full name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 950 }}>
                    Phone <span style={{ fontWeight: 700, color: "#666" }}>(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 950 }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 950 }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                <a href="/signin" style={{ fontWeight: 950 }}>
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
