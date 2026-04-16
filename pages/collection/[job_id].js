import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function isWeekend(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return false;
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function humanDate(ymd) {
  if (!isYmd(ymd)) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export default function CollectionPage() {
  const router = useRouter();
  const rawJobId = router.query?.job_id;
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  const token = asText(router.query?.token);

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [options, setOptions] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [mode, setMode] = useState("next_available");
  const [chosenDate, setChosenDate] = useState("");

  useEffect(() => {
    if (!router.isReady || !token) return;

    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const optRes = await fetch(
          `/api/term-hire/collection-options?token=${encodeURIComponent(token)}`
        );
        const optJson = await optRes.json().catch(() => ({}));
        if (!optRes.ok || !optJson?.ok) {
          throw new Error(optJson?.error || "Could not load collection options");
        }

        const holidayRes = await fetch(
          `/api/public/bank-holidays?from=${encodeURIComponent(
            optJson.next_available
          )}&to=${encodeURIComponent(optJson.hire_end_date)}`
        );
        const holidayJson = await holidayRes.json().catch(() => ({}));
        if (!holidayRes.ok || !holidayJson?.ok) {
          throw new Error(holidayJson?.error || "Could not load bank holidays");
        }

        if (!active) return;

        setOptions(optJson);
        setHolidays(Array.isArray(holidayJson.holidays) ? holidayJson.holidays : []);
        setChosenDate(optJson.next_available || "");
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Could not load collection options");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [router.isReady, token]);

  const holidaySet = useMemo(
    () => new Set((Array.isArray(holidays) ? holidays : []).map((h) => asText(h.date))),
    [holidays]
  );

  function validateChosenDate() {
    if (mode !== "choose_date") return "";
    if (!isYmd(chosenDate)) return "Please choose a valid date";
    if (chosenDate < asText(options?.next_available)) {
      return `Chosen date must be on or after ${humanDate(options?.next_available)}`;
    }
    if (chosenDate > asText(options?.hire_end_date)) {
      return "That date is beyond the current hire period. Extend the hire first to choose a later date.";
    }
    if (isWeekend(chosenDate)) {
      return "Weekends cannot be chosen";
    }
    if (holidaySet.has(chosenDate)) {
      return "Bank holidays cannot be chosen";
    }
    return "";
  }

  async function bookCollection() {
    setWorking(true);
    setError("");
    setSuccess("");

    try {
      const clientValidation = validateChosenDate();
      if (clientValidation) {
        throw new Error(clientValidation);
      }

      const res = await fetch("/api/term-hire/book-collection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          mode,
          requested_date: mode === "choose_date" ? chosenDate : null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Could not book collection");
      }

      const finalDate = asText(json.collection_date) || asText(options?.next_available);
      setSuccess(`Collection booked for ${humanDate(finalDate)}.`);
    } catch (err) {
      setError(err?.message || "Could not book collection");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Book skip collection</h1>
          <p>Loading options…</p>
        </div>
      </main>
    );
  }

  if (error && !options) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Book skip collection</h1>
          <div style={errorStyle}>{error}</div>
          <p>Please contact the office if you need help.</p>
        </div>
      </main>
    );
  }

  const chosenDateError = validateChosenDate();

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Book skip collection</h1>
        <p style={textStyle}>
          Job reference: <b>{asText(options?.job_number) || asText(jobId) || "—"}</b>
        </p>

        {options?.already_booked_collection_date ? (
          <div style={successStyle}>
            Collection is already booked for {humanDate(options.already_booked_collection_date)}.
          </div>
        ) : success ? (
          <div style={successStyle}>{success}</div>
        ) : (
          <>
            <div style={infoStyle}>
              <p style={{ margin: "0 0 8px" }}>
                Current hire ends on <b>{humanDate(options?.hire_end_date)}</b>.
              </p>
              <p style={{ margin: "0 0 8px" }}>
                Next available collection day: <b>{humanDate(options?.next_available)}</b>.
              </p>
              <p style={{ margin: 0 }}>
                You can choose the next available day, or choose another valid weekday within the
                current hire period. Weekends and bank holidays cannot be chosen.
              </p>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <label style={optionRowStyle}>
                <input
                  type="radio"
                  name="collection_mode"
                  value="next_available"
                  checked={mode === "next_available"}
                  onChange={() => setMode("next_available")}
                />
                <span>
                  <b>Next available day</b> — {humanDate(options?.next_available)}
                </span>
              </label>

              <label style={optionRowStyle}>
                <input
                  type="radio"
                  name="collection_mode"
                  value="choose_date"
                  checked={mode === "choose_date"}
                  onChange={() => setMode("choose_date")}
                />
                <span><b>Choose date</b></span>
              </label>

              {mode === "choose_date" ? (
                <div style={{ paddingLeft: 28 }}>
                  <input
                    type="date"
                    value={chosenDate}
                    min={asText(options?.next_available)}
                    max={asText(options?.hire_end_date)}
                    onChange={(e) => setChosenDate(e.target.value)}
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
                    Allowed range: {humanDate(options?.next_available)} to {humanDate(options?.hire_end_date)}
                  </div>
                  {chosenDateError ? <div style={errorStyle}>{chosenDateError}</div> : null}

                  {holidays.length ? (
                    <div style={holidayBoxStyle}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        Bank holidays in this range
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                        {holidays.map((h) => `${humanDate(h.date)} — ${h.title}`).join(" | ")}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {error ? <div style={errorStyle}>{error}</div> : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button
                type="button"
                onClick={bookCollection}
                disabled={working || !!success}
                style={primaryBtn}
              >
                {working ? "Booking…" : "Book collection"}
              </button>

              <a href="/" style={secondaryLinkStyle}>
                Back to site
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "#f8fafc",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
};

const cardStyle = {
  width: "100%",
  maxWidth: 720,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
};

const titleStyle = {
  margin: "0 0 12px",
  fontSize: 28,
  color: "#111827",
};

const textStyle = {
  margin: "0 0 14px",
  color: "#374151",
  lineHeight: 1.6,
};

const infoStyle = {
  marginBottom: 16,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #dbeafe",
  background: "#eff6ff",
  color: "#1e3a8a",
};

const errorStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#991b1b",
  lineHeight: 1.5,
};

const successStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  lineHeight: 1.5,
};

const optionRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 15,
  color: "#111827",
};

const inputStyle = {
  width: "100%",
  maxWidth: 260,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#111827",
};

const holidayBoxStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#fafafa",
};

const primaryBtn = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryLinkStyle = {
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
};
