// pages/login.js
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function OfficeLoginPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      setChecking(true);
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data?.session) {
        router.replace("/app");
        return;
      }
      setChecking(false);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signIn(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: String(email || "").trim(),
      password: String(password || ""),
    });

    setBusy(false);

    if (error) {
      setErr(error.message || "Login failed");
      return;
    }

    router.replace("/app");
  }

  if (checking) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>Checking session…</div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <div>
            <h1 style={styles.h1}>SkipLogic</h1>
            <div style={styles.sub}>Office login</div>
          </div>
          <Link href="/driver" style={styles.linkSmall}>
            Driver login →
          </Link>
        </div>

        {err ? <div style={styles.err}>{err}</div> : null}

        <form onSubmit={signIn} style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <label style={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              style={styles.input}
              required
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={styles.input}
              required
            />
          </label>

          <button type="submit" style={styles.btn} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={styles.footer}>
          <Link href="/" style={styles.linkSmall}>← Back</Link>
        </div>
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
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "#f6f6f6",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 8px 22px rgba(0,0,0,0.08)",
    border: "1px solid #eee",
  },
  h1: { margin: 0, fontSize: 22 },
  sub: { marginTop: 4, color: "#666", fontSize: 13 },
  label: { display: "grid", gap: 6, fontSize: 12, color: "#333" },
  input: { padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", fontSize: 14 },
  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: 0,
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },
  err: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    background: "#fff5f5",
    border: "1px solid #f0b4b4",
    color: "#8a1f1f",
    fontSize: 13,
  },
  linkSmall: { fontSize: 13, color: "#0b57d0", textDecoration: "none" },
  footer: { marginTop: 12, display: "flex", justifyContent: "space-between" },
};
