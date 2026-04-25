import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function getToken() {
  const raw = localStorage.getItem("skiplogic-auth");
  return raw ? JSON.parse(raw)?.access_token : null;
}

function fmt(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return d.toLocaleString();
}

function Field({ label, children }) {
  return (
    <>
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div>{children}</div>
    </>
  );
}

function inputStyle() {
  return {
    width: "100%",
    padding: 10,
    border: "1px solid #ccc",
    borderRadius: 10,
  };
}

export default function WtnSettingsPage() {
  const { loading } = useAuthProfile();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [settings, setSettings] = useState(null);
  const [recentRecords, setRecentRecords] = useState([]);

  async function load() {
    setBusy(true);
    setErr("");
    setOkMsg("");

    try {
      const token = getToken();
      const res = await fetch("/api/settings/wtn/get", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load WTN settings");

      setSettings(json.settings || {});
      setRecentRecords(Array.isArray(json.recent_records) ? json.recent_records : []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setErr("");
    setOkMsg("");

    try {
      const token = getToken();
      const res = await fetch("/api/settings/wtn/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(settings || {}),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save WTN settings");

      setSettings(json.settings || {});
      setOkMsg("Saved ✅");
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function update(key, value) {
    setSettings((s) => ({ ...(s || {}), [key]: value }));
  }

  useEffect(() => {
    if (!loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!settings) return <div style={{ padding: 16 }}>{busy ? "Loading…" : "No settings loaded"}</div>;

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 10 }}>
        <Link
          href="/app/settings"
          style={{ color: "#0070f3", textDecoration: "underline", fontSize: 13 }}
        >
          ← Back to settings
        </Link>
      </div>

      <h1 style={{ margin: "0 0 12px" }}>Settings · Waste Transfer Notes</h1>

      {err ? (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            border: "1px solid #f3c2c2",
            background: "#fff5f5",
            borderRadius: 10,
          }}
        >
          {err}
        </div>
      ) : null}

      {okMsg ? (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            border: "1px solid #cde8d1",
            background: "#f2fff4",
            borderRadius: 10,
          }}
        >
          {okMsg}
        </div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <button
          disabled={busy}
          onClick={save}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "white",
            fontWeight: 800,
          }}
        >
          {busy ? "Saving…" : "Save WTN settings"}
        </button>
      </div>

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 12 }}>WTN defaults</div>

        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 10 }}>
          <Field label="WTN number prefix">
            <input
              value={settings.wtn_prefix || ""}
              onChange={(e) => update("wtn_prefix", e.target.value)}
              style={inputStyle()}
              placeholder="WTN"
            />
          </Field>

          <Field label="Company / carrier name">
            <input
              value={settings.company_name || ""}
              onChange={(e) => update("company_name", e.target.value)}
              style={inputStyle()}
            />
          </Field>

          <Field label="Company / carrier address">
            <textarea
              value={settings.company_address || ""}
              onChange={(e) => update("company_address", e.target.value)}
              style={{ ...inputStyle(), minHeight: 90 }}
            />
          </Field>

          <Field label="Waste carrier registration">
            <input
              value={settings.waste_carrier_registration || ""}
              onChange={(e) => update("waste_carrier_registration", e.target.value)}
              style={inputStyle()}
            />
          </Field>

          <Field label="Environmental permit / exemption">
            <input
              value={settings.environmental_permit_number || ""}
              onChange={(e) => update("environmental_permit_number", e.target.value)}
              style={inputStyle()}
            />
          </Field>

          <Field label="Default SIC code">
            <input
              value={settings.default_sic_code || ""}
              onChange={(e) => update("default_sic_code", e.target.value)}
              style={inputStyle()}
            />
          </Field>

          <Field label="Default EWC code">
            <input
              value={settings.default_ewc_code || ""}
              onChange={(e) => update("default_ewc_code", e.target.value)}
              style={inputStyle()}
              placeholder="17 09 04"
            />
          </Field>

          <Field label="Default waste description">
            <input
              value={settings.default_waste_description || ""}
              onChange={(e) => update("default_waste_description", e.target.value)}
              style={inputStyle()}
            />
          </Field>

          <Field label="Default container type">
            <input
              value={settings.default_container_type || ""}
              onChange={(e) => update("default_container_type", e.target.value)}
              style={inputStyle()}
              placeholder="Skip"
            />
          </Field>

          <Field label="Default destination site">
            <input
              value={settings.default_destination_site || ""}
              onChange={(e) => update("default_destination_site", e.target.value)}
              style={inputStyle()}
            />
          </Field>

          <Field label="Declaration text">
            <textarea
              value={settings.declaration_text || ""}
              onChange={(e) => update("declaration_text", e.target.value)}
              style={{ ...inputStyle(), minHeight: 110 }}
            />
          </Field>

          <Field label="Footer text">
            <textarea
              value={settings.footer_text || ""}
              onChange={(e) => update("footer_text", e.target.value)}
              style={{ ...inputStyle(), minHeight: 90 }}
            />
          </Field>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 14,
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Recent WTN records</div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {["Created", "WTN number", "Transfer date", "Customer", "EWC", "View"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderBottom: "1px solid #eee",
                      fontSize: 12,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentRecords.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {fmt(r.created_at)}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {r.wtn_number}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {r.transfer_date}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {r.waste_producer_name}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {r.ewc_code}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    <a
                      href={`/api/wtn/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#0070f3", textDecoration: "underline" }}
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}

              {recentRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10, color: "#666" }}>
                    No WTN records yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
