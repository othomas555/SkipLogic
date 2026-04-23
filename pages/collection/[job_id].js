import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

export default function CollectionJobPage() {
  const router = useRouter();
  const rawJobId = router.query?.job_id;
  const rawToken = router.query?.token;

  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  const [working, setWorking] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [collectionDate, setCollectionDate] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!jobId || !token) return;
    if (startedRef.current) return;

    startedRef.current = true;

    async function run() {
      setWorking(true);
      setError("");
      setDone(false);

      try {
        const res = await fetch("/api/term-hire/book-collection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            job_id: jobId,
            token,
          }),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Could not book collection");
        }

        setJobNumber(asText(json?.job_number));
        setCollectionDate(asText(json?.collection_date));
        setDone(true);
        setWorking(false);
      } catch (err) {
        setError(err?.message || "Could not book collection");
        setWorking(false);
      }
    }

    run();
  }, [router.isReady, jobId, token]);

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
          maxWidth: 640,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#6b7280",
            marginBottom: 8,
          }}
        >
          SkipLogic
        </div>

        <h1 style={{ margin: "0 0 12px", fontSize: 30, color: "#111827" }}>
          Book collection
        </h1>

        {working ? (
          <div
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #cfe0fb",
              background: "#edf5ff",
              color: "#1d4ed8",
              lineHeight: 1.5,
            }}
          >
            Booking your collection now…
          </div>
        ) : done ? (
          <>
            <div
              style={{
                marginBottom: 14,
                padding: 12,
                borderRadius: 10,
                border: "1px solid #bbf7d0",
                background: "#f0fdf4",
                color: "#166534",
                lineHeight: 1.5,
              }}
            >
              Your collection has been booked successfully.
            </div>

            <div
              style={{
                marginBottom: 16,
                padding: 14,
                borderRadius: 12,
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                color: "#374151",
                lineHeight: 1.7,
              }}
            >
              <div>
                <strong>Job:</strong> {jobNumber || jobId || "—"}
              </div>
              <div>
                <strong>Booked collection date:</strong> {collectionDate || "—"}
              </div>
            </div>

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
              {error || "Could not book collection."}
            </div>

            <p style={{ margin: "0 0 14px", color: "#374151", lineHeight: 1.6 }}>
              Please contact the office if you still want this skip collected.
            </p>

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
          </>
        )}
      </div>
    </main>
  );
}
