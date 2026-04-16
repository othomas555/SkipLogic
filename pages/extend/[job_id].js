import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

export default function ExtendJobPage() {
  const router = useRouter();
  const rawJobId = router.query?.job_id;
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;

  const [error, setError] = useState("");
  const [working, setWorking] = useState(true);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!jobId) return;
    if (startedRef.current) return;

    startedRef.current = true;

    async function run() {
      setWorking(true);
      setError("");

      try {
        const res = await fetch("/api/term-hire/create-checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            job_id: jobId,
            weeks: 1,
          }),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok || !json?.url) {
          throw new Error(json?.error || "Could not start extension checkout");
        }

        window.location.href = json.url;
      } catch (err) {
        setError(err?.message || "Could not start extension checkout");
        setWorking(false);
      }
    }

    run();
  }, [router.isReady, jobId]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#f8fafc",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: 28, color: "#111827" }}>
          Extend skip hire
        </h1>

        {working ? (
          <>
            <p style={{ margin: "0 0 10px", color: "#374151", lineHeight: 1.6 }}>
              We are taking you to the secure payment page now.
            </p>
            <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
              Job reference: <b>{asText(jobId) || "—"}</b>
            </p>
          </>
        ) : (
          <>
            <div
              style={{
                marginBottom: 14,
                padding: 12,
                borderRadius: 10,
                border: "1px solid #fecaca",
                background: "#fff1f2",
                color: "#991b1b",
                lineHeight: 1.5,
              }}
            >
              {error || "Could not start extension checkout."}
            </div>

            <p style={{ margin: "0 0 14px", color: "#374151", lineHeight: 1.6 }}>
              Please contact the office if you still want to extend the skip hire.
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  startedRef.current = false;
                  setWorking(true);
                  setError("");
                  router.replace(router.asPath);
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>

              <a
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#111827",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Back to site
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
