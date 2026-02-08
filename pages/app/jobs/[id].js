// pages/app/jobs/[id].js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function fmtDate(d) {
  return d ? String(d) : "—";
}

function fmtDateTime(x) {
  if (!x) return "—";
  const dt = new Date(x);
  if (!Number.isFinite(dt.getTime())) return String(x);
  // Stable, timezone-agnostic representation
  return dt.toISOString().replace("T", " ").replace("Z", " UTC");
}

function toInt(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function addDays(ymd, days) {
  if (!ymd) return null;
  const dt = new Date(ymd + "T00:00:00Z");
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(aYmd, bYmd) {
  if (!aYmd || !bYmd) return null;
  const a = new Date(aYmd + "T00:00:00Z").getTime();
  const b = new Date(bYmd + "T00:00:00Z").getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function todayYMDUTC() {
  const dt = new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState("");

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [job, setJob] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [subscriberSettings, setSubscriberSettings] = useState(null);

  const [reminderLogs, setReminderLogs] = useState([]);

  const [siteName, setSiteName] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [plannedDelivery, setPlannedDelivery] = useState("");
  const [plannedCollection, setPlannedCollection] = useState("");
  const [noteText, setNoteText] = useState("");

  async function loadAll() {
    if (checking) return;
    if (!user || !subscriberId || !id) return;

    setLoading(true);
    setErrorMsg("");

    const { data: j, error: jErr } = await supabase
      .from("jobs")
      .select(
        `
        id,
        subscriber_id,
        customer_id,
        job_number,
        job_status,
        site_name,
        site_postcode,
        scheduled_date,
        delivery_actual_date,
        collection_date,
        collection_actual_date,
        hire_extension_days,
        payment_type,
        created_at,
        delivery_photo_url,
        collection_photo_url,
        swap_full_photo_url,
        swap_empty_photo_url,

        xero_invoice_id,
        xero_invoice_number,
        xero_invoice_status,

        paid_at,
        paid_by_user_id,
        paid_method,
        paid_reference,
        xero_payment_id
      `
      )
      .eq("id", id)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (jErr) {
      console.error(jErr);
      setErrorMsg("Could not load job.");
      setLoading(false);
      return;
    }
    if (!j) {
      setErrorMsg("Job not found (or you don't have access).");
      setLoading(false);
      return;
    }

    const { data: c, error: cErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, company_name, term_hire_exempt, term_hire_days_override")
      .eq("id", j.customer_id)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (cErr) console.error(cErr);

    const { data: s, error: sErr } = await supabase
      .from("subscribers")
      .select("id, term_hire_days, term_hire_reminder_days_before")
      .eq("id", subscriberId)
      .maybeSingle();

    if (sErr) console.error(sErr);

    const { data: logs, error: lErr } = await supabase
      .from("term_hire_reminder_log")
      .select("reminder_date, sent_to")
      .eq("subscriber_id", subscriberId)
      .eq("job_id", j.id)
      .order("reminder_date", { ascending: false });

    if (lErr) console.error(lErr);

    setJob(j);
    setCustomer(c || null);
    setSubscriberSettings(s || null);
    setReminderLogs(Array.isArray(logs) ? logs : []);

    setSiteName(j.site_name || "");
    setSitePostcode(j.site_postcode || "");
    setPlannedDelivery(j.scheduled_date || "");
    setPlannedCollection(j.collection_date || "");

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId, id]);

  const customerName = useMemo(() => {
    if (!customer) return "—";
    const base = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
    if (customer.company_name) return `${customer.company_name}${base ? ` – ${base}` : ""}`;
    return base || "—";
  }, [customer]);

  const termHireDays = useMemo(() => {
    const subDefault = toInt(subscriberSettings?.term_hire_days, 14);
    const override = customer?.term_hire_days_override;
    const exempt = !!customer?.term_hire_exempt;

    if (exempt) return null;
    if (override != null && String(override) !== "") return toInt(override, subDefault);
    return subDefault;
  }, [subscriberSettings, customer]);

  const reminderBeforeDays = useMemo(() => {
    return toInt(subscriberSettings?.term_hire_reminder_days_before, 4);
  }, [subscriberSettings]);

  const reminderDay = useMemo(() => {
    const term = termHireDays;
    if (!term) return null;
    return Math.max(0, term - reminderBeforeDays);
  }, [termHireDays, reminderBeforeDays]);

  const deliveryAnchor = useMemo(() => {
    return job?.delivery_actual_date || job?.scheduled_date || null;
  }, [job]);

  const totalHireDays = useMemo(() => {
    if (!termHireDays) return null;
    return termHireDays + toInt(job?.hire_extension_days, 0);
  }, [termHireDays, job]);

  const scheduledReminderDate = useMemo(() => {
    if (!deliveryAnchor) return null;
    if (!totalHireDays) return null;
    return addDays(deliveryAnchor, Math.max(0, totalHireDays - reminderBeforeDays));
  }, [deliveryAnchor, totalHireDays, reminderBeforeDays]);

  const hireEndDate = useMemo(() => {
    if (!deliveryAnchor) return null;
    if (!totalHireDays) return null;
    return addDays(deliveryAnchor, totalHireDays);
  }, [deliveryAnchor, totalHireDays]);

  const daysRemaining = useMemo(() => {
    if (!hireEndDate) return null;
    return daysBetween(todayYMDUTC(), hireEndDate);
  }, [hireEndDate]);

  const hireStateLabel = useMemo(() => {
    if (termHireDays == null) return "Term hire: EXEMPT (contract / tip & returns)";
    if (!deliveryAnchor) return "Term hire: pending (no delivery date yet)";
    if (daysRemaining == null) return "Term hire: —";
    if (daysRemaining < 0) return `OVERDUE by ${Math.abs(daysRemaining)} day(s)`;
    if (daysRemaining === 0) return "Due today";
    return `${daysRemaining} day(s) remaining`;
  }, [termHireDays, deliveryAnchor, daysRemaining]);

  const reminderLogMatch = useMemo(() => {
    if (!scheduledReminderDate) return null;
    const rows = Array.isArray(reminderLogs) ? reminderLogs : [];
    return rows.find((r) => String(r?.reminder_date || "") === scheduledReminderDate) || null;
  }, [reminderLogs, scheduledReminderDate]);

  const reminderStatus = useMemo(() => {
    if (termHireDays == null) return { label: "Exempt", tone: "muted" };
    if (!deliveryAnchor) return { label: "Pending (no delivery date)", tone: "muted" };
    if (!scheduledReminderDate) return { label: "—", tone: "muted" };

    if (reminderLogMatch) {
      return { label: `Sent (for ${scheduledReminderDate})`, tone: "good" };
    }

    const diff = daysBetween(todayYMDUTC(), scheduledReminderDate);
    if (diff == null) return { label: "—", tone: "muted" };
    if (diff > 0) return { label: `Due in ${diff} day(s)`, tone: "muted" };
    if (diff === 0) return { label: "Due today", tone: "warn" };
    return { label: `Overdue by ${Math.abs(diff)} day(s)`, tone: "bad" };
  }, [termHireDays, deliveryAnchor, scheduledReminderDate, reminderLogMatch]);

  // Billing helpers (NEW)
  const isPaid = useMemo(() => {
    return !!job?.paid_at;
  }, [job]);

  const billingTone = useMemo(() => {
    if (isPaid) return "paid";
    // If Xero says PAID but our paid_at is missing, still treat as "attention"
    if (String(job?.xero_invoice_status || "").toUpperCase() === "PAID") return "attention";
    return "unpaid";
  }, [isPaid, job]);

  // Status helpers (YOUR statuses)
  const status = job?.job_status || "";
  const canMarkDelivered = status === "booked";
  const canUndoDelivered = status === "delivered" || !!job?.delivery_actual_date;
  const canRequestCollection = status === "delivered";
  const canMarkCollected = status === "delivered" || status === "awaiting_collection";
  const canUndoCollected = status === "collected" || !!job?.collection_actual_date;

  async function saveJobEdits() {
    if (!job?.id) return;

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    const patch = {
      site_name: siteName || null,
      site_postcode: sitePostcode || null,
      scheduled_date: plannedDelivery || null,
      collection_date: plannedCollection || null,
    };

    const { error } = await supabase
      .from("jobs")
      .update(patch)
      .eq("id", job.id)
      .eq("subscriber_id", subscriberId);

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg("Could not save job: " + (error.message || "Unknown error"));
      return;
    }

    setSuccessMsg("Saved.");
    await loadAll();
  }

  async function clearPhoto(field) {
    if (!job?.id) return;
    const ok = confirm("Clear this photo?");
    if (!ok) return;

    setActing(`clear_${field}`);
    setErrorMsg("");
    setSuccessMsg("");

    const patch = { [field]: null };

    const { error } = await supabase
      .from("jobs")
      .update(patch)
      .eq("id", job.id)
      .eq("subscriber_id", subscriberId);

    setActing("");

    if (error) {
      console.error(error);
      setErrorMsg("Could not clear photo: " + (error.message || "Unknown error"));
      return;
    }

    setSuccessMsg("Photo cleared.");
    await loadAll();
  }

  async function addNote() {
    if (!job?.id) return;
    const text = String(noteText || "").trim();
    if (!text) return;

    setActing("note");
    setErrorMsg("");
    setSuccessMsg("");

    const { error } = await supabase.rpc("create_job_event", {
      _job_id: job.id,
      _subscriber_id: subscriberId,
      _event_type: "note",
      _event_time: new Date().toISOString(),
      _scheduled_time: null,
      _notes: text,
    });

    setActing("");
    if (error) {
      console.error(error);
      setErrorMsg("Could not add note: " + (error.message || "Unknown error"));
      return;
    }

    setNoteText("");
    setSuccessMsg("Note added.");
  }

  async function runAction(eventType) {
    if (!job?.id) return;

    setActing(eventType);
    setErrorMsg("");
    setSuccessMsg("");

    const { error } = await supabase.rpc("create_job_event", {
      _job_id: job.id,
      _subscriber_id: subscriberId,
      _event_type: eventType,
      _event_time: new Date().toISOString(),
      _scheduled_time: null,
      _notes: null,
    });

    setActing("");
    if (error) {
      console.error(error);
      setErrorMsg("Could not update job: " + (error.message || "Unknown error"));
      return;
    }

    setSuccessMsg(`Updated: ${eventType.replace(/_/g, " ")}`);
    await loadAll();
  }

  async function extendHire(daysToAdd) {
    if (!job?.id) return;
    const add = toInt(daysToAdd, 0);
    if (add <= 0) return;

    setActing(`extend_${add}`);
    setErrorMsg("");
    setSuccessMsg("");

    const newTotal = toInt(job.hire_extension_days, 0) + add;

    const { error: uErr } = await supabase
      .from("jobs")
      .update({ hire_extension_days: newTotal })
      .eq("id", job.id)
      .eq("subscriber_id", subscriberId);

    if (uErr) {
      console.error(uErr);
      setActing("");
      setErrorMsg("Could not extend hire: " + (uErr.message || "Unknown error"));
      return;
    }

    const { error: eErr } = await supabase.rpc("create_job_event", {
      _job_id: job.id,
      _subscriber_id: subscriberId,
      _event_type: "hire_extended",
      _event_time: new Date().toISOString(),
      _scheduled_time: null,
      _notes: `Extension added: +${add} days (total extension now ${newTotal})`,
    });

    setActing("");
    if (eErr) {
      console.error(eErr);
      setErrorMsg("Extended hire saved, but could not log event: " + (eErr.message || "Unknown error"));
      await loadAll();
      return;
    }

    setSuccessMsg(`Hire extended by ${add} day(s).`);
    await loadAll();
  }

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Job</h1>
        <p>You must be signed in.</p>
        <button onClick={() => router.push("/login")} style={btnSecondary}>
          Go to login
        </button>
      </main>
    );
  }

  const reminderToneStyle =
    reminderStatus.tone === "good"
      ? { color: "green" }
      : reminderStatus.tone === "warn"
      ? { color: "#8a6d00" }
      : reminderStatus.tone === "bad"
      ? { color: "#8a1f1f" }
      : { color: "#555" };

  const billingCardStyle =
    billingTone === "paid"
      ? { ...cardStyle, border: "1px solid #bfe7c0", background: "#f2fff2" }
      : billingTone === "attention"
      ? { ...cardStyle, border: "1px solid #ffe58f", background: "#fffbe6" }
      : { ...cardStyle, border: "1px solid #f0b4b4", background: "#fff5f5" };

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app/jobs" style={linkStyle}>
            ← Back to jobs list
          </Link>
          <h1 style={{ margin: "10px 0 6px" }}>{job.job_number ? `Job ${job.job_number}` : "Job"}</h1>
          <div style={{ color: "#555", fontSize: 13 }}>
            <div>
              <b>Status:</b> {job.job_status || "—"}
            </div>
            <div>
              <b>Customer:</b> {customerName}
            </div>
            <div>
              <b>Site:</b>{" "}
              {job.site_name
                ? `${job.site_name}${job.site_postcode ? `, ${job.site_postcode}` : ""}`
                : job.site_postcode || "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <button onClick={saveJobEdits} disabled={saving} style={btnPrimary}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      {(authError || errorMsg || successMsg) && (
        <div style={{ marginBottom: 14 }}>
          {authError || errorMsg ? <p style={{ color: "red", margin: 0 }}>{authError || errorMsg}</p> : null}
          {successMsg ? <p style={{ color: "green", margin: 0 }}>{successMsg}</p> : null}
        </div>
      )}

      {/* Billing / Payments (NEW) */}
      <section style={billingCardStyle}>
        <h2 style={h2Style}>Billing</h2>

        <div style={kvGrid}>
          <div style={kv}>
            <span style={k}>Payment type</span>
            <span style={v}>{job.payment_type || "—"}</span>
          </div>

          <div style={kv}>
            <span style={k}>Paid status (SkipLogic)</span>
            <span style={{ ...v, color: isPaid ? "#1f6b2a" : "#8a1f1f" }}>{isPaid ? "PAID" : "UNPAID"}</span>
          </div>

          <div style={kv}>
            <span style={k}>Paid at</span>
            <span style={v}>{fmtDateTime(job.paid_at)}</span>
          </div>

          <div style={kv}>
            <span style={k}>Paid method</span>
            <span style={v}>{job.paid_method || "—"}</span>
          </div>

          <div style={kv}>
            <span style={k}>Paid reference</span>
            <span style={v}>{job.paid_reference || "—"}</span>
          </div>

          <div style={kv}>
            <span style={k}>Paid by (user id)</span>
            <span style={v} title={job.paid_by_user_id || ""} style={{ ...v, wordBreak: "break-all" }}>
              {job.paid_by_user_id || "—"}
            </span>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <h3 style={h3Style}>Xero invoice / payment</h3>
          <div style={kvGrid}>
            <div style={kv}>
              <span style={k}>Xero invoice status</span>
              <span style={v}>{job.xero_invoice_status || "—"}</span>
            </div>
            <div style={kv}>
              <span style={k}>Xero invoice number</span>
              <span style={v}>{job.xero_invoice_number || "—"}</span>
            </div>
            <div style={kv}>
              <span style={k}>Xero invoice id</span>
              <span style={{ ...v, wordBreak: "break-all" }}>{job.xero_invoice_id || "—"}</span>
            </div>
            <div style={kv}>
              <span style={k}>Xero payment id</span>
              <span style={{ ...v, wordBreak: "break-all" }}>{job.xero_payment_id || "—"}</span>
            </div>
          </div>

          {billingTone === "attention" ? (
            <p style={{ margin: "10px 0 0", color: "#8a6d00", fontSize: 13 }}>
              Note: Xero shows PAID but SkipLogic has no paid_at. (This can happen if the invoice was paid directly in Xero.)
            </p>
          ) : null}
        </div>
      </section>

      <div style={grid2}>
        <section style={cardStyle}>
          <h2 style={h2Style}>Dates</h2>
          <div style={kvGrid}>
            <div style={kv}>
              <span style={k}>Planned delivery</span>
              <span style={v}>{fmtDate(job.scheduled_date)}</span>
            </div>
            <div style={kv}>
              <span style={k}>Actual delivery</span>
              <span style={v}>{fmtDate(job.delivery_actual_date)}</span>
            </div>
            <div style={kv}>
              <span style={k}>Planned collection</span>
              <span style={v}>{fmtDate(job.collection_date)}</span>
            </div>
            <div style={kv}>
              <span style={k}>Actual collection</span>
              <span style={v}>{fmtDate(job.collection_actual_date)}</span>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <h3 style={h3Style}>Edit planned dates</h3>
            <div style={gridForm}>
              <label style={labelStyle}>
                Planned delivery
                <input
                  type="date"
                  value={plannedDelivery || ""}
                  onChange={(e) => setPlannedDelivery(e.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Planned collection
                <input
                  type="date"
                  value={plannedCollection || ""}
                  onChange={(e) => setPlannedCollection(e.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={h2Style}>Hire terms</h2>
          <div style={{ fontSize: 13, color: "#333" }}>
            <div style={{ marginBottom: 6 }}>
              <b>{hireStateLabel}</b>
            </div>

            {termHireDays == null ? (
              <p style={{ margin: "8px 0", color: "#666" }}>
                This customer is exempt from term hire (contract / tip & returns).
              </p>
            ) : (
              <>
                <div style={kvGrid}>
                  <div style={kv}>
                    <span style={k}>Term days</span>
                    <span style={v}>{termHireDays}</span>
                  </div>
                  <div style={kv}>
                    <span style={k}>Extension days</span>
                    <span style={v}>{toInt(job.hire_extension_days, 0)}</span>
                  </div>
                  <div style={kv}>
                    <span style={k}>Hire end date</span>
                    <span style={v}>{hireEndDate ? hireEndDate : "—"}</span>
                  </div>
                  <div style={kv}>
                    <span style={k}>Reminder day</span>
                    <span style={v}>{reminderDay != null ? `Day ${reminderDay}` : "—"}</span>
                  </div>

                  <div style={kv}>
                    <span style={k}>Scheduled reminder date</span>
                    <span style={v}>{scheduledReminderDate || "—"}</span>
                  </div>

                  <div style={kv}>
                    <span style={k}>Reminder status</span>
                    <span style={{ ...v, ...reminderToneStyle }}>{reminderStatus.label}</span>
                  </div>

                  <div style={kv}>
                    <span style={k}>Reminder sent to</span>
                    <span style={v}>{reminderLogMatch?.sent_to ? String(reminderLogMatch.sent_to) : "—"}</span>
                  </div>
                </div>

                <p style={{ margin: "10px 0", color: "#666" }}>
                  Reminder logic: scheduled for {scheduledReminderDate || "—"} (based on delivery + term days).
                  If missed, cron will still send once when overdue.
                </p>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={btnSecondary} disabled={acting === "extend_7"} onClick={() => extendHire(7)}>
                    {acting === "extend_7" ? "Working…" : "Extend +7 days"}
                  </button>
                  <button style={btnSecondary} disabled={acting === "extend_14"} onClick={() => extendHire(14)}>
                    {acting === "extend_14" ? "Working…" : "Extend +14 days"}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <section style={cardStyle}>
        <h2 style={h2Style}>Photos</h2>

        <PhotoRow
          label="Delivery photo"
          url={job.delivery_photo_url}
          onClear={() => clearPhoto("delivery_photo_url")}
          clearing={acting === "clear_delivery_photo_url"}
        />
        <PhotoRow
          label="Collection photo"
          url={job.collection_photo_url}
          onClear={() => clearPhoto("collection_photo_url")}
          clearing={acting === "clear_collection_photo_url"}
        />
        <PhotoRow
          label="Tip return (full skip)"
          url={job.swap_full_photo_url}
          onClear={() => clearPhoto("swap_full_photo_url")}
          clearing={acting === "clear_swap_full_photo_url"}
        />
        <PhotoRow
          label="Tip return (empty skip)"
          url={job.swap_empty_photo_url}
          onClear={() => clearPhoto("swap_empty_photo_url")}
          clearing={acting === "clear_swap_empty_photo_url"}
        />
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Actions</h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {canMarkDelivered && (
            <button style={btnPrimary} disabled={acting === "delivered"} onClick={() => runAction("delivered")}>
              {acting === "delivered" ? "Working…" : "Mark Delivered"}
            </button>
          )}

          {canUndoDelivered && (
            <button style={btnDanger} disabled={acting === "undo_delivered"} onClick={() => runAction("undo_delivered")}>
              {acting === "undo_delivered" ? "Working…" : "Undo Delivered"}
            </button>
          )}

          {canRequestCollection && (
            <button
              style={btnSecondary}
              disabled={acting === "customer_requested_collection"}
              onClick={() => runAction("customer_requested_collection")}
            >
              {acting === "customer_requested_collection" ? "Working…" : "Customer Requested Collection"}
            </button>
          )}

          {canMarkCollected && (
            <button style={btnPrimary} disabled={acting === "collected"} onClick={() => runAction("collected")}>
              {acting === "collected" ? "Working…" : "Mark Collected"}
            </button>
          )}

          {canUndoCollected && (
            <button style={btnDanger} disabled={acting === "undo_collected"} onClick={() => runAction("undo_collected")}>
              {acting === "undo_collected" ? "Working…" : "Undo Collected"}
            </button>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <h3 style={h3Style}>Add note</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type a note (e.g. 'Customer asked to move skip left 1m')"
              style={{ ...inputStyle, minWidth: 340 }}
            />
            <button style={btnSecondary} disabled={acting === "note"} onClick={addNote}>
              {acting === "note" ? "Saving…" : "Add note"}
            </button>
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Edit details</h2>
        <div style={gridForm}>
          <label style={labelStyle}>
            Site name
            <input value={siteName} onChange={(e) => setSiteName(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Site postcode
            <input value={sitePostcode} onChange={(e) => setSitePostcode(e.target.value)} style={inputStyle} />
          </label>
        </div>
      </section>
    </main>
  );
}

function PhotoRow({ label, url, onClear, clearing }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "8px 0",
        borderTop: "1px solid #f0f0f0",
      }}
    >
      <div style={{ minWidth: 180, fontWeight: 800 }}>{label}</div>

      {url ? (
        <>
          <a href={url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", fontSize: 13 }}>
            Download / open
          </a>
          <button onClick={onClear} disabled={clearing} style={btnDangerSmall}>
            {clearing ? "Clearing…" : "Clear"}
          </button>
          <div style={{ fontSize: 12, color: "#777", wordBreak: "break-all" }}>{url}</div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "#777" }}>None</div>
      )}
    </div>
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

const linkStyle = { textDecoration: "underline", color: "#0070f3", fontSize: 13 };

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const grid2 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 14,
  marginBottom: 14,
};

const h2Style = { fontSize: 16, margin: "0 0 10px" };
const h3Style = { fontSize: 13, margin: "0 0 8px", color: "#333" };

const kvGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const kv = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: 10,
  border: "1px solid #f0f0f0",
  borderRadius: 10,
  background: "#fafafa",
};

const k = { fontSize: 12, color: "#666" };
const v = { fontSize: 13, color: "#111", fontWeight: 600 };

const gridForm = {
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

const btnDanger = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#8a1f1f",
  cursor: "pointer",
  fontSize: 13,
};

const btnDangerSmall = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#8a1f1f",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};
