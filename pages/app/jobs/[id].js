import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

function asText(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asId(v) {
  return v == null ? "" : String(v);
}

function asDateInput(v) {
  const t = asText(v).trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function customerDisplay(job) {
  const company = asText(job?.company_name).trim();
  const first = asText(job?.first_name).trim();
  const last = asText(job?.last_name).trim();
  const person = `${first} ${last}`.trim();

  if (company && person) return `${company} – ${person}`;
  if (company) return company;
  if (person) return person;
  return "Unknown customer";
}

function personDisplay(job) {
  const first = asText(job?.first_name).trim();
  const last = asText(job?.last_name).trim();
  return `${first} ${last}`.trim();
}

function companyDisplay(job) {
  return asText(job?.company_name).trim();
}

function skipTypeDisplay(job, skipTypes) {
  const direct = asText(job?.name).trim();
  if (direct) return direct;

  const id = asId(job?.skip_type_id);
  if (!id) return "";

  const match = (Array.isArray(skipTypes) ? skipTypes : []).find(
    (s) => asId(s?.id) === id
  );

  return asText(match?.name).trim();
}

function formatMoney(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return asText(v);
  return n.toFixed(2);
}

export default function EditJobPage() {
  const router = useRouter();
  const rawId = router.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const [job, setJob] = useState(null);
  const [lookups, setLookups] = useState({
    skip_types: [],
    permit_settings: [],
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [skipTypeId, setSkipTypeId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [collectionDate, setCollectionDate] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");

  const [siteName, setSiteName] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteTown, setSiteTown] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");

  const [paymentType, setPaymentType] = useState("card");
  const [placementType, setPlacementType] = useState("private");
  const [selectedPermitId, setSelectedPermitId] = useState("");
  const [permitPriceNoVat, setPermitPriceNoVat] = useState("");
  const [permitDelayBusinessDays, setPermitDelayBusinessDays] = useState("");
  const [permitValidityDays, setPermitValidityDays] = useState("");
  const [permitOverride, setPermitOverride] = useState(false);
  const [weekendOverride, setWeekendOverride] = useState(false);

  useEffect(() => {
    if (!id || typeof id !== "string") return;

    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      setSuccess("");

      try {
        const token = await getAccessToken();

        const res = await fetch(`/api/jobs/get?id=${encodeURIComponent(id)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load job");
        }

        if (!active) return;

        const nextJob = json?.job || null;
        const nextLookups = json?.lookups || {};

        setJob(nextJob);
        setLookups({
          skip_types: Array.isArray(nextLookups?.skip_types)
            ? nextLookups.skip_types
            : [],
          permit_settings: Array.isArray(nextLookups?.permit_settings)
            ? nextLookups.permit_settings
            : [],
        });

        setSkipTypeId(asId(nextJob?.skip_type_id));
        setScheduledDate(asDateInput(nextJob?.scheduled_date));
        setCollectionDate(asDateInput(nextJob?.collection_date));
        setPrice(
          nextJob?.price_inc_vat != null ? String(nextJob.price_inc_vat) : ""
        );
        setNotes(asText(nextJob?.notes));

        setSiteName(asText(nextJob?.site_name));
        setSiteAddress1(asText(nextJob?.site_address_line1));
        setSiteAddress2(asText(nextJob?.site_address_line2));
        setSiteTown(asText(nextJob?.site_town));
        setSitePostcode(asText(nextJob?.site_postcode));

        setPaymentType(asText(nextJob?.payment_type) || "card");
        setPlacementType(asText(nextJob?.placement_type) || "private");
        setSelectedPermitId(asId(nextJob?.permit_setting_id));
        setPermitPriceNoVat(
          nextJob?.permit_price_no_vat != null
            ? String(nextJob.permit_price_no_vat)
            : ""
        );
        setPermitDelayBusinessDays(
          nextJob?.permit_delay_business_days != null
            ? String(nextJob.permit_delay_business_days)
            : ""
        );
        setPermitValidityDays(
          nextJob?.permit_validity_days != null
            ? String(nextJob.permit_validity_days)
            : ""
        );
        setPermitOverride(!!nextJob?.permit_override);
        setWeekendOverride(!!nextJob?.weekend_override);
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Failed to load job");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [id]);

  const skipTypes = useMemo(() => {
    return Array.isArray(lookups?.skip_types) ? lookups.skip_types : [];
  }, [lookups]);

  const permitSettings = useMemo(() => {
    return Array.isArray(lookups?.permit_settings)
      ? lookups.permit_settings
      : [];
  }, [lookups]);

  const isCancelled = asText(job?.job_status).toLowerCase() === "cancelled";
  const hasInvoice = !!(job?.xero_invoice_id || job?.xero_invoice_number);
  const canEditSkipType = skipTypes.length > 0;

  const jobStatus = asText(job?.job_status).toLowerCase();
  const isDelivered = jobStatus === "delivered";
  const isCollected = jobStatus === "collected";

  const canMarkDelivered = !isCancelled && !isDelivered && !isCollected;
  const canUndoDelivered = !isCancelled && isDelivered;
  const canMarkCollected = !isCancelled && isDelivered && !isCollected;
  const canUndoCollected = !isCancelled && isCollected;

  async function handleSave() {
    if (!id) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = await getAccessToken();

      const body = {
        id,
        skip_type_id: skipTypeId || null,
        scheduled_date: scheduledDate || null,
        collection_date: collectionDate || null,
        price_inc_vat: price === "" ? null : price,
        notes,

        site_name: siteName || null,
        site_address_line1: siteAddress1 || null,
        site_address_line2: siteAddress2 || null,
        site_town: siteTown || null,
        site_postcode: sitePostcode || null,

        payment_type: paymentType || null,
        placement_type: placementType || null,

        permit_setting_id:
          placementType === "permit" ? selectedPermitId || null : null,
        permit_price_no_vat:
          placementType === "permit" ? permitPriceNoVat || null : null,
        permit_delay_business_days:
          placementType === "permit" ? permitDelayBusinessDays || null : null,
        permit_validity_days:
          placementType === "permit" ? permitValidityDays || null : null,
        permit_override: placementType === "permit" ? permitOverride : false,
        weekend_override: !!weekendOverride,
      };

      const res = await fetch("/api/jobs/update", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Update failed");
      }

      setJob((prev) => ({
        ...(prev || {}),
        ...(json?.job || {}),
        skip_type_id: body.skip_type_id,
        scheduled_date: body.scheduled_date,
        collection_date: body.collection_date,
        price_inc_vat: body.price_inc_vat,
        notes: body.notes,
        site_name: body.site_name,
        site_address_line1: body.site_address_line1,
        site_address_line2: body.site_address_line2,
        site_town: body.site_town,
        site_postcode: body.site_postcode,
        payment_type: body.payment_type,
        placement_type: body.placement_type,
        permit_setting_id: body.permit_setting_id,
        permit_price_no_vat: body.permit_price_no_vat,
        permit_delay_business_days: body.permit_delay_business_days,
        permit_validity_days: body.permit_validity_days,
        permit_override: body.permit_override,
        weekend_override: body.weekend_override,
      }));

      setSuccess(
        json?.invoice_review_flagged
          ? "Saved. Invoice now needs manual review."
          : "Saved."
      );
    } catch (err) {
      setError(err?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelJob() {
    if (!id) return;

    const reason = window.prompt("Cancellation reason:", "Cancelled via edit page");
    if (reason === null) return;

    setCancelling(true);
    setError("");
    setSuccess("");

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/jobs/cancel", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: id,
          cancellation_reason: reason || "Cancelled via edit page",
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Cancel failed");
      }

      setJob((prev) => ({
        ...(prev || {}),
        job_status: "cancelled",
        cancelled_at: json?.job?.cancelled_at || new Date().toISOString(),
        cancellation_reason: reason || "Cancelled via edit page",
      }));

      setSuccess(
        json?.invoice_review_flagged
          ? "Job cancelled. Invoice now needs manual review."
          : "Job cancelled."
      );
    } catch (err) {
      setError(err?.message || "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  async function handleStatusAction(action) {
    if (!id) return;

    setStatusUpdating(true);
    setError("");
    setSuccess("");

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/jobs/status", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: id,
          action,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Status update failed");
      }

      setJob((prev) => ({
        ...(prev || {}),
        ...(json?.job || {}),
      }));

      if (action === "mark_delivered") {
        setSuccess("Job marked delivered. No email was sent.");
      } else if (action === "undo_delivered") {
        setSuccess("Delivery undone. No email was sent.");
      } else if (action === "mark_collected") {
        setSuccess("Job marked collected. No email was sent.");
      } else if (action === "undo_collected") {
        setSuccess("Collection undone. No email was sent.");
      } else {
        setSuccess("Status updated. No email was sent.");
      }
    } catch (err) {
      setError(err?.message || "Status update failed");
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleDeleteJob() {
    if (!id) return;

    const ok = window.confirm(
      "Delete this job permanently?\n\nOnly use delete for a safe early mistake. Otherwise cancel the job."
    );
    if (!ok) return;

    setDeleting(true);
    setError("");
    setSuccess("");

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/jobs/delete", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Delete failed");
      }

      window.alert("Job deleted");
      router.push("/app/jobs");
    } catch (err) {
      setError(err?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 20 }}>Loading…</div>;
  }

  if (error && !job) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Edit job</h1>
        <div style={styles.errorBox}>{error}</div>
      </div>
    );
  }

  if (!job) {
    return <div style={{ padding: 20 }}>Job not found</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Edit Job #{job.job_number || job.id}</h1>
            <div style={styles.badgeRow}>
              <span style={styles.badge}>Status: {job.job_status || "booked"}</span>
              {hasInvoice ? (
                <span style={styles.badge}>
                  Invoice: {job.xero_invoice_number || "Linked"}
                </span>
              ) : null}
            </div>
          </div>

          <a href="/app/jobs" style={styles.backLink}>
            ← Back to jobs
          </a>
        </div>

        {hasInvoice ? (
          <div style={styles.warnBox}>
            <strong>Invoice warning:</strong> this job already has an invoice linked.
            Any commercial changes should be reviewed manually in Xero.
          </div>
        ) : null}

        <div style={styles.infoBox}>
          <strong>Status buttons:</strong> marking delivered/collected here updates the
          job state only. It does not send customer emails and does not reset email logs.
        </div>

        {isCancelled ? (
          <div style={styles.cancelledBox}>
            This job is cancelled. Editing is locked.
          </div>
        ) : null}

        {error ? <div style={styles.errorBox}>{error}</div> : null}
        {success ? <div style={styles.successBox}>{success}</div> : null}

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Customer</h3>
          <div style={styles.grid}>
            <div>
              <label style={styles.staticLabel}>Customer</label>
              <div style={styles.staticValue}>{customerDisplay(job)}</div>
            </div>
            <div>
              <label style={styles.staticLabel}>Company</label>
              <div style={styles.staticValue}>{companyDisplay(job) || "—"}</div>
            </div>
            <div>
              <label style={styles.staticLabel}>Contact</label>
              <div style={styles.staticValue}>{personDisplay(job) || "—"}</div>
            </div>
            <div>
              <label style={styles.staticLabel}>Phone</label>
              <div style={styles.staticValue}>{asText(job.phone) || "—"}</div>
            </div>
            <div>
              <label style={styles.staticLabel}>Email</label>
              <div style={styles.staticValue}>{asText(job.email) || "—"}</div>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Job details</h3>

          <div style={styles.grid}>
            <div>
              <label style={styles.label}>Skip type</label>
              {canEditSkipType ? (
                <select
                  value={skipTypeId}
                  onChange={(e) => setSkipTypeId(e.target.value)}
                  style={styles.input}
                  disabled={isCancelled}
                >
                  <option value="">Select skip type</option>
                  {skipTypes.map((s) => (
                    <option key={asId(s?.id)} value={asId(s?.id)}>
                      {asText(s?.name)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={skipTypeDisplay(job, skipTypes)}
                  style={styles.input}
                  disabled
                />
              )}
            </div>

            <div>
              <label style={styles.label}>Payment type</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                style={styles.input}
                disabled={isCancelled}
              >
                <option value="">Select payment type</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="cod">COD</option>
                <option value="account">Account</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>Placement</label>
              <select
                value={placementType}
                onChange={(e) => setPlacementType(e.target.value)}
                style={styles.input}
                disabled={isCancelled}
              >
                <option value="private">Private</option>
                <option value="permit">Permit</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>Price inc VAT</label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={styles.input}
                disabled={isCancelled}
              />
            </div>

            <div>
              <label style={styles.label}>Delivery date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                style={styles.input}
                disabled={isCancelled}
              />
            </div>

            <div>
              <label style={styles.label}>Collection date</label>
              <input
                type="date"
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                style={styles.input}
                disabled={isCancelled}
              />
            </div>
          </div>

          {placementType === "permit" ? (
            <>
              <div style={styles.grid}>
                <div>
                  <label style={styles.label}>Permit setting</label>
                  <select
                    value={selectedPermitId}
                    onChange={(e) => setSelectedPermitId(e.target.value)}
                    style={styles.input}
                    disabled={isCancelled}
                  >
                    <option value="">Select permit</option>
                    {permitSettings.map((p) => (
                      <option key={asId(p?.id)} value={asId(p?.id)}>
                        {asText(p?.name)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={styles.label}>Permit price no VAT</label>
                  <input
                    type="number"
                    step="0.01"
                    value={permitPriceNoVat}
                    onChange={(e) => setPermitPriceNoVat(e.target.value)}
                    style={styles.input}
                    disabled={isCancelled}
                  />
                </div>

                <div>
                  <label style={styles.label}>Permit delay business days</label>
                  <input
                    type="number"
                    value={permitDelayBusinessDays}
                    onChange={(e) => setPermitDelayBusinessDays(e.target.value)}
                    style={styles.input}
                    disabled={isCancelled}
                  />
                </div>

                <div>
                  <label style={styles.label}>Permit validity days</label>
                  <input
                    type="number"
                    value={permitValidityDays}
                    onChange={(e) => setPermitValidityDays(e.target.value)}
                    style={styles.input}
                    disabled={isCancelled}
                  />
                </div>
              </div>

              <div style={styles.checkRow}>
                <label style={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={permitOverride}
                    onChange={(e) => setPermitOverride(e.target.checked)}
                    disabled={isCancelled}
                  />
                  <span>Permit override</span>
                </label>

                <label style={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={weekendOverride}
                    onChange={(e) => setWeekendOverride(e.target.checked)}
                    disabled={isCancelled}
                  />
                  <span>Weekend override</span>
                </label>
              </div>
            </>
          ) : (
            <div style={styles.checkRow}>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={weekendOverride}
                  onChange={(e) => setWeekendOverride(e.target.checked)}
                  disabled={isCancelled}
                />
                <span>Weekend override</span>
              </label>
            </div>
          )}
        </div>

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Site address</h3>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>Site name</label>
              <input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                style={styles.input}
                disabled={isCancelled}
              />
            </div>

            <div>
              <label style={styles.label}>Address line 1</label>
              <input
                value={siteAddress1}
                onChange={(e) => setSiteAddress1(e.target.value)}
                style={styles.input}
                disabled={isCancelled}
              />
            </div>

            <div>
              <label style={styles.label}>Address line 2</label>
              <input
                value={siteAddress2}
                onChange={(e) => setSiteAddress2(e.target.value)}
                style={styles.input}
                disabled={isCancelled}
              />
            </div>

            <div>
              <label style={styles.label}>Town</label>
              <input
                value={siteTown}
                onChange={(e) => setSiteTown(e.target.value)}
                style={styles.input}
                disabled={isCancelled}
              />
            </div>

            <div>
              <label style={styles.label}>Postcode</label>
              <input
                value={sitePostcode}
                onChange={(e) => setSitePostcode(e.target.value)}
                style={styles.input}
                disabled={isCancelled}
              />
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            style={styles.textarea}
            disabled={isCancelled}
          />
        </div>

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Summary</h3>
          <div style={styles.grid}>
            <div>
              <label style={styles.staticLabel}>Skip</label>
              <div style={styles.staticValue}>
                {skipTypeDisplay({ ...job, skip_type_id: skipTypeId }, skipTypes) ||
                  "—"}
              </div>
            </div>
            <div>
              <label style={styles.staticLabel}>Delivery</label>
              <div style={styles.staticValue}>{scheduledDate || "—"}</div>
            </div>
            <div>
              <label style={styles.staticLabel}>Collection</label>
              <div style={styles.staticValue}>{collectionDate || "—"}</div>
            </div>
            <div>
              <label style={styles.staticLabel}>Price inc VAT</label>
              <div style={styles.staticValue}>
                {price === "" ? "—" : `£${formatMoney(price)}`}
              </div>
            </div>
          </div>
        </div>

        <div style={styles.actions}>
          {canMarkDelivered ? (
            <button
              onClick={() => handleStatusAction("mark_delivered")}
              disabled={statusUpdating}
              style={styles.deliveredBtn}
              type="button"
            >
              {statusUpdating ? "Updating…" : "Mark delivered"}
            </button>
          ) : null}

          {canUndoDelivered ? (
            <button
              onClick={() => handleStatusAction("undo_delivered")}
              disabled={statusUpdating}
              style={styles.undoBtn}
              type="button"
            >
              {statusUpdating ? "Updating…" : "Undo delivered"}
            </button>
          ) : null}

          {canMarkCollected ? (
            <button
              onClick={() => handleStatusAction("mark_collected")}
              disabled={statusUpdating}
              style={styles.collectedBtn}
              type="button"
            >
              {statusUpdating ? "Updating…" : "Mark collected"}
            </button>
          ) : null}

          {canUndoCollected ? (
            <button
              onClick={() => handleStatusAction("undo_collected")}
              disabled={statusUpdating}
              style={styles.undoBtn}
              type="button"
            >
              {statusUpdating ? "Updating…" : "Undo collected"}
            </button>
          ) : null}

          <button
            onClick={handleSave}
            disabled={saving || isCancelled}
            style={styles.primaryBtn}
            type="button"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>

          <button
            onClick={handleCancelJob}
            disabled={cancelling || isCancelled}
            style={styles.cancelBtn}
            type="button"
          >
            {cancelling ? "Cancelling…" : "Cancel job"}
          </button>

          <button
            onClick={handleDeleteJob}
            disabled={deleting}
            style={styles.deleteBtn}
            type="button"
          >
            {deleting ? "Deleting…" : "Delete job"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 24,
    fontFamily: "var(--font-sans, Arial, sans-serif)",
    background: "#ffffff",
  },
  wrap: {
    maxWidth: 1000,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
    color: "#0f172a",
  },
  backLink: {
    display: "inline-block",
    marginTop: 4,
    color: "#0f172a",
    textDecoration: "underline",
    textUnderlineOffset: 3,
    fontSize: 14,
    fontWeight: 600,
  },
  badgeRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  },
  badge: {
    display: "inline-block",
    background: "#eef2ff",
    border: "1px solid #c7d2fe",
    color: "#3730a3",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 13,
    fontWeight: 700,
  },
  card: {
    background: "#f8fafc",
    border: "1px solid #dbe3f0",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 14,
    fontSize: 18,
    color: "#0f172a",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
  staticLabel: {
    display: "block",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 700,
    color: "#475569",
  },
  staticValue: {
    minHeight: 20,
    color: "#0f172a",
    fontSize: 15,
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    resize: "vertical",
    boxSizing: "border-box",
  },
  checkRow: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    marginTop: 14,
  },
  checkbox: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
  },
  warnBox: {
    background: "#fff3cd",
    color: "#7a5a00",
    border: "1px solid #ffe69c",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoBox: {
    background: "#eff6ff",
    color: "#1e3a8a",
    border: "1px solid #bfdbfe",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  cancelledBox: {
    background: "#f8d7da",
    color: "#842029",
    border: "1px solid #f1aeb5",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorBox: {
    background: "#fff1f0",
    color: "#8a1f1f",
    border: "1px solid #ffccc7",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  successBox: {
    background: "#e6ffed",
    color: "#14532d",
    border: "1px solid #b7eb8f",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 18,
    marginBottom: 24,
  },
  primaryBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, var(--brand-mint), rgba(58,181,255,0.9))",
    color: "#071013",
    fontWeight: 900,
    cursor: "pointer",
  },
  deliveredBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  collectedBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "#059669",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  undoBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "#64748b",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  cancelBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "#f59e0b",
    color: "#111827",
    fontWeight: 900,
    cursor: "pointer",
  },
  deleteBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "#dc2626",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
};
