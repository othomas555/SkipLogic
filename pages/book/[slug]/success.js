// pages/book/[slug]/success.js

import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function PublicBookingSuccessPage() {
  const router = useRouter();
  const slug = String(router.query.slug || "");
  const sessionId = String(router.query.session_id || "");

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!router.isReady || !slug || !sessionId) return;

    let cancelled = false;

    async function confirmBooking() {
      try {
        setLoading(true);
        setErrorMsg("");

        const res = await fetch("/api/public/confirm-booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json.ok) {
          throw new Error(json?.error || "Could not confirm booking");
        }

        if (!cancelled) {
          setResult(json);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(String(err?.message || "Could not confirm booking"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    confirmBooking();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, slug, sessionId]);

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        {loading ? (
          <>
            <h1 style={styles.title}>Finalising your booking…</h1>
            <p style={styles.text}>Please keep this page open while we confirm payment and create your booking.</p>
          </>
        ) : errorMsg ? (
          <>
            <h1 style={styles.titleError}>We received the payment, but the booking is not fully confirmed yet.</h1>
            <p style={styles.textError}>{errorMsg}</p>
            <p style={styles.text}>
              Please contact us and quote your payment session if needed. Do not pay again unless told to.
            </p>
            <p style={styles.row}>
              <a href={`/book/${slug}`} style={styles.link}>
                ← Back to booking page
              </a>
            </p>
          </>
        ) : (
          <>
            <h1 style={styles.titleSuccess}>Booking confirmed</h1>
            <p style={styles.text}>
              Your booking has been created successfully.
            </p>
            <div style={styles.infoBox}>
              <div>
                Booking number: <b>{result?.job_number || "—"}</b>
              </div>
              {result?.invoice?.ok === true ? (
                <div style={{ marginTop: 8 }}>
                  Invoice created successfully.
                </div>
              ) : null}
            </div>

            <p style={styles.text}>
              We have saved your booking and payment.
            </p>

            <p style={styles.row}>
              <a href={`/book/${slug}`} style={styles.link}>
                Book another skip
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    padding: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
  },
  card: {
    width: "100%",
    maxWidth: 620,
    background: "#fff",
    border: "1px solid #dbe3f0",
    borderRadius: 18,
    padding: 28,
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
  },
  title: {
    margin: 0,
    fontSize: 28,
    color: "#0f172a",
  },
  titleSuccess: {
    margin: 0,
    fontSize: 28,
    color: "#166534",
  },
  titleError: {
    margin: 0,
    fontSize: 26,
    color: "#9f1239",
  },
  text: {
    marginTop: 14,
    fontSize: 15,
    color: "#334155",
    lineHeight: 1.6,
  },
  textError: {
    marginTop: 14,
    fontSize: 15,
    color: "#9f1239",
    lineHeight: 1.6,
  },
  infoBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 1.6,
  },
  row: {
    marginTop: 18,
  },
  link: {
    color: "#2563eb",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
};
