// pages/app/jobs/book-swap.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function fmtCustomer(c) {
  if (!c) return "—";
  const first = (c.first_name || "").trim();
  const last = (c.last_name || "").trim();
  const name = `${first} ${last}`.trim();
  return c.company_name ? `${c.company_name}${name ? ` – ${name}` : ""}` : name || "—";
}

function ymdTodayLocal() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekendYmd(ymd) {
  // Use UTC midnight for stable day-of-week.
  const dt = new Date(`${String(ymd || "").trim()}T00:00:00Z`);
  if (!Number.isFinite(dt.getTime())) return false;
  const day = dt.getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

async function getSkipPricesForPostcode(subscriberId, rawPostcode) {
  if (!subscriberId || !rawPostcode) throw new Error("Missing subscriber or postcode");
  const { data, error } = await supabase.rpc("get_skip_prices_for_postcode", {
    _subscriber_id: subscriberId,
    _raw_postcode: rawPostcode,
  });
  if (error) {
    console.error("RPC get_skip_prices_for_postcode error:", error);
    throw error;
  }
  return data || [];
}

export default function BookSwapPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [eligibleJobs, setEligibleJobs] = useState([]);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [selectedOldJobId, setSelectedOldJobId] = useState("");
  const [swapDate, setSwapDate] = useState(ymdTodayLocal());

  const [postcode, setPostcode] = useState("");
  const [postcodeMsg, setPostcodeMsg] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  const [priceOptions, setPriceOptions] = useState([]);
  const [newSkipTypeId, setNewSkipTypeId] = useState("");
  const [priceStr, setPriceStr] = useState("");

  const [notes, setNotes] = useState("");

  // Invoicing toggles
  const [createInvoice, setCreateInvoice] = useState(true);
  const [weekendOverride, setWeekendOverride] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [newJobId, setNewJobId] = useState("");
  const [invoiceMsg, setInvoiceMsg] = useState("");

  const selectedOldJob = useMemo(
    () => eligibleJobs.find((j) => String(j.id) === String(selectedOldJobId)) || null,
    [eligibleJobs, selectedOldJobId]
  );

  const selectedCustomer = useMemo(() => {
    const cid = selectedOldJob?.customer_id ? String(selectedOldJob.customer_id) : "";
    if (!cid) return null;
    return customers.find((c) => String(c.id) === cid) || null;
  }, [customers, selectedOldJob]);

  async function loadPageData() {
    if (checking || !subscriberId) return;

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setNewJobId("");
    setInvoiceMsg("");

    // Customers
    const { data: cust, error: custErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, company_name")
      .eq("subscriber_id", subscriberId)
      .order("company_name", { ascending: true });

    if (custErr) {
      console.error("Customers load error:", custErr);
      setErrorMsg("Could not load customers.");
      setLoading(false);
      return;
    }
    setCustomers(cust || []);

    // Eligible jobs for swap:
    // delivered / awaiting_collection, not yet collected
    const { data: jobs, error: jobsErr } = await supabase
      .from("jobs")
      .select(
        "id,job_number,customer_id,job_status,site_name,site_address_line1,site_address_line2,site_town,site_postcode,skip_type_id,scheduled_date,delivery_actual_date,collection_date,collection_actual_date,payment_type"
      )
      .eq("subscriber_id", subscriberId)
      .in("job_status", ["delivered", "awaiting_collection"])
      .is("collection_actual_date", null)
      .order("job_number", { ascending: false });

    if (jobsErr) {
      console.error("Jobs load error:", jobsErr);
      setErrorMsg("Could not load eligible jobs for swap.");
      setLoading(false);
      return;
    }

    setEligibleJobs(jobs || []);
    setLoading(false);
  }

  useEffect(() => {
    loadPageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, subscriberId]);

  // When old job changes: auto-fill postcode and lookup prices
  useEffect(() => {
    (async () => {
      if (!selectedOldJob) return;

      const pc = String(selectedOldJob.site_postcode || "").trim();
      setPostcode(pc);
      setPriceOptions([]);
      setPostcodeMsg("");
      setNewSkipTypeId("");
      setPriceStr("");

      if (!pc) {
        setPostcodeMsg("Selected job has no postcode. Edit the job and add one first.");
        return;
      }
      await handleLookupPostcode(pc);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOldJobId]);

  async function handleLookupPostcode(forcedPostcode) {
    setPostcodeMsg("");
    setErrorMsg("");
    setSuccessMsg("");
    setNewJobId("");
    setInvoiceMsg("");

    const raw = String(forcedPostcode != null ? forcedPostcode : postcode).trim();
    if (!raw) {
      setPostcodeMsg("Enter a postcode first.");
      return;
    }
    if (!subscriberId) {
      setPostcodeMsg("No subscriber found.");
      return;
    }

    try {
      setLookingUp(true);
      const rows = await getSkipPricesForPostcode(subscriberId, raw);

      if (!rows || rows.length === 0) {
        setPriceOptions([]);
        setPostcodeMsg("We don't serve this postcode or no prices are set.");
        setNewSkipTypeId("");
        setPriceStr("");
        return;
      }

      setPriceOptions(rows);
      setPostcodeMsg(`Found ${rows.length} skip type(s) for this postcode.`);
    } catch (e) {
      console.error("handleLookupPostcode error:", e);
      setPostcodeMsg("Error looking up skips for this postcode.");
    } finally {
      setLookingUp(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setNewJobId("");
    setInvoiceMsg("");

    if (!subscriberId) {
      setErrorMsg("No subscriber found.");
      return;
    }
    if (!selectedOldJobId) {
      setErrorMsg("Pick the existing job (the skip that is currently on site).");
      return;
    }
    if (!swapDate) {
      setErrorMsg("Pick a swap date.");
      return;
    }
    if (!newSkipTypeId) {
      setErrorMsg("Pick the new skip type to deliver.");
      return;
    }

    const price = Number(priceStr);
    if (!Number.isFinite(price) || price <= 0) {
      setErrorMsg("Price must be a positive number.");
      return;
    }

    // UI hint (API enforces too)
    if (isWeekendYmd(swapDate) && !weekendOverride) {
      setErrorMsg("Swap date is a weekend. Tick Weekend override to allow weekend booking.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setErrorMsg("You must be signed in via /login to book a swap.");
        return;
      }

      const resp = await fetch("/api/jobs/book-swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          subscriber_id: subscriberId,
          old_job_id: selectedOldJobId,
          new_skip_type_id: newSkipTypeId,
          swap_date: swapDate,
          price_inc_vat: price,
          notes: notes || null,
          create_invoice: !!createInvoice,
          weekend_override: !!weekendOverride,
        }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) throw new Error(json?.error || "Swap booking failed");

      const jid = json?.new_job?.id ? String(json.new_job.id) : "";
      if (jid) setNewJobId(jid);

      if (createInvoice) {
        const invOk = json?.invoice?.json?.ok;
        if (invOk) {
          const inv = json.invoice.json || {};
          const invNo = inv.invoiceNumber || inv.invoice_number || null;
          const mode = inv.mode || "";
          setInvoiceMsg(`Invoice: created${invNo ? ` (${invNo})` : ""}${mode ? ` — ${mode}` : ""}.`);
        } else if (json?.invoice_warning) {
          setInvoiceMsg(`Invoice: not created — ${String(json.invoice_warning)}`);
        } else if (json?.invoice?.status) {
          setInvoiceMsg(`Invoice: failed (HTTP ${json.invoice.status}).`);
        } else {
          setInvoiceMsg("Invoice: not created (unknown reason).");
        }
      } else {
        setInvoiceMsg("Invoice: not created (toggle off).");
      }

      setSuccessMsg("Swap booked. Collection + new delivery created.");
    } catch (err) {
      console.error(err);
      setErrorMsg(err?.message || "Swap booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking || loading) {
    return (
      <main style={styles.loadingWrap}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={styles.page}>
        <h1>Book a swap</h1>
        <p>You must be signed in.</p>
        <button onClick={() => router.push("/login")} style={styles.btnSecondary}>
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
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
          {authError ? (
            <p style={{ marginTop: 8, color: "#8a1f1f", fontWeight: 700 }}>{String(authError)}</p>
          ) : null}
        </div>
        <div style={{ fontSize: 13, color: "#555" }}>{user.email}</div>
      </header>

      {(errorMsg || successMsg || invoiceMsg) && (
        <div style={{ marginBottom: 14 }}>
          {errorMsg ? <div style={styles.alertError}>{errorMsg}</div> : null}
          {successMsg ? (
            <div style={styles.alertSuccess}>
              <div>{successMsg}</div>
              {invoiceMsg ? <div style={{ marginTop: 6 }}>{invoiceMsg}</div> : null}
              {newJobId ? (
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => router.push(`/app/jobs/${newJobId}`)} style={styles.btnPrimary}>
                    View new job →
                  </button>
                  <button type="button" onClick={() => loadPageData()} style={styles.btnSecondary}>
                    Refresh eligible jobs
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <section style={styles.card}>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14, maxWidth: 760 }}>
          <div style={styles.panel}>
            <div style={styles.panelTitle}>Step 1 — Choose the existing job (skip currently on site)</div>
            <select value={selectedOldJobId} onChange={(e) => setSelectedOldJobId(e.target.value)} style={styles.input}>
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

            {selectedOldJob ? (
              <div style={{ marginTop: 10, fontSize: 13, color: "#333" }}>
                <div>
                  <b>Customer:</b> {fmtCustomer(selectedCustomer)}
                </div>
                <div>
                  <b>Site:</b>{" "}
                  {[
                    selectedOldJob.site_name,
                    selectedOldJob.site_address_line1,
                    selectedOldJob.site_address_line2,
                    selectedOldJob.site_town,
                    selectedOldJob.site_postcode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </div>
                <div>
                  <b>Status:</b> {selectedOldJob.job_status || "—"}
                </div>
              </div>
            ) : null}
          </div>

          <div style={styles.panel}>
            <div style={styles.panelTitle}>Step 2 — Swap date (defaults to today)</div>
            <input type="date" value={swapDate} onChange={(e) => setSwapDate(e.target.value)} style={styles.input} />
            {swapDate && isWeekendYmd(swapDate) ? (
              <div style={{ marginTop: 8, fontSize: 12, color: "#8a1f1f" }}>
                This date is a weekend. You must tick Weekend override to book it.
              </div>
            ) : null}
          </div>

          <div style={styles.panel}>
            <div style={styles.panelTitle}>Step 3 — New skip type + price (postcode pricing)</div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Postcode"
                style={{ ...styles.input, flex: 1, minWidth: 220 }}
              />
              <button type="button" onClick={() => handleLookupPostcode()} disabled={lookingUp} style={styles.btnPrimary}>
                {lookingUp ? "Looking up…" : "Find skips"}
              </button>
            </div>

            {postcodeMsg ? <div style={{ marginTop: 6, fontSize: 13, color: "#555" }}>{postcodeMsg}</div> : null}

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <label style={styles.label}>
                New skip type *
                <select
                  value={newSkipTypeId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewSkipTypeId(val);
                    const row = (priceOptions || []).find((r) => String(r.skip_type_id) === String(val));
                    if (row?.price_inc_vat != null) setPriceStr(String(row.price_inc_vat));
                    else setPriceStr("");
                  }}
                  disabled={!priceOptions.length}
                  style={styles.input}
                >
                  <option value="">{priceOptions.length ? "Select skip type" : "Lookup postcode first"}</option>
                  {priceOptions.map((r) => (
                    <option key={r.skip_type_id} value={r.skip_type_id}>
                      {r.skip_type_name} — £{Number(r.price_inc_vat).toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={styles.label}>
                Price inc VAT (£) *
                <input
                  type="number"
                  step="0.01"
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  style={{ ...styles.input, textAlign: "right", width: 200 }}
                />
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  Auto-filled from postcode table. Override only if needed.
                </div>
              </label>
            </div>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelTitle}>Invoicing</div>

            <label style={{ display: "inline-flex", gap: 10, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={!!createInvoice} onChange={(e) => setCreateInvoice(e.target.checked)} />
              Create invoice in Xero (default ON)
            </label>

            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              If ON: the new delivery job will be invoiced immediately using your subscriber invoicing settings.
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: "inline-flex", gap: 10, alignItems: "center", fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={!!weekendOverride}
                  onChange={(e) => setWeekendOverride(e.target.checked)}
                />
                Weekend override (default OFF)
              </label>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                Only tick this if you are intentionally booking work on a Saturday/Sunday.
              </div>
            </div>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelTitle}>Notes (optional)</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...styles.input, resize: "vertical" }}
              placeholder="e.g. Swap requested — customer wants mini instead of builder"
            />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" disabled={submitting} style={submitting ? styles.btnPrimaryDisabled : styles.btnPrimary}>
              {submitting ? "Booking swap…" : "Book swap"}
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

const styles = {
  page: {
    minHeight: "100vh",
    padding: 24,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "#f7f7f7",
  },
  loadingWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 14,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },
  panel: {
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 12,
    background: "#fafafa",
  },
  panelTitle: {
    fontWeight: 900,
    marginBottom: 8,
    color: "#111",
  },
  input: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ccc",
    fontSize: 14,
    background: "#fff",
    width: "100%",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    color: "#333",
  },
  btnPrimary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: 0,
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  btnPrimaryDisabled: {
    padding: "10px 12px",
    borderRadius: 10,
    border: 0,
    background: "#111",
    color: "#fff",
    cursor: "default",
    fontWeight: 900,
    whiteSpace: "nowrap",
    opacity: 0.6,
  },
  btnSecondary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  },
  alertError: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #f0b4b4",
    background: "#fff5f5",
    color: "#8a1f1f",
    whiteSpace: "pre-wrap",
  },
  alertSuccess: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #bfe7c0",
    background: "#f2fff2",
    color: "#1f6b2a",
    whiteSpace: "pre-wrap",
  },
};
