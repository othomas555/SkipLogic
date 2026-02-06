// pages/driver/index.js
import { useRouter } from "next/router";
import { useState } from "react";

export default function DriverLoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!pin.trim()) {
      setErr("Enter your PIN");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/driver/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: pin.trim() }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Login failed");
      }

      // success: go to menu (preferred)
      router.push("/driver/menu");
    } catch (e2) {
      setErr("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Driver login</h1>
        <p style={styles.sub}>Enter your driver PIN</p>

        <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
          <label style={styles.label}>PIN</label>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••"
            style={styles.input}
          />

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
    maxWidth: 420,
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
    fontSize: 16,
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
