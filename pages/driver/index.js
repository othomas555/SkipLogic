// pages/driver/index.js
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

function ymdTodayLocal() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DriverLoginPage() {
  const router = useRouter();
  const today = useMemo(() => ymdTodayLocal(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (router?.query?.logged_out) setInfo("Logged out.");
  }, [router?.query?.logged_out]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setInfo("");

    const e1 = email.trim().toLowerCase();
    const p1 = password;

    if (!e1) return setErr("Enter your email");
    if (!p1) return setErr("Enter your password");

    setLoading(true);
    try {
      // 1) Login
      const res = await fetch("/api/driver/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: e1, password: p1 }),
      });

      if (!res.ok) {
        let msg = "Login failed";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch (_) {}
        throw new Error(msg);
      }

      // 2) Verify session is actually set (cookie present + readable by server)
      const verify = await fetch(`/api/driver/jobs?date=${encodeURIComponent(today)}`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (verify.status === 401) {
        throw new Error(
          "Login did not create a session (cookie not set). Check /api/driver/login Set-Cookie."
        );
      }

      if (!verify.ok) {
        // not ideal but at least it's not a 401
        // allow through, but show warning
        setInfo("Logged in, but jobs could not be loaded yet.");
      }

      // 3) Go to menu
      router.push("/driver/menu");
    } catch (e2) {
      setErr(e2?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Driver login</h1>
        <p style={styles.sub}>Sign in with your driver email and password</p>

        <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
          <label style={styles.label}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="driver@cox-skips.co.uk"
            style={styles.input}
          />

          <div style={{ height: 10 }} />

          <label style={styles.label}>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            type="password"
            placeholder="••••••••"
            style={styles.input}
          />

          {info ? <div style={styles.info}>{info}</div> : null}
          {err ? <div style={styles.error}>{err}</div> : null}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    background: "#f5f5f5",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    background: "#fff",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 8px 22px rgba(0,0,0,0.08)",
  },
  h1: { margin: 0, fontSize: 22 },
  sub: { marginTop: 6, marginBottom: 0, color: "#666", fontSize: 13 },
  label: { display: "block", fontSize: 13, color: "#555", marginBottom: 6 },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #e6e6e6",
    fontSize: 15,
    outline: "none",
  },
  button: {
    marginTop: 12,
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #0b57d0",
    background: "#0b57d0",
    color: "#fff",
    fontSize: 16,
    cursor: "pointer",
  },
  info: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    background: "#f2f7ff",
    border: "1px solid #dbe7ff",
    color: "#0b3570",
    fontSize: 13,
  },
  error: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    background: "#fff2f2",
    border: "1px solid #ffd3d3",
    color: "#7a1b1b",
    fontSize: 13,
  },
};
