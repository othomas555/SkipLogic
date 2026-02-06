// pages/driver/index.js
import { useState } from "react";
import { useRouter } from "next/router";

export default function DriverLoginPage() {
const router = useRouter();
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");

const [busy, setBusy] = useState(false);
const [err, setErr] = useState("");

async function onSubmit(e) {
e.preventDefault();
setErr("");
setBusy(true);

try {
const res = await fetch("/api/driver/login", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ email, password }),
});

const json = await res.json().catch(() => ({}));

if (!res.ok || !json.ok) {
setErr(json?.error || "Login failed");
setBusy(false);
return;
}

router.push("/driver/work");
} catch (e2) {
setErr("Login failed");
@@ -33,10 +38,32 @@
}

return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <form onSubmit={onSubmit} style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.08)" }}>
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        background: "#f6f6f6",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
        }}
      >
<h1 style={{ margin: 0, fontSize: 22 }}>Driver login</h1>
        <p style={{ marginTop: 6, marginBottom: 16, color: "#555" }}>Sign in to view today’s work.</p>
        <p style={{ marginTop: 6, marginBottom: 16, color: "#555" }}>
          Sign in to view today’s work.
        </p>

<label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>Email</label>
<input
@@ -45,18 +72,44 @@
inputMode="email"
autoCapitalize="none"
autoCorrect="off"
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginBottom: 12 }}
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            marginBottom: 12,
          }}
/>

<label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>Password</label>
<input
value={password}
onChange={(e) => setPassword(e.target.value)}
type="password"
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", marginBottom: 12 }}
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            marginBottom: 12,
          }}
/>

        {err ? <div style={{ background: "#fff3f3", border: "1px solid #ffd2d2", color: "#7a1f1f", borderRadius: 10, padding: 10, marginBottom: 12 }}>{err}</div> : null}
        {err ? (
          <div
            style={{
              background: "#fff3f3",
              border: "1px solid #ffd2d2",
              color: "#7a1f1f",
              borderRadius: 10,
              padding: 10,
              marginBottom: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            {err}
          </div>
        ) : null}

<button
type="submit"
@@ -68,12 +121,16 @@
border: 0,
background: busy ? "#999" : "#111",
color: "#fff",
            fontWeight: 600,
            fontWeight: 700,
cursor: busy ? "default" : "pointer",
}}
>
{busy ? "Signing in…" : "Sign in"}
</button>

        <div style={{ marginTop: 10, color: "#777", fontSize: 12 }}>
          If you can’t log in, ask the office to reset your driver password.
        </div>
</form>
</main>
);
