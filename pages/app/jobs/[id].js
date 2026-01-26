// pages/app/jobs/[id].js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";
import { getSkipPricesForPostcode } from "../../../lib/getSkipPricesForPostcode";

function fmtDate(d) {
  return d ? String(d) : "—";
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

  // swap linking info
  const [swapParent, setSwapParent] = useState(null);
  const [swapChild, setSwapChild] = useState(null);

  // term-hire reminder log rows for this job
  const [reminderLogs, setReminderLogs] = useState([]);

  // editable fields
  const [siteName, setSiteName] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [plannedDelivery, setPlannedDelivery] = useState("");
  const [plannedCollection, setPlannedCollection] = useState("");
  const [noteText, setNoteText] = useState("");

  // ---- Swap booking modal state ----
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapDate, setSwapDate] = useState("");
  const [swapPostcode, setSwapPostcode] = useState("");
  const [swapSkips, setSwapSkips] = useState([]);
  const [swapMsg, setSwapMsg] = useState("");
  const [lookingUpSwapPostcode, setLookingUpSwapPostcode] = useState(false);
  const [swapSkipTypeId, setSwapSkipTypeId] = useState("");
  const [swapPrice, setSwapPrice] = useState("");
  const [swapNotes, setSwapNotes] = useState("");
  const [bookingSwap, setBookingSwap] = useState(false);

  async function loadAll() {
    if (checking) return;
    if (!user || !subscriberId || !id) return;

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

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
        price_inc_vat,
        skip_type_id,
        swap_parent_job_id,
        created_at
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

    // swap linking lookups
    let parent = null;
    let child = null;

    if (j.swap_parent_job_id) {
      const { data: p } = await supabase
        .from("jobs")
        .select("id, job_number, job_status, scheduled_date, collection_date")
        .eq("subscriber_id", subscriberId)
        .eq("id", j.swap_parent_job_id)
        .maybeSingle();
      parent = p || null;
    } else {
      // see if this job is the parent of a swap-delivery job
      const { data: ch } = await supabase
        .from("jobs")
        .select("id, job_number, job_status, scheduled_date, collection_date")
        .eq("subscriber_id", subscriberId)
        .eq("swap_parent_job_id", j.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      child = ch || null;
    }

    setJob(j);
    setCustomer(c || null);
    setSubscriberSettings(s || null);
    setReminderLogs(Array.isArray(logs) ? logs : []);
    setSwapParent(parent);
    setSwapChild(child);

    setSiteName(j.site_name || "");
    setSitePostcode(j.site_postcode || "");
    setPlannedDelivery(j.scheduled_date || "");
    setPlannedCollection(j.collection_date || "");

    // default swap postcode to job postcode
    setSwapPostcode((j.site_postcode || "").trim());
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

    if (reminderLogMatch) return { label: `Sent (for ${scheduledReminderDate})`, tone: "good" };

    const diff = daysBetween(todayYMDUTC(), scheduledReminderDate);
    if (diff == null) return { label: "—", tone: "muted" };
    if (diff > 0) return { label: `Due in ${diff} day(s)`, tone: "muted" };
    if (diff === 0) return { label: "Due today", tone: "warn" };
    return { label: `Overdue by ${Math.abs(diff)} day(s)`, tone: "bad" };
  }, [termHireDays, deliveryAnchor, scheduledReminderDate, reminderLogMatch]);

  // Status helpers
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

  // ---- Swap booking helpers ----
  async function lookupSwapPostcode() {
    setSwapMsg("");
    setErrorMsg("");

    const trimmed = String(swapPostcode || "").trim();
    if (!trimmed) {
      setSwapMsg("Enter a postcode first.");
      return;
    }
    if (!subscriberId) {
      setSwapMsg("No subscriber found.");
      return;
    }

    try {
      setLookingUpSwapPostcode(true);
      const results = await getSkipPricesForPostcode(subscriberId, trimmed);

      if (!results || results.length === 0) {
        setSwapSkips([]);
        setSwapMsg("We don't serve this postcode or no prices are set.");
        setSwapSkipTypeId("");
        setSwapPrice("");
        return;
      }

      setSwapSkips(results);
      setSwapMsg(`Found ${results.length} skip type(s) for this postcode.`);

      // keep current selection if still valid, else clear
      if (swapSkipTypeId && !results.some((r) => r.skip_type_id === swapSkipTypeId)) {
        setSwapSkipTypeId("");
        setSwapPrice("");
      }
    } catch (err) {
      console.error("lookupSwapPostcode error:", err);
      setSwapMsg("Error looking up skips for this postcode.");
    } finally {
      setLookingUpSwapPostcode(false);
    }
  }

  function openSwapModal() {
    setErrorMsg("");
    setSuccessMsg("");
    setSwapMsg("");
    setSwapSkips([]);
    setSwapSkipTypeId("");
    setSwapPrice("");
    setSwapNotes("");
    setSwapDate(""); // force user to pick date
    setSwapPostcode(String(job?.site_postcode || "").trim());
    setShowSwapModal(true);
  }

  async function confirmBookSwap() {
    if (!job?.id) return;
    if (!subscriberId) return;

    const sd = String(swapDate || "").trim();
    if (!sd) {
      setErrorMsg("Pick a swap date.");
      return;
    }

    const stid = String(swapSkipTypeId || "").trim();
    if (!stid) {
      setErrorMsg("Select a skip type for the swap delivery.");
      return;
    }

    const priceNum = Number(swapPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setErrorMsg("Swap delivery price must be a positive number.");
      return;
    }

    setBookingSwap(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const { data: childId, error } = await supabase.rpc("book_swap", {
        _subscriber_id: subscriberId,
        _parent_job_id: job.id,
        _swap_date: sd,
        _new_skip_type_id: stid,
        _price_inc_vat: priceNum,
        _notes: swapNotes ? String(swapNotes) : null,
      });

      if (error) {
        console.error("book_swap error:", error);
        setErrorMsg(error.message || "Could not book swap.");
        setBookingSwap(false);
        return;
      }

      setShowSwapModal(false);
      setBookingSwap(false);

      // refresh current job + show success + take you to the new job
      setSuccessMsg("Swap booked. New swap-delivery job created.");
      await loadAll();

      if (childId) {
        router.push(`/app/jobs/${childId}`);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("Could not book swap (unexpected error).");
      setBookingSwap(false);
    }
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

  const hasSwapLink = !!(job?.swap_parent_job_id || swapChild);

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

          {job?.job_status === "delivered" && (
            <button onClick={openSwapModal} style={btnSecondary}>
              Book swap
            </button>
          )}
        </div>
      </header>

      {(authError || errorMsg || successMsg) && (
        <div style={{ marginBottom: 14 }}>
          {authError || errorMsg ? <p style={{ color: "red", margin: 0 }}>{authError || errorMsg}</p> : null}
          {successMsg ? <p style={{ color: "green", margin: 0 }}>{successMsg}</p> : null}
        </div>
      )}

      {hasSwapLink && (
        <section style={{ ...cardStyle, borderColor: "#cfe8ff", background: "#f2f8ff" }}>
          <h2 style={{ ...h2Style, marginBottom: 8 }}>Swap link</h2>

          {job.swap_parent_job_id ? (
            <div style={{ fontSize: 13, color: "#333" }}>
              <div style={{ marginBottom: 6 }}>
                This job is the <b>swap delivery</b> linked to a parent job:
              </div>
              {swapParent ? (
                <div>
                  Parent:{" "}
                  <a href={`/app/jobs/${swapParent.id}`} style={{ textDecoration: "underline" }}>
                    {swapParent.job_number || swapParent.id}
                  </a>{" "}
                  ({swapParent.job_status})
                </div>
              ) : (
                <div>Parent: {job.swap_parent_job_id}</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#333" }}>
              <div style={{ marginBottom: 6 }}>
                This job is the <b>swap collection</b> parent. Swap delivery job:
              </div>
              {swapChild ? (
                <div>
                  Child:{" "}
                  <a href={`/app/jobs/${swapChild.id}`} style={{ textDecoration: "underline" }}>
                    {swapChild.job_number || swapChild.id}
                  </a>{" "}
                  ({swapChild.job_status})
                </div>
              ) : (
                <div>No child swap delivery job found.</div>
              )}
            </div>
          )}
        </section>
      )}

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

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
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

      {/* Swap modal */}
      {showSwapModal && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Book swap</h2>
              <button
                onClick={() => (!bookingSwap ? setShowSwapModal(false) : null)}
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "#666" }}
                title="Close"
              >
                ✕
              </button>
            </div>

            <p style={{ marginTop: 8, marginBottom: 10, color: "#555", fontSize: 13 }}>
              This will: (1) set this job to <b>awaiting_swap_collection</b> for the swap date, and
              (2) create a new <b>swap_delivery</b> job linked to it.
            </p>

            <div style={gridForm}>
              <label style={labelStyle}>
                Swap date *
                <input type="date" value={swapDate} onChange={(e) => setSwapDate(e.target.value)} style={inputStyle} />
              </label>

              <label style={labelStyle}>
                Postcode (pricing lookup) *
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={swapPostcode}
                    onChange={(e) => setSwapPostcode(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="CFxx xxx"
                  />
                  <button
                    type="button"
                    onClick={lookupSwapPostcode}
                    disabled={lookingUpSwapPostcode}
                    style={{
                      ...btnSecondary,
                      padding: "8px 10px",
                      opacity: lookingUpSwapPostcode ? 0.6 : 1,
                    }}
                  >
                    {lookingUpSwapPostcode ? "Looking…" : "Find skips"}
                  </button>
                </div>
                {swapMsg ? <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>{swapMsg}</div> : null}
              </label>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={labelStyle}>
                Swap delivery skip type *
                <select
                  value={swapSkipTypeId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSwapSkipTypeId(newId);

                    const chosen = (swapSkips || []).find((s) => s.skip_type_id === newId);
                    if (chosen) {
                      setSwapPrice(chosen.price_inc_vat != null ? String(chosen.price_inc_vat) : "");
                    } else {
                      setSwapPrice("");
                    }
                  }}
                  disabled={!swapSkips || swapSkips.length === 0}
                  style={inputStyle}
                >
                  <option value="">
                    {!swapSkips || swapSkips.length === 0 ? "Look up postcode first" : "Select skip type"}
                  </option>
                  {(swapSkips || []).map((s) => (
                    <option key={s.skip_type_id} value={s.skip_type_id}>
                      {s.skip_type_name} – £{s.price_inc_vat != null ? Number(s.price_inc_vat).toFixed(2) : "N/A"}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ ...labelStyle, marginTop: 10 }}>
                Swap delivery price (£) *
                <input
                  type="number"
                  step="0.01"
                  value={swapPrice}
                  onChange={(e) => setSwapPrice(e.target.value)}
                  style={{ ...inputStyle, maxWidth: 220 }}
                />
                <div style={{ fontSize: 12, color: "#666" }}>Auto-filled from postcode table. Override if needed.</div>
              </label>

              <label style={{ ...labelStyle, marginTop: 10 }}>
                Notes (optional)
                <input
                  value={swapNotes}
                  onChange={(e) => setSwapNotes(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. Swap builders → builders (customer full)"
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button
                onClick={() => (!bookingSwap ? setShowSwapModal(false) : null)}
                style={btnSecondary}
                disabled={bookingSwap}
              >
                Cancel
              </button>
              <button onClick={confirmBookSwap} style={btnPrimary} disabled={bookingSwap}>
                {bookingSwap ? "Booking…" : "Confirm swap"}
              </button>
            </div>
          </div>
        </div>
      )}
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

const modalBackdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 2000,
};

const modalCard = {
  width: "100%",
  maxWidth: 720,
  background: "#fff",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};
