// pages/app/jobs/book-swap.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";
import { getSkipPricesForPostcode } from "../../../lib/getSkipPricesForPostcode";

function ymdTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtCustomer(c) {
  if (!c) return "—";
  const base = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  if (c.company_name) return `${c.company_name}${base ? ` – ${base}` : ""}`;
  return base || "—";
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

export default function BookSwapPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [eligibleJobs, setEligibleJobs] = useState([]);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form state
  const [oldJobId, setOldJobId] = useState("");
  const [swapDate, setSwapDate] = useState(() => ymdTodayLocal());
  const [sitePostcode, setSitePostcode] = useState("");

  // Postcode → skip + price
  const [postcodeSkips, setPostcodeSkips] = useState([]);
  const [postcodeMsg, setPostcodeMsg] = useState("");
  const [lookingUpPostcode, setLookingUpPostcode] = useState(false);

  const [newSkipTypeId, setNewSkipTypeId] = useState("");
  const [priceIncVat, setPriceIncVat] = useState("");

  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);

  // Invoicing (Step B): default ON
  const [createInvoice, setCreateInvoice] = useState(true);

  // Result info (so you can see green confirmation before navigating)
  const [lastNewJobId, setLastNewJobId] = useState("");
  const [lastInvoiceSummary, setLastInvoiceSummary] = useState(""); // human message

  const oldJob = useMemo(() => {
    return eligibleJobs.find((j) => String(j.id) === String(oldJobId)) || null;
  }, [eligibleJobs, oldJobId]);

  const oldCustomer = useMemo(() => {
    if (!oldJob?.customer_id) return null;
    return customers.find((c) => String(c.id) === String(oldJob.customer_id)) || null;
  }, [customers, oldJob]);

  async function loadData() {
    if (checking) return;
    if (!subscriberId) return;

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setLastNewJobId("");
    setLastInvoiceSummary("");

    // Customers (for labels)
    const { data: customerData, error: cErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, company_name")
      .eq("subscriber_id", subscriberId)
      .order("company_name", { ascending: true });

    if (cErr) {
      console.error("Customers load error:", cErr);
      setErrorMsg("Could not load customers.");
      setLoading(false);
      return;
    }
    setCustomers(customerData || []);

    // Eligible “on site” jobs:
    // delivered/awaiting_collection and NOT collected yet
    const { data: jobRows, error: jErr } = await supabase
      .from("jobs")
      .select(
        [
          "id",
          "job_number",
          "customer_id",
          "job_status",
          "site_name",
          "site_address_line1",
          "site_address_line2",
          "site_town",
          "site_postcode",
          "skip_type_id",
          "scheduled_date",
          "delivery_actual_date",
          "collection_date",
          "collection_actual_date",
          "payment_type",
        ].join(",")
      )
      .eq("subscriber_id", subscriberId)
      .in("job_status", ["delivered", "awaiting_collection"])
      .is("collection_actual_date", null)
      .order("job_number", { ascending: false });

    if (jErr) {
      console.error("Jobs load error:", jErr);
      setErrorMsg("Could not load eligible jobs for swap.");
      setLoading(false);
      return;
    }

    setEligibleJobs(jobRows || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, subscriberId]);

  // When an old job is selected, copy its postcode + auto lookup
  useEffect(() => {
    async function auto() {
      if (!oldJob) return;

      const pc = String(oldJob.site_postcode || "").trim();
      setSitePostcode(pc);
      setPostcodeSkips([]);
      setPostcodeMsg("");
      setNewSkipTypeId("");
      setPriceIncVat("");

      if (!pc) {
        setPostcodeMsg("Selected job has no postcode. Edit the job and add one first.");
        return;
      }

      await handleLookupPostcode(pc);
    }
    auto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldJobId]);

  async function handleLookupPostcode(forcedPostcode) {
    setPostcodeMsg("");
    setErrorMsg("");
    setSuccessMsg("");

    const trimmed = String(forcedPostcode ?? sitePostcode ?? "").trim();
    if (!trimmed) {
      setPostcodeMsg("Enter a postcode first.");
      return;
    }
    if (!subscriberId) {
      setPostcodeMsg("No subscriber found.");
      return;
    }

    try {
      setLookingUpPostcode(true);
      const results = await getSkipPricesForPostcode(subscriberId, trimmed);

      if (!results || results.length === 0) {
        setPostcodeSkips([]);
        setPostcodeMsg("We don't serve this postcode or no prices are set.");
        setNewSkipTypeId("");
        setPriceIncVat("");
        return;
      }

      setPostcodeSkips(results);
      setPostcodeMsg(`Found ${results.length} skip type(s) for this postcode.`);
    } catch (err) {
      console.error("handleLookupPostcode error:", err);
      setPostcodeMsg("Error looking up skips for this postcode.");
    } finally {
      setLookingUpPostcode(false);
    }
  }

  function onPickNewSkipType(id) {
    setNewSkipTypeId(id);

    const chosen = (postcodeSkips || []).find((s) => String(s.skip_type_id) === String(id));
    if (chosen?.price_inc_vat != null) setPriceIncVat(String(chosen.price_inc_vat));
    else setPriceIncVat("");
  }

  async function submitSwap(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLastNewJobId("");
    setLastInvoiceSummary("");

    if (!subscriberId) return setErrorMsg("No subscriber found.");
    if (!oldJobId) return setErrorMsg("Pick the existing job (the skip that is currently on site).");
    if (!swapDate) return setErrorMsg("Pick a swap date.");
    if (!newSkipTypeId) return setErrorMsg("Pick the new skip type to deliver.");
    const priceNum = Number(priceIncVat);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return setErrorMsg("Price must be a positive number.");

    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setSaving(false);
        setErrorMsg("You must be signed in via /login to book a swap.");
        return;
      }

      const res = await fetch("/api/jobs/book-swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          subscriber_id: subscriberId,
          old_job_id: oldJobId,
          new_skip_type_id: newSkipTypeId,
          swap_date: swapDate,
          price_inc_vat: priceNum,
          notes: notes || null,
          create_invoice: !!createInvoice,
          // payment_type omitted on purpose (API will default to old job payment_type)
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Swap booking failed");
      }

      const newId = json?.new_job?.id ? String(json.new_job.id) : "";
      if (newId) setLastNewJobId(newId);

      // Invoice result messaging
      if (!createInvoice) {
        setLastInvoiceSummary("Invoice: not created (toggle off).");
      } else if (json?.invoice?.json?.ok) {
        const invJson = json.invoice.json;
        const invNo = invJson?.invoiceNumber || invJson?.invoice_number || null;
        const mode = invJson?.mode || "";
        setLastInvoiceSummary(
          `Invoice: created${invNo ? ` (${invNo})` : ""}${mode ? ` — ${mode}` : ""}.`
        );
      } else if (json?.invoice_warning) {
        setLastInvoiceSummary(`Invoice: not created — ${String(json.invoice_warning)}`);
      } else if (json?.invoice && json?.invoice?.status) {
        setLastInvoiceSummary(`Invoice: failed (HTTP ${json.invoice.status}).`);
      } else {
        setLastInvoiceSummary("Invoice: not created (unknown reason).");
      }

      setSuccessMsg("Swap booked. Collection + new delivery created.");

      // Leave you on this page so you SEE the green + invoice summary.
      // Provide a button/link to open the new job instead of auto-redirect.
    } catch (err) {
      console.error(err);
      setErrorMsg(err?.message || "Swap booking failed");
    } finally {
      setSaving(false);
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
        <h1>Book a swap</h1>
        <p>You must be signed in.</p>
        <button onClick={() => router.push("/login")} style={btnSecondary}>
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={{ margin: 0 }}>Book a swap</h1>
          <p style={{ marginTop: 6, color: "#555" }}>
            Pick the job that has a skip on site, choose the new skip type, and book a same-day (or future) swap.
          </p>
          <p style={{ marginTop: 8 }}>
            <a href="/app/jobs" style={{ textDecoration: "underline" }}>
              ← Back to jobs
            </a>
          </p>
        </div>
        <div style={{ fontSize: 13, color: "#555" }}>{user.email}</div>
      </header>

      {(authError || errorMsg || successMsg || lastInvoiceSummary) && (
        <div style={{ marginBottom: 14 }}>
          {(authError || errorMsg) ? <div style={alertError}>{authError || errorMsg}</div> : null}
          {successMsg ? (
            <div style={alertOk}>
              <div>{successMsg}</div>
              {lastInvoiceSummary ? <div style={{ marginTop: 6 }}>{lastInvoiceSummary}</div> : null}
              {lastNewJobId ? (
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => router.push(`/app/jobs/${lastNewJobId}`)}
                    style={btnPrimary}
                  >
                    View new job →
                  </button>
                  <button
                    type="button"
                    onClick={() => loadData()}
                    style={btnSecondary}
                  >
                    Refresh eligible jobs
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <section style={card}>
        <form onSubmit={submitSwap} style={{ display: "grid", gap: 14, maxWidth: 760 }}>
          {/* Step 1 */}
          <div style={stepBox}>
            <div style={stepTitle}>Step 1 — Choose the existing job (skip currently on site)</div>
            <select
              value={oldJobId}
              onChange={(e) => setOldJobId(e.target.value)}
              style={input}
            >
              <option value="">Select a delivered job…</option>
              {eligibleJobs.map((j) => {
                const cust = customers.find((c) => String(c.id) === String(j.customer_id));
                const label = `${j.job_number || j.id} — ${fmtCustomer(cust)} — ${j.site_postcode || "no postcode"}`;
                return (
                  <option key={j.id} value={j.id}>
                    {label}
                  </option>
                );
              })}
            </select>

            {oldJob ? (
              <div style={{ marginTop: 10, fontSize: 13, color: "#333" }}>
                <div><b>Customer:</b> {fmtCustomer(oldCustomer)}</div>
                <div>
                  <b>Site:</b>{" "}
                  {[oldJob.site_name, oldJob.site_address_line1, oldJob.site_address_line2, oldJob.site_town, oldJob.site_postcode]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </div>
                <div><b>Status:</b> {oldJob.job_status || "—"}</div>
              </div>
            ) : null}
          </div>

          {/* Step 2 */}
          <div style={stepBox}>
            <div style={stepTitle}>Step 2 — Swap date (defaults to today)</div>
            <input type="date" value={swapDate} onChange={(e) => setSwapDate(e.target.value)} style={input} />
          </div>

          {/* Step 3 */}
          <div style={stepBox}>
            <div style={stepTitle}>Step 3 — New skip type + price (postcode pricing)</div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={sitePostcode}
                onChange={(e) => setSitePostcode(e.target.value)}
                placeholder="Postcode"
                style={{ ...input, flex: 1, minWidth: 220 }}
              />
              <button
                type="button"
                onClick={() => handleLookupPostcode()}
                disabled={lookingUpPostcode}
                style={btnPrimary}
              >
                {lookingUpPostcode ? "Looking up…" : "Find skips"}
              </button>
            </div>

            {postcodeMsg ? <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>{postcodeMsg}</div> : null}

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <label style={label}>
                New skip type *
                <select
                  value={newSkipTypeId}
                  onChange={(e) => onPickNewSkipType(e.target.value)}
                  disabled={!postcodeSkips.length}
                  style={input}
                >
                  <option value="">{postcodeSkips.length ? "Select skip type" : "Lookup postcode first"}</option>
                  {postcodeSkips.map((s) => (
                    <option key={s.skip_type_id} value={s.skip_type_id}>
                      {s.skip_type_name} — £{s.price_inc_vat != null ? money(s.price_inc_vat) : "N/A"}
                    </option>
                  ))}
                </select>
              </label>

              <label style={label}>
                Price inc VAT (£) *
                <input
                  type="number"
                  step="0.01"
                  value={priceIncVat}
                  onChange={(e) => setPriceIncVat(e.target.value)}
                  style={{ ...input, textAlign: "right", width: 200 }}
                />
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  Auto-filled from postcode table. Override only if needed.
                </div>
              </label>
            </div>
          </div>

          {/* Invoicing */}
          <div style={stepBox}>
            <div style={stepTitle}>Invoicing</div>
            <label style={{ display: "inline-flex", gap: 10, alignItems: "center", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={!!createInvoice}
                onChange={(e) => setCreateInvoice(e.target.checked)}
              />
              Create invoice in Xero (default ON)
            </label>
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              If ON: the new delivery job will be invoiced immediately using your subscriber invoicing settings.
            </div>
          </div>

          {/* Notes */}
          <div style={stepBox}>
            <div style={stepTitle}>Notes (optional)</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...input, resize: "vertical" }}
              placeholder="e.g. Swap requested — customer wants mini instead of builder"
            />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" disabled={saving} style={saving ? btnDisabled : btnPrimary}>
              {saving ? "Booking swap…" : "Book swap"}
            </button>
            <div style={{ fontSize: 12, color: "#666" }}>
              This will: set the old job collection date + create a new delivery job linked by swap_group_id.
            </div>
          </div>
        </form>
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
  marginBottom: 14,
};

const card = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const stepBox = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
};

const stepTitle = {
  fontWeight: 900,
  marginBottom: 8,
  color: "#111",
};

const input = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ccc",
  fontSize: 14,
  background: "#fff",
  width: "100%",
};

const label = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  color: "#333",
};

const btnPrimary = {
  padding: "10px 12px",
  borderRadius: 10,
  border: 0,
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const btnSecondary = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const btnDisabled = {
  ...btnPrimary,
  opacity: 0.6,
  cursor: "default",
};

const alertError = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#8a1f1f",
  whiteSpace: "pre-wrap",
};

const alertOk = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid #bfe7c0",
  background: "#f2fff2",
  color: "#1f6b2a",
  whiteSpace: "pre-wrap",
};
