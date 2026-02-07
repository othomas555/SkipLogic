// pages/app/settings.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  const token = data?.session?.access_token || null;
  return token;
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

  // Xero UI state
  const [xeroLoading, setXeroLoading] = useState(false);
  const [xeroStatus, setXeroStatus] = useState(null); // { connected, tenant_id, tenants[] }
  const [xeroErr, setXeroErr] = useState("");
  const [xeroOk, setXeroOk] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");

  const reminderDayNumber = useMemo(() => {
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

  async function loadXeroStatus({ silent = false } = {}) {
    if (!user) return;

    if (!silent) {
      setXeroErr("");
      setXeroOk("");
      setXeroLoading(true);
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        setXeroStatus(null);
        setXeroErr("You must be signed in.");
        setXeroLoading(false);
        return;
      }

      const res = await fetch("/api/xero/status", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setXeroStatus(null);
        setXeroErr(json?.error || "Failed to load Xero status");
        setXeroLoading(false);
        return;
      }

      setXeroStatus(json);
      setSelectedTenantId(json?.tenant_id || "");
      setXeroLoading(false);
    } catch (e) {
      setXeroStatus(null);
      setXeroErr("Failed to load Xero status");
      setXeroLoading(false);
    }
  }

  useEffect(() => {
    if (!checking && user) {
      loadXeroStatus({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user]);

  async function connectXero() {
    setXeroErr("");
    setXeroOk("");
    setXeroLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setXeroErr("You must be signed in.");
        setXeroLoading(false);
        return;
      }

      const res = await fetch("/api/xero/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok || !json.url) {
        setXeroErr(json?.error || "Could not start Xero connection");
        setXeroLoading(false);
        return;
      }

      // Redirect to Xero OAuth
      window.location.href = json.url;
    } catch (e) {
      setXeroErr("Could not start Xero connection");
      setXeroLoading(false);
    }
  }

  async function saveTenantSelection() {
    setXeroErr("");
    setXeroOk("");
    setXeroLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setXeroErr("You must be signed in.");
        setXeroLoading(false);
        return;
      }

      if (!selectedTenantId) {
        setXeroErr("Select an organisation.");
        setXeroLoading(false);
        return;
      }

      const res = await fetch("/api/xero/select-tenant", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenant_id: selectedTenantId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setXeroErr(json?.error || "Could not save organisation");
        setXeroLoading(false);
        return;
      }

      setXeroOk("Organisation selected.");
      await loadXeroStatus({ silent: true });
      setXeroLoading(false);
    } catch (e) {
      setXeroErr("Could not save organisation");
      setXeroLoading(false);
    }
  }

  async function disconnectXero() {
    const ok = confirm("Disconnect Xero for this SkipLogic account?");
    if (!ok) return;

    setXeroErr("");
    setXeroOk("");
    setXeroLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setXeroErr("You must be signed in.");
        setXeroLoading(false);
        return;
      }

      const res = await fetch("/api/xero/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setXeroErr(json?.error || "Could not disconnect");
        setXeroLoading(false);
        return;
      }

      setXeroOk("Disconnected.");
      await loadXeroStatus({ silent: true });
      setXeroLoading(false);
    } catch (e) {
      setXeroErr("Could not disconnect");
      setXeroLoading(false);
    }
  }

  const xeroNeedsOrgPick = useMemo(() => {
    const tenants = xeroStatus?.tenants;
    const tenantId = xeroStatus?.tenant_id;
    return xeroStatus?.connected && Array.isArray(tenants) && tenants.length > 1 && !tenantId;
  }, [xeroStatus]);

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
          <Link href="/app" style={linkStyle}>
            ← Back to dashboard
          </Link>
          <h1 style={{ margin: "10px 0 0" }}>Settings</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Skip hire terms + integrations.
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

      {/* Xero section */}
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h2 style={h2Style}>Xero</h2>
            <p style={{ margin: 0, color: "#666", fontSize: 13 }}>
              Connect your Xero organisation so SkipLogic can raise invoices.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button style={btnSecondary} onClick={() => loadXeroStatus()} disabled={xeroLoading}>
              {xeroLoading ? "Loading…" : "Refresh"}
            </button>

            {xeroStatus?.connected ? (
              <button style={btnDanger} onClick={disconnectXero} disabled={xeroLoading}>
                Disconnect
              </button>
            ) : (
              <button style={btnPrimaryDark} onClick={connectXero} disabled={xeroLoading}>
                Connect Xero
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {xeroErr ? <p style={{ color: "#8a1f1f", margin: "0 0 8px" }}>{xeroErr}</p> : null}
          {xeroOk ? <p style={{ color: "#1f6b2a", margin: "0 0 8px" }}>{xeroOk}</p> : null}

          <div style={xeroStatusRow}>
            <div>
              <div style={miniLabel}>Status</div>
              <div style={{ fontWeight: 800 }}>
                {xeroStatus?.connected ? "Connected" : "Not connected"}
              </div>
            </div>

            <div>
              <div style={miniLabel}>Selected organisation</div>
              <div style={{ fontWeight: 800 }}>
                {xeroStatus?.tenant_id ? "Selected" : (xeroStatus?.connected ? "Not selected" : "—")}
              </div>
            </div>

            <div>
              <div style={miniLabel}>Organisations found</div>
              <div style={{ fontWeight: 800 }}>
                {Array.isArray(xeroStatus?.tenants) ? xeroStatus.tenants.length : "—"}
              </div>
            </div>
          </div>

          {xeroStatus?.connected && Array.isArray(xeroStatus?.tenants) && xeroStatus.tenants.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Organisation</div>

              {xeroStatus.tenants.length === 1 ? (
                <div style={{ color: "#333", fontSize: 13 }}>
                  Only one organisation was found. It will be selected automatically.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
                  <select
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                    style={selectStyle}
                    disabled={xeroLoading}
                  >
                    <option value="">Select…</option>
                    {xeroStatus.tenants.map((t) => (
                      <option key={String(t.tenantId)} value={String(t.tenantId)}>
                        {String(t.tenantName || t.tenantId)}
                      </option>
                    ))}
                  </select>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={btnPrimaryDark}
                      onClick={saveTenantSelection}
                      disabled={xeroLoading || !selectedTenantId}
                    >
                      Save organisation
                    </button>

                    {xeroNeedsOrgPick ? (
                      <div style={{ color: "#8a1f1f", fontSize: 13, alignSelf: "center" }}>
                        You must pick an organisation before invoices can sync.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {/* Existing term settings */}
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
              <b>{clampInt(reminderDaysBefore, 0, 365)} days before end</b>, then the reminder should go
              out on <b>day {reminderDayNumber}</b> after the skip is <b>actually delivered</b>.
            </div>
            <div style={{ marginTop: 8, color: "#666" }}>
              Example: 14-day hire with 4-days-before reminder → email goes on day 10.
            </div>
          </div>
        </div>

        <p style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
          Next step: customer override tick-box (“term hire exempt”) + optional per-customer hire term override.
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

const selectStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#fff",
  fontSize: 13,
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

const btnPrimaryDark = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
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

const btnDanger = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #8a1f1f",
  background: "#8a1f1f",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};

const xeroStatusRow = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 10,
  background: "#fafafa",
};

const miniLabel = { fontSize: 11, color: "#666", marginBottom: 4 };
