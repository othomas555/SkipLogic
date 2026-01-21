// pages/app/settings.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

export default function SettingsPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [termHireDays, setTermHireDays] = useState(14);
  const [reminderDaysBefore, setReminderDaysBefore] = useState(4);

  const reminderDayNumber = useMemo(() => {
    // Example: term=14, before=4 -> reminder on day 10 after delivery
    const term = clampInt(termHireDays, 1, 365);
    const before = clampInt(reminderDaysBefore, 0, 365);
    return Math.max(0, term - before);
  }, [termHireDays, reminderDaysBefore]);

  useEffect(() => {
    async function load() {
      if (checking) return;

      if (!user) {
        setLoading(false);
        return;
      }

      if (!subscriberId) {
        setErrorMsg("No subscriber found for this user.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");

      const { data, error } = await supabase
        .from("subscribers")
        .select("id, term_hire_days, term_hire_reminder_days_before")
        .eq("id", subscriberId)
        .maybeSingle();

      if (error) {
        console.error(error);
        setErrorMsg("Could not load settings.");
        setLoading(false);
        return;
      }

      const term = clampInt(data?.term_hire_days ?? 14, 1, 365);
      const before = clampInt(data?.term_hire_reminder_days_before ?? 4, 0, 365);

      setTermHireDays(term);
      setReminderDaysBefore(before);

      setLoading(false);
    }

    load();
  }, [checking, user, subscriberId]);

  async function save() {
    if (!subscriberId) return;

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    const term = clampInt(termHireDays, 1, 365);
    const before = clampInt(reminderDaysBefore, 0, 365);

    const { error } = await supabase
      .from("subscribers")
      .update({
        term_hire_days: term,
        term_hire_reminder_days_before: before,
      })
      .eq("id", subscriberId);

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg("Could not save settings: " + (error.message || "Unknown error"));
      return;
    }

    setSuccessMsg("Saved.");
  }

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading settings…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Settings</h1>
        <p>You must be signed in.</p>
        <button style={btnSecondary} onClick={() => router.push("/login")}>
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app" style={linkStyle}>← Back to dashboard</Link>
          <h1 style={{ margin: "10px 0 0" }}>Settings</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Skip hire terms (defaults). Customer overrides come next.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {(authError || errorMsg || successMsg) && (
        <div style={{ marginBottom: 14 }}>
          {(authError || errorMsg) ? (
            <p style={{ color: "red", margin: 0 }}>{authError || errorMsg}</p>
          ) : null}
          {successMsg ? <p style={{ color: "green", margin: 0 }}>{successMsg}</p> : null}
        </div>
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>Default skip hire term</h2>

        <div style={gridStyle}>
          <label style={labelStyle}>
            Term hire days (default)
            <input
              type="number"
              min={1}
              max={365}
              value={termHireDays}
              onChange={(e) => setTermHireDays(clampInt(e.target.value, 1, 365))}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Reminder days before end
            <input
              type="number"
              min={0}
              max={365}
              value={reminderDaysBefore}
              onChange={(e) => setReminderDaysBefore(clampInt(e.target.value, 0, 365))}
              style={inputStyle}
            />
          </label>
        </div>

        <div style={hintBox}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>How this works</div>
          <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>
            <div>
              If the term is <b>{clampInt(termHireDays, 1, 365)} days</b> and the reminder is{" "}
              <b>{clampInt(reminderDaysBefore, 0, 365)} days before end</b>, then the reminder should
              go out on <b>day {reminderDayNumber}</b> after the skip is <b>actually delivered</b>.
            </div>
            <div style={{ marginTop: 8, color: "#666" }}>
              Example: 14-day hire with 4-days-before reminder → email goes on day 10.
            </div>
          </div>
        </div>

        <p style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
          Next step: Customer override tick-box (“term hire exempt”) + optional per-customer term days override.
        </p>
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f7f7f7",
};

const centerStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const linkStyle = {
  textDecoration: "underline",
  color: "#0070f3",
  fontSize: 13,
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const h2Style = { fontSize: 16, margin: "0 0 10px" };

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "#333",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
};

const hintBox = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  border: "1px solid #f0f0f0",
  background: "#fafafa",
};

const btnPrimary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #0070f3",
  background: "#0070f3",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontSize: 13,
};
