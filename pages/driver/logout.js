// pages/driver/logout.js
import { useEffect } from "react";

export default function DriverLogoutPage() {
  useEffect(() => {
    let cancelled = false;

    async function go() {
      try {
        await fetch("/api/driver/logout", { method: "POST" });
      } catch (e) {
        // ignore
      } finally {
        if (!cancelled) window.location.href = "/driver";
      }
    }

    go();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#f5f5f5",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          borderRadius: 16,
          padding: 18,
          boxShadow: "0 8px 22px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18 }}>Logging out…</h1>
        <p style={{ marginTop: 10, marginBottom: 0, color: "#555", fontSize: 14 }}>
          If this doesn’t redirect, go back to{" "}
          <a href="/driver" style={{ color: "#0b57d0" }}>
            /driver
          </a>
          .
        </p>
      </div>
    </main>
  );
}
