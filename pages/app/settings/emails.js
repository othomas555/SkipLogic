import { useEffect, useMemo, useState } from "react";
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

function KeyLabel(k) {
  const map = {
    booking_confirmed: "Booking confirmation",
    delivery_today: "Skip being delivered today",
    swap_confirmed: "Swap booking confirmation",
    custom_skip_confirmed: "Custom skip confirmation",
    collected_confirmation: "Skip collected email / WTN",
    term_hire_reminder_1: "Term hire reminder 1",
    term_hire_reminder_2: "Term hire reminder 2",
    term_hire_final_notice: "Term hire final notice",
  };
  return map[k] || k;
}

function Section({ title, children }) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 12,
        padding: 14,
        marginBottom: 14,
        background: "#fff",
      }}
    >
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

function asBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v == null) return fallback;
  return !!v;
}

function asIntString(v, fallback = "") {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return String(Math.trunc(n));
}

function asMoneyString(v, fallback = "") {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return String(n);
}

function normaliseSettings(raw) {
  const s = raw || {};
  return {
    ...s,
    is_enabled: asBool(s.is_enabled, false),
    send_bcc: asBool(s.send_bcc, false),

    term_hire_enabled: asBool(s.term_hire_enabled, false),
    term_hire_default_days: asIntString(s.term_hire_default_days, "14"),
    term_hire_reminder_1_days_before: asIntString(s.term_hire_reminder_1_days_before, "4"),
    term_hire_reminder_2_days_before: asIntString(s.term_hire_reminder_2_days_before, "2"),
    term_hire_final_notice_enabled: asBool(s.term_hire_final_notice_enabled, true),
    term_hire_extension_price_per_week: asMoneyString(s.term_hire_extension_price_per_week, "0"),
    term_hire_auto_book_collection: asBool(s.term_hire_auto_book_collection, false),
    term_hire_email_enabled: asBool(s.term_hire_email_enabled, true),
    term_hire_sms_enabled: asBool(s.term_hire_sms_enabled, false),
  };
}

function sortTemplates(arr) {
  const order = [
    "booking_confirmed",
    "delivery_today",
    "swap_confirmed",
    "custom_skip_confirmed",
    "collected_confirmation",
    "term_hire_reminder_1",
    "term_hire_reminder_2",
    "term_hire_final_notice",
  ];

  const list = Array.isArray(arr) ? [...arr] : [];
  list.sort((a, b) => {
    const ai = order.indexOf(a?.template_key);
    const bi = order.indexOf(b?.template_key);
    const av = ai === -1 ? 999 : ai;
    const bv = bi === -1 ? 999 : bi;
    if (av !== bv) return av - bv;
    return String(a?.template_key || "").localeCompare(String(b?.template_key || ""));
  });
  return list.filter((t) => order.includes(t?.template_key));
}

function ensureTemplate(list, templateKey, defaults) {
  const arr = Array.isArray(list) ? [...list] : [];
  const exists = arr.some((t) => t?.template_key === templateKey);
  if (exists) return arr;

  const d = defaults?.[templateKey] || {};
  arr.push({
    template_key: templateKey,
    enabled: true,
    subject: d.subject || "",
    body_html: d.body_html || "",
  });
  return arr;
}

function jobOptionLabel(job) {
  if (!job) return "";
  const bits = [
    job.job_number || "No ref",
    job.customer_label || "Customer",
    job.site_postcode || "",
    job.term_hire_end_date ? `end ${job.term_hire_end_date}` : "",
    job.job_status || "",
  ].filter(Boolean);
  return bits.join(" · ");
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
  const [recentJobs, setRecentJobs] = useState([]);
  const [officeEmail, setOfficeEmail] = useState("");

  const [testBusy, setTestBusy] = useState(false);
  const [testJobId, setTestJobId] = useState("");
  const [testTemplateKey, setTestTemplateKey] = useState("booking_confirmed");
  const [testDaysRemaining, setTestDaysRemaining] = useState("");
  const [testToEmail, setTestToEmail] = useState("");

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
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load email settings");

      const nextDefaults = json.defaults || {};
      let nextTemplates = Array.isArray(json.templates) ? json.templates : [];

      nextTemplates = ensureTemplate(nextTemplates, "booking_confirmed", nextDefaults);
      nextTemplates = ensureTemplate(nextTemplates, "delivery_today", nextDefaults);
      nextTemplates = ensureTemplate(nextTemplates, "swap_confirmed", nextDefaults);
      nextTemplates = ensureTemplate(nextTemplates, "custom_skip_confirmed", nextDefaults);
      nextTemplates = ensureTemplate(nextTemplates, "collected_confirmation", nextDefaults);
      nextTemplates = ensureTemplate(nextTemplates, "term_hire_reminder_1", nextDefaults);
      nextTemplates = ensureTemplate(nextTemplates, "term_hire_reminder_2", nextDefaults);
      nextTemplates = ensureTemplate(nextTemplates, "term_hire_final_notice", nextDefaults);

      const sortedTemplates = sortTemplates(nextTemplates);

      setSettings(normaliseSettings(json.settings));
      setTemplates(sortedTemplates);
      setDefaults(nextDefaults);
      setOutbox(Array.isArray(json.outbox) ? json.outbox : []);
      setMergeTags(Array.isArray(json.merge_tags) ? json.merge_tags : []);
      setRecentJobs(Array.isArray(json.recent_jobs) ? json.recent_jobs : []);
      setOfficeEmail(json.office_email || profile?.email || "");
      setTestToEmail((prev) => prev || json.office_email || profile?.email || "");

      const firstJobId =
        Array.isArray(json.recent_jobs) && json.recent_jobs.length > 0
          ? json.recent_jobs[0].id
          : "";
      setTestJobId((prev) => prev || firstJobId);

      setTestTemplateKey((prev) => {
        if (sortedTemplates.some((t) => t.template_key === prev)) return prev;
        return sortedTemplates[0]?.template_key || "booking_confirmed";
      });

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
    setTemplates((prev) =>
      sortTemplates(
        (Array.isArray(prev) ? prev : []).map((t) =>
          t.template_key === key ? { ...t, ...patch } : t
        )
      )
    );
  }

  function updateSetting(key, value) {
    setSettings((s) => normaliseSettings({ ...(s || {}), [key]: value }));
  }

  async function saveAll() {
    setBusy(true);
    setErr("");
    setOkMsg("");
    try {
      const token = getToken();
      const res = await fetch("/api/settings/emails/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? "Bearer " + token : "",
        },
        body: JSON.stringify({ settings, templates }),
      });
      const json = await res.json().catch(() => ({}));
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
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? "Bearer " + token : "",
        },
        body: JSON.stringify({ to_email: to }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        const details = json?.details
          ? "\n\nDetails:\n" + JSON.stringify(json.details, null, 2)
          : "";
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

  async function sendEmailTemplateTest() {
    setTestBusy(true);
    setErr("");
    setOkMsg("");

    try {
      const token = getToken();

      if (!testJobId) {
        throw new Error("Please choose a job to test against");
      }

      if (!testTemplateKey) {
        throw new Error("Please choose a test template");
      }

      const payload = {
        job_id: testJobId,
        template_key: testTemplateKey,
        to_email: testToEmail,
      };

      if (String(testDaysRemaining || "").trim() !== "") {
        payload.days_remaining = Number(testDaysRemaining);
      }

      const res = await fetch("/api/settings/emails/send-term-hire-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? "Bearer " + token : "",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to queue test email");
      }

      setOkMsg(
        `Queued test ${KeyLabel(json.template_key || testTemplateKey)} email for ${
          json.job_number || "job"
        } to ${json.to_email || testToEmail} ✅`
      );
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setTestBusy(false);
    }
  }

  async function resendAction(action, payload = {}) {
    const token = getToken();
    const res = await fetch("/api/settings/emails/resend-domains", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? "Bearer " + token : "",
      },
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
      const arr = Array.isArray(list) ? list : [];

      setDomains(arr);

      if (pickByName) {
        const found = arr.find((d) => String(d.name || "").toLowerCase() === String(pickByName).toLowerCase());
        if (found?.id) setSelectedDomainId(String(found.id));
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

      setDomainOk(
        "Domain added in Resend. Add the DNS records below at your DNS provider, then click Verify."
      );

      const createdId = data?.id || data?.data?.id || null;
      await refreshDomains({ pickByName: name });

      if (createdId) {
        setSelectedDomainId(String(createdId));
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
      setDomainOk("Verification started. Resend will check DNS. Refresh details in a minute.");
      await getDomain(domain_id);
    } catch (e) {
      setDomainErr(e?.message || String(e));
    } finally {
      setDomainBusy(false);
    }
  }

  useEffect(() => {
    if (!loading) {
      const inferred = domainName || getDomainFromEmail(settings?.from_email);
      refreshDomains({ pickByName: inferred });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (selectedDomainId) getDomain(selectedDomainId);
    else setDomainDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomainId]);

  const domainStatus = String(domainDetail?.status || "").toLowerCase();
  const domainRecords = domainDetail?.records || null;

  const allMergeTags = Array.from(
    new Set([
      ...(Array.isArray(mergeTags) ? mergeTags : []),
      "{{customer_name}}",
      "{{job_number}}",
      "{{scheduled_date}}",
      "{{collected_date}}",
      "{{site_address}}",
      "{{site_postcode}}",
      "{{price_inc_vat}}",
      "{{payment_type}}",
      "{{terms_and_conditions}}",
      "{{wtn_url}}",
      "{{days_remaining}}",
      "{{extension_price}}",
      "{{extend_url}}",
      "{{collection_url}}",
      "{{hire_end_date}}",
    ])
  );

  const testableTemplates = useMemo(
    () => (Array.isArray(templates) ? templates : []).filter((t) => !!t?.template_key),
    [templates]
  );

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

      <h1 style={{ margin: "0 0 12px" }}>Settings · Emails</h1>

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

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button
          disabled={busy}
          onClick={saveAll}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "white",
          }}
        >
          {busy ? "Working…" : "Save"}
        </button>
        <button
          disabled={busy}
          onClick={sendTest}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "white",
          }}
        >
          Send basic test email
        </button>
      </div>

      <Section title="Email Testing">
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fafafa",
            fontSize: 13,
            color: "#444",
            lineHeight: 1.6,
          }}
        >
          Send any editable email template immediately against a real job. This lets you check the
          wording, merge tags, customer details, and send log without waiting for booking, collection,
          or cron automation.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10 }}>
          <div>Send to</div>
          <div>
            <input
              value={testToEmail}
              onChange={(e) => setTestToEmail(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
              placeholder={officeEmail || "you@example.com"}
            />
          </div>

          <div>Job</div>
          <div>
            <select
              value={testJobId}
              onChange={(e) => setTestJobId(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <option value="">Select a job…</option>
              {(Array.isArray(recentJobs) ? recentJobs : []).map((job) => (
                <option key={job.id} value={job.id}>
                  {jobOptionLabel(job)}
                </option>
              ))}
            </select>
          </div>

          <div>Template</div>
          <div>
            <select
              value={testTemplateKey}
              onChange={(e) => setTestTemplateKey(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              {testableTemplates.map((t) => (
                <option key={t.template_key} value={t.template_key}>
                  {KeyLabel(t.template_key)}
                </option>
              ))}
            </select>
          </div>

          <div>Override days remaining</div>
          <div>
            <input
              type="number"
              min="0"
              max="365"
              value={testDaysRemaining}
              onChange={(e) => setTestDaysRemaining(e.target.value)}
              style={{
                width: 180,
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
              placeholder="Optional"
            />
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              Optional. Only used by term-hire templates that include the days remaining merge tag.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button
            disabled={testBusy}
            onClick={sendEmailTemplateTest}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            {testBusy ? "Queueing…" : "Send selected email test now"}
          </button>
        </div>
      </Section>

      <Section title="Sender (Resend)">
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10 }}>
          <div>Enable emails</div>
          <div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!settings.is_enabled}
                onChange={(e) => updateSetting("is_enabled", e.target.checked)}
              />
              Enabled
            </label>
          </div>

          <div>From name</div>
          <div>
            <input
              value={settings.from_name || ""}
              onChange={(e) => updateSetting("from_name", e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
              placeholder="Thomas Skip Hire"
            />
          </div>

          <div>From email</div>
          <div>
            <input
              value={settings.from_email || ""}
              onChange={(e) => {
                const v = e.target.value;
                updateSetting("from_email", v);
                const dom = getDomainFromEmail(v);
                if (dom) setDomainName(dom);
              }}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
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
              onChange={(e) => updateSetting("reply_to", e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
              placeholder="bookings@thomasskiphire.co.uk"
            />
          </div>

          <div>BCC a copy</div>
          <div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!settings.send_bcc}
                onChange={(e) => updateSetting("send_bcc", e.target.checked)}
              />
              Enabled
            </label>
            {settings.send_bcc ? (
              <input
                value={settings.bcc_email || ""}
                onChange={(e) => updateSetting("bcc_email", e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 10,
                  marginTop: 8,
                }}
                placeholder="office@thomasskiphire.co.uk"
              />
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Term hire automation">
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fafafa",
            fontSize: 13,
            color: "#444",
          }}
        >
          This controls extra hire reminders and paid weekly extensions. Emails must stop once a
          collection is booked, the skip is collected, the job is cancelled, or reminders are
          suppressed by the system.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 10 }}>
          <div>Enable term hire automation</div>
          <div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!settings.term_hire_enabled}
                onChange={(e) => updateSetting("term_hire_enabled", e.target.checked)}
              />
              Enabled
            </label>
          </div>

          <div>Use email channel</div>
          <div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!settings.term_hire_email_enabled}
                onChange={(e) => updateSetting("term_hire_email_enabled", e.target.checked)}
              />
              Enabled
            </label>
          </div>

          <div>SMS channel (future)</div>
          <div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!settings.term_hire_sms_enabled}
                onChange={(e) => updateSetting("term_hire_sms_enabled", e.target.checked)}
              />
              Store as enabled later
            </label>
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              This does not send SMS yet. It is only here so we keep the settings shape ready.
            </div>
          </div>

          <div>Default hire days</div>
          <div>
            <input
              type="number"
              min="1"
              max="365"
              value={settings.term_hire_default_days || ""}
              onChange={(e) => updateSetting("term_hire_default_days", e.target.value)}
              style={{
                width: 180,
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
            />
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              Customer term days override will still take priority.
            </div>
          </div>

          <div>First reminder days before end</div>
          <div>
            <input
              type="number"
              min="0"
              max="365"
              value={settings.term_hire_reminder_1_days_before || ""}
              onChange={(e) => updateSetting("term_hire_reminder_1_days_before", e.target.value)}
              style={{
                width: 180,
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
            />
          </div>

          <div>Second reminder days before end</div>
          <div>
            <input
              type="number"
              min="0"
              max="365"
              value={settings.term_hire_reminder_2_days_before || ""}
              onChange={(e) => updateSetting("term_hire_reminder_2_days_before", e.target.value)}
              style={{
                width: 180,
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
            />
          </div>

          <div>Send final notice on end day</div>
          <div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!settings.term_hire_final_notice_enabled}
                onChange={(e) => updateSetting("term_hire_final_notice_enabled", e.target.checked)}
              />
              Enabled
            </label>
          </div>

          <div>Extension price per week (£)</div>
          <div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.term_hire_extension_price_per_week || ""}
              onChange={(e) => updateSetting("term_hire_extension_price_per_week", e.target.value)}
              style={{
                width: 180,
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 10,
              }}
            />
          </div>

          <div>Auto-book collection if no response</div>
          <div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!settings.term_hire_auto_book_collection}
                onChange={(e) => updateSetting("term_hire_auto_book_collection", e.target.checked)}
              />
              Enabled
            </label>
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              This only stores the setting for now. The actual auto-book collection logic will be
              wired in the reminder processor.
            </div>
          </div>
        </div>
      </Section>

      <Section title="Domain verification (Resend)">
        {domainErr ? (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #f3c2c2",
              background: "#fff5f5",
            }}
          >
            {domainErr}
          </div>
        ) : null}
        {domainOk ? (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #cde8d1",
              background: "#f2fff4",
            }}
          >
            {domainOk}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={domainName}
            onChange={(e) => setDomainName(e.target.value)}
            placeholder="thomasskiphire.co.uk"
            style={{
              flex: 1,
              minWidth: 260,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
            }}
          />
          <button
            disabled={domainBusy}
            onClick={createDomain}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "white",
            }}
          >
            {domainBusy ? "Working…" : "Add domain"}
          </button>
          <button
            disabled={domainBusy}
            onClick={() => refreshDomains({ pickByName: domainName })}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "white",
            }}
          >
            Refresh list
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Domains</div>
          <select
            value={selectedDomainId}
            onChange={(e) => setSelectedDomainId(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "white",
            }}
          >
            <option value="">Select a domain…</option>
            {(Array.isArray(domains) ? domains : []).map((d, index) => (
              <option key={String(d.id || index)} value={String(d.id || "")}>
                {String(d.name || d.id || "—")} {d.status ? `— ${d.status}` : ""}
              </option>
            ))}
          </select>

          {selectedDomainId ? (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 10,
                alignItems: "center",
              }}
            >
              <button
                disabled={domainBusy}
                onClick={() => getDomain(selectedDomainId)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "white",
                }}
              >
                Refresh details
              </button>
              <button
                disabled={domainBusy}
                onClick={() => verifyDomain(selectedDomainId)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "white",
                  fontWeight: 800,
                }}
              >
                Verify now
              </button>
              <div style={{ fontSize: 12, color: "#666" }}>
                Status: <b>{domainStatus || "—"}</b>
              </div>
            </div>
          ) : null}

          {selectedDomainId ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>DNS records</div>

              {Array.isArray(domainRecords) ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {domainRecords.map((r, index) => (
                    <div
                      key={index}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 12,
                        padding: 10,
                        background: "#fafafa",
                      }}
                    >
                      <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(r, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <pre
                  style={{
                    margin: 0,
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                    background: "#fafafa",
                  }}
                >
                  {JSON.stringify(domainDetail, null, 2)}
                </pre>
              )}
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Templates (HTML)">
        <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
          Merge tags:{" "}
          <span style={{ fontFamily: "monospace" }}>{allMergeTags.join("  ")}</span>
        </div>

        {(Array.isArray(templates) ? templates : []).map((t, index) => (
          <div
            key={t.template_key || index}
            style={{
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
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
                style={{
                  width: "100%",
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 10,
                }}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Body (HTML)</div>
              <textarea
                value={t.body_html || ""}
                onChange={(e) => updateTemplate(t.template_key, { body_html: e.target.value })}
                style={{
                  width: "100%",
                  minHeight:
                    t.template_key === "term_hire_reminder_1" ||
                    t.template_key === "term_hire_reminder_2" ||
                    t.template_key === "term_hire_final_notice" ||
                    t.template_key === "booking_confirmed" ||
                    t.template_key === "delivery_today"
                      ? 240
                      : 180,
                  padding: 10,
                  border: "1px solid #ccc",
                  borderRadius: 10,
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                disabled={busy}
                onClick={() => {
                  const d = defaults?.[t.template_key] || { subject: "", body_html: "" };
                  updateTemplate(t.template_key, {
                    subject: d.subject,
                    body_html: d.body_html,
                  });
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "white",
                }}
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
              {(Array.isArray(outbox) ? outbox : []).map((m, index) => (
                <tr key={m.id || index}>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {fmt(m.created_at)}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {KeyLabel(m.template_key || "—")}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {m.to_email}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f2f2f2" }}>
                    {m.status}
                  </td>
                  <td
                    style={{
                      padding: 10,
                      borderBottom: "1px solid #f2f2f2",
                      color: "#a00",
                    }}
                  >
                    {m.error || ""}
                  </td>
                </tr>
              ))}
              {(Array.isArray(outbox) ? outbox : []).length === 0 ? (
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
