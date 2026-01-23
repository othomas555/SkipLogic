// pages/login-driver.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

function toDriverEmail(loginCode) {
  const code = String(loginCode || "").trim().toLowerCase();
  return `${code}@drivers.skiplogic.local`;
}

export default function DriverLoginPage() {
  const router = useRouter();
  const [loginCode, setLoginCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) router.replace("/app/driver/run");
    });
  }, [router]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    const code = String(loginCode || "").trim();
    const p = String(pin || "").trim();

    if (!code) return setErr("Enter your driver code.");
    if (!p) return setErr("Enter your PIN.");

    setLoading(true);
    try {
      const email = toDriverEmail(code);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: p });

      if (error || !data?.session) {
        setErr("Login failed. Check your driver code and PIN.");
        setLoading(false);
        return;
      }

      router.replace("/app/driver/run");
    } catch {
      setErr("Login failed.");
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f5f5", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", paddingTop: 40 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.08)" }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Driver Login</h1>
          <p style={{ marginTop: 8, marginBottom: 16, color: "#555", lineHeight: 1.4 }}>
            Enter your <b>Driver Code</b> and <b>PIN</b>.
          </p>

          {err ? (
            <div style={{ background: "#ffecec", color: "#7a1212", padding: 10, borderRadius: 10, marginBottom: 12 }}>
              {err}
            </div>
          ) : null}

          <form onSubmit={onSubmit}>
            <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 6 }}>Driver Code</label>
            <input
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              inputMode="text"
              placeholder="e.g. D7K2P9"
              style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1px solid #ddd", marginBottom: 12, fontSize: 16 }}
            />

            <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 6 }}>PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="4 digits"
              style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1px solid #ddd", marginBottom: 12, fontSize: 16 }}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 12,
                border: "none",
                background: "#111",
                color: "#fff",
                fontSize: 16,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Logging in…" : "Login"}
            </button>
          </form>

          <div style={{ marginTop: 14, fontSize: 12, color: "#666" }}>
            Lost your PIN? Ask the office to reset it.
          </div>
        </div>
      </div>
    </main>
  );
}
