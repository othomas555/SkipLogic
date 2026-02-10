// pages/app/settings/emails.js
import { useEffect, useMemo, useState } from "react";
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

function KeyLabel(k) {
  const map = {
    booking_confirmed: "Booking confirmation",
    skip_due_for_collection: "Skip booked to be collected (prompt)",
    swap_scheduled: "Skip swap email",
    collected_confirmation: "Skip collected email",
    term_ending_reminder: "Hire coming to an end (14 day rule reminder)",
  };
  return map[k] || k;
}

function Section({ title, children }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function getDomainFromEmail(email) {
  const s = String(email || "").trim();
  const at = s.lastIndexOf("@");
  if (at === -1) return "";
  return s.slice(at + 1).toLowerCase();
}

export default function EmailSettingsPage() {
  const { profile, loading } = useAuthProfile();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [settings, setSettings] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [defaults, setDefaults] = useState({});
  const [outbox, setOutbox] = useState([]);
  const [mergeTags, setMergeTags] = useState([]);

  // Resend domain UI
  const [domainName, setDomainName] = useState("");
  const [domains, setDomains] = useState([]);
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [domainDetail, setDomainDetail] = useState(null);
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainErr, setDomainErr] = useState("");
  const [domainOk, setDomainOk] = useState("");

  async function load() {
    setBusy(true);
    setErr("");
    setOkMsg("");
    try {
      const token = getToken();
      const res = await fetch("/api/settings/emails/get", {
        headers: { Authorization: token ? "Bearer " + token : "" },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load email settings");

      setSettings(json.settings);
      setTemplates(json.templates || []);
      setDefaults(json.defaults || {});
      setOutbox(json.outbox || []);
      setMergeTags(json.merge_tags || []);

      const inferred = getDomainFromEmail(json.settings?.from_email);
      setDomainName((prev) => prev || inferred);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function updateTemplate(key, patch) {
    setTemplates((prev) => prev.map((t) => (t.template_key === key ? { ...t, ...patch } : t)));
  }

  async function saveAll() {
    setBusy(true);
    setErr("");
    setOkMsg("");
    try {
      const token = getToken();
      const res = await fetch("/api/settings/emails/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? "Bearer " + token : "" },
        body: JSON.stringify({ settings, templates }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Save failed");
      setOkMsg("Saved ✅");
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setErr("");
    setOkMsg("");
    try {
      const token = getToken();
      const to = prompt("Send test email to:", profile?.email || "");
      if (!to) return;

      const res = await fetch("/api/settings/emails/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? "Bearer " + token : "" },
        body: JSON.stringify({ to_email: to }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const details = json?.details ? "\n\nDetails:\n" + JSON.stringify(json.details, null, 2) : "";
        throw new Error((json.error || "Test send failed") + details);
      }
      setOkMsg("Test email sent ✅");
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // ===== Resend domain helpers =====
  async function resendAction(action, payload = {}) {
    const token = getToken();
    const res = await fetch("/api/settings/emails/resend-domains", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token ? "Bearer " + token : "" },
      body: JSON.stringify({ action, ...payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json?.error || "Resend request failed");
    return json.data;
  }

  async function refreshDomains({ pickByName } = {}) {
    setDomainBusy(true);
    setDomainErr("");
    setDomainOk("");
    try {
      const data = await resendAction("list");
      const list = data?.data || data?.domains || data || [];
      setDomains(Array.isArray(list) ? list : []);

      if (pickByName) {
        const found = (Array.isArray(list) ? list : []).find((d) => String(d.name || "").toLowerCase() === String(pickByName).toLowerCase());
        if (found?.id) setSelectedDomainId(found.id);
      }
    } catch (e) {
      setDomainErr(e?.message || String(e));
    } finally {
      setDomainBusy(false);
    }
  }

  async function createDomain() {
    const name = String(domainName || "").trim().toLowerCase();
    if (!name) return setDomainErr("Enter a domain first (e.g. thomasskiphire.co.uk).");

    setDomainBusy(true);
    setDomainErr("");
    setDomainOk("");
    try {
      const data = await resendAction("create", { name });
      setDomainOk("Domain added in Resend. Now add the DNS records shown below, then click Verify.");
      await refreshDomains({ pickByName: name });

      // attempt to fetch detail if response contains id
      const id = data?.id || data?.data?.id;
      if (id) {
        setSelectedDomainId(id);
        await getDomain(id);
      }
    } catch (e) {
      setDomainErr(e?.message || String(e));
    } finally {
      setDomainBusy(false);
    }
  }

  async function getDomain(domain_id) {
    setDomainBusy(true);
    setDomainErr("");
    setDomainOk("");
    try {
      const data = await resendAction("get", { domain_id });
      setDomainDetail(data?.data || data);
      setDomainOk("Domain details loaded.");
    } catch (e) {
      setDomainErr(e?.message || String(e));
    } finally {
      setDomainBusy(false);
    }
  }

  async function verifyDomain(domain_id) {
    setDomainBusy(true);
    setDomainErr("");
    setDomainOk("");
    try {
      await resendAction("verify", { domain_id });
      setDomainOk("Verification started. Resend will mark it pending while it checks DNS. Refresh in a minute.");
      await getDomain(domain_id);
    } catch (e) {
      setDomainErr(e?.message || String(e));
    } finally {
      setDomainBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && profile) {
      refreshDomains({ pickByName: domainName || getDomainFromEmail(settings?.from_email) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (selectedDomainId) {
      getDomain(selectedDomainId);
    } else {
      setDomainDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomainId]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!settings) return <div style={{ padding: 16 }}>{busy ? "Loading…" : "No settings loaded"}</div>;

  const domainStatus = String(domainDetail?.status || domainDetail?.data?.status || "").toLowerCase();
  const domainRecords = domainDetail?.records || domainDetail?.data?.records || null;

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 12px" }}>Settings · Emails</h1>

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, border: "1px solid #f3c2c2", background: "#fff5f5", borderRadius: 10 }}>
          {err}
        </div>
      ) : null}
      {okMsg ? (
        <div style={{ marginBottom: 12, padding: 12, border: "1px solid #cde8d1", background: "#f2fff4", borderRadius: 10 }}>
          {okMsg}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button
          disabled={busy}
          onClick={saveAll}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ccc", background: "white" }}
        >
          {busy ? "Working…" : "Save"}
        </button>
        <button
          disabled={busy}
          onClick={sendTest}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ccc", background: "white" }}
        >
          Send test email
        </button>
      </div>

      <Section title="Sender (Resend)">
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10 }}>
          <div>Enable emails</div>
          <div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!settings.is_enabled}
                onChange={(e) => setSettings((s) => ({ ...s, is_enabled: e.target.checked }))}
              />
              Enabled
            </label>
          </div>

          <div>From name</div>
          <div>
            <input
              value={settings.from_name || ""}
              onChange={(e) => setSettings((s) => ({ ...s, from_name: e.target.value }))}
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
              placeholder="Thomas Skip Hire"
            />
          </div>

          <div>From email</div>
          <div>
            <input
              value={settings.from_email || ""}
              onChange={(e) => {
                const v = e.target.value;
                setSettings((s) => ({ ...s, from_email: v }));
                const dom = getDomainFromEmail(v);
                if (dom) setDomainName(dom);
              }}
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
              placeholder="bookings@thomasskiphire.co.uk"
            />
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              Must be on a verified domain in Resend.
            </div>
          </div>

          <div>Reply-to</div>
          <div>
            <input
              value={settings.reply_to || ""}
              onChange={(e) => setSettings((s) => ({ ...s, reply_to: e.target.value }))}
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
              placeholder="bookings@thomasskiphire.co.uk"
            />
          </div>

          <div>BCC a copy</div>
          <div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!settings.send_bcc}
                onChange={(e) => setSettings((s) => ({ ...s, send_bcc: e.target.checked }))}
              />
              Enabled
            </label>
            {settings.send_bcc ? (
              <input
                value={settings.bcc_email || ""}
                onChange={(e) => setSettings((s) => ({ ...s, bcc_email: e.target.value }))}
                style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 10, marginTop: 8 }}
                placeholder="office@thomasskiphire.co.uk"
              />
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Domain verification (Resend)">
        <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
          Add your domain, copy the DNS records into your DNS provider, then click Verify. Resend will mark the domain
          pending while it checks DNS. :contentReference[oaicite:3]{index=3}
        </div>

        {domainErr ? (
          <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, border: "1px solid #f3c2c2", background: "#fff5f5" }}>
            {domainErr}
          </div>
        ) : null}
        {domainOk ? (
          <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, border: "1px solid #cde8d1", background: "#f2fff4" }}>
            {domainOk}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={domainName}
            onChange={(e) => setDomainName(e.target.value)}
            placeholder="thomasskiphire.co.uk"
            style={{ flex: 1, minWidth: 260, padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
          <button
            disabled={domainBusy}
            onClick={createDomain}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ccc", background: "white" }}
          >
            {domainBusy ? "Working…" : "Add domain"}
          </button>
          <button
            disabled={domainBusy}
            onClick={() => refreshDomains({ pickByName: domainName })}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ccc", background: "white" }}
          >
            Refresh list
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Domains</div>
          <select
            value={selectedDomainId}
            onChange={(e) => setSelectedDomainId(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc", background: "white" }}
          >
            <option value="">Select a domain…</option>
            {domains.map((d) => (
              <option key={String(d.id)} value={String(d.id)}>
                {String(d.name || d.id)} {d.status ? `— ${d.status}` : ""}
              </option>
            ))}
          </select>

          {selectedDomainId ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
              <button
                disabled={domainBusy}
                onClick={() => getDomain(selectedDomainId)}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ccc", background: "white" }}
              >
                Refresh details
              </button>
              <button
                disabled={domainBusy}
                onClick={() => verifyDomain(selectedDomainId)}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "white", fontWeight: 800 }}
              >
                Verify now
              </button>

              <div style={{ fontSize: 12, color: "#666" }}>
                Status: <b>{domainStatus || "—"}</b>
              </div>
            </div>
          ) : null}

          {selectedDomainId ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>DNS records</div>

              {Array.isArray(domainRecords) ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {domainRecords.map((r, idx) => (
                    <div key={idx} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fafafa" }}>
                      <div style={{ fontSize: 12, marginBottom: 6 }}>
                        <b>{r.type || "record"}</b> {r.name ? `— ${r.name}` : ""}
                      </div>
                      <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(r, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fafafa" }}>
                  {JSON.stringify(domainDetail, null, 2)}
                </pre>
              )}
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Templates (HTML)">
        <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
          Merge tags (we’ll fill these properly when we wire triggers):{" "}
          <span style={{ fontFamily: "monospace" }}>{mergeTags.join("  ")}</span>
        </div>

        {templates.map((t) => (
          <div key={t.template_key} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ fontWeight: 800 }}>{KeyLabel(t.template_key)}</div>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!t.enabled}
                  onChange={(e) => updateTemplate(t.template_key, { enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Subject</div>
              <input
                value={t.subject || ""}
                onChange={(e) => updateTemplate(t.template_key, { subject: e.target.value })}
                style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Body (HTML)</div>
              <textarea
                value={t.body_html || ""}
                onChange={(e) => updateTemplate(t.template_key, { body_html: e.target.value })}
                style={{ width: "100%", minHeight: 180, padding: 10, border: "1px solid #ccc", borderRadius: 10, fontFamily: "monospace", fontSize: 12 }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                disabled={busy}
                onClick={() => {
                  const d = defaults[t.template_key] || { subject: "", body_html: "" };
                  updateTemplate(t.template_key, { subject: d.subject, body_html: d.body_html });
                }}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ccc", background: "white" }}
              >
                Use default
              </button>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Recent sends (log)">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {["When", "Template", "To", "Status", "Error"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(outbox || []).map((m) => (
                <tr key={m.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{fmt(m.created_at)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{m.template_key || "—"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{m.to_email}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>{m.status}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2", color: "#a00" }}>{m.error || ""}</td>
                </tr>
              ))}
              {(outbox || []).length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 10, color: "#666" }}>
                    No emails sent yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
