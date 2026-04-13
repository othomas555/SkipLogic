import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

function customerLabel(c) {
  if (!c) return "Unknown customer";
  const person = `${c.first_name || ""} ${c.last_name || ""}`.trim();
  if (c.company_name && person) return `${c.company_name} – ${person}`;
  if (c.company_name) return c.company_name;
  return person || "Unknown customer";
}

export default function EditJobPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [job, setJob] = useState(null);
  const [lookups, setLookups] = useState({
    customers: [],
    skip_types: [],
    permit_settings: [],
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [skipTypeId, setSkipTypeId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
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
    if (!id) return;

    async function load() {
      setLoading(true);
      setError("");
      setSuccess("");

      try {
        const token = await getAccessToken();

        const res = await fetch(`/api/jobs/get?id=${encodeURIComponent(id)}`, {
          headers: token ? { Authorization: "Bearer " + token } : {},
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Failed to load job");
        }

        const j = json.job || null;
        const lookupData = json.lookups || {};

        setJob(j);
        setLookups({
          customers: Array.isArray(lookupData.customers) ? lookupData.customers : [],
          skip_types: Array.isArray(lookupData.skip_types) ? lookupData.skip_types : [],
          permit_settings: Array.isArray(lookupData.permit_settings) ? lookupData.permit_settings : [],
        });

        if (j) {
          setCustomerId(j.customer_id || "");
          setSkipTypeId(j.skip_type_id || "");
          setScheduledDate(j.scheduled_date || "");
          setPrice(j.price_inc_vat != null ? String(j.price_inc_vat) : "");
          setNotes(j.notes || "");

          setSiteName(j.site_name || "");
          setSiteAddress1(j.site_address_line1 || "");
          setSiteAddress2(j.site_address_line2 || "");
          setSiteTown(j.site_town || "");
          setSitePostcode(j.site_postcode || "");

          setPaymentType(j.payment_type || "card");
          setPlacementType(j.placement_type || "private");
          setSelectedPermitId(j.permit_setting_id || "");
          setPermitPriceNoVat(
            j.permit_price_no_vat != null ? String(j.permit_price_no_vat) : ""
          );
          setPermitDelayBusinessDays(
            j.permit_delay_business_days != null ? String(j.permit_delay_business_days) : ""
          );
          setPermitValidityDays(
            j.permit_validity_days != null ? String(j.permit_validity_days) : ""
          );
          setPermitOverride(!!j.permit_override);
          setWeekendOverride(!!j.weekend_override);
        }
      } catch (err) {
        setError(err?.message || "Failed to load job");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  const customers = useMemo(
    () => (Array.isArray(lookups?.customers) ? lookups.customers : []),
    [lookups]
  );
  const skipTypes = useMemo(
    () => (Array.isArray(lookups?.skip_types) ? lookups.skip_types : []),
    [lookups]
  );
  const permitSettings = useMemo(
    () => (Array.isArray(lookups?.permit_settings) ? lookups.permit_settings : []),
    [lookups]
  );

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = await getAccessToken();

      const body = {
        id,
        customer_id: customerId,
        skip_type_id: skipTypeId,
        scheduled_date: scheduledDate || null,
        price_inc_vat: price,
        notes,

        site_name: siteName,
        site_address_line1: siteAddress1,
        site_address_line2: siteAddress2,
        site_town: siteTown,
        site_postcode: sitePostcode,

        payment_type: paymentType,
        placement_type: placementType,

        permit_setting_id: placementType === "permit" ? selectedPermitId || null : null,
        permit_price_no_vat: placementType === "permit" ? permitPriceNoVat || null : null,
        permit_delay_business_days:
          placementType === "permit" ? permitDelayBusinessDays || null : null,
        permit_validity_days:
          placementType === "permit" ? permitValidityDays || null : null,
        permit_override: placementType === "permit" ? permitOverride : false,
        weekend_override: weekendOverride,
      };

      const res = await fetch("/api/jobs/update", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: "Bearer " + token } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Update failed");
      }

      setJob((prev) => ({
        ...(prev || {}),
        ...(json.job || {}),
      }));

      if (json.invoice_review_flagged) {
        setSuccess("Saved. Invoice now needs manual review.");
      } else {
        setSuccess("Saved.");
      }
    } catch (err) {
      setError(err?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelJob() {
    const reason = window.prompt("Cancellation reason:", "Cancelled via edit page");
    if (reason === null) return;

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/jobs/cancel", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: "Bearer " + token } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          cancellation_reason: reason || "Cancelled via edit page",
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Cancel failed");
      }

      window.alert("Job cancelled");
      router.push("/app/jobs");
    } catch (err) {
      window.alert(err?.message || "Cancel failed");
    }
  }

  async function handleDeleteJob() {
    const ok = window.confirm("DELETE this job permanently?");
    if (!ok) return;

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/jobs/delete", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: "Bearer " + token } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Delete failed");
      }

      window.alert("Job deleted");
      router.push("/app/jobs");
    } catch (err) {
      window.alert(err?.message || "Delete failed");
    }
  }

  if (loading) {
    return <div style={{ padding: 20 }}>Loading…</div>;
  }

  if (error && !job) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Edit job</h1>
        <div style={{ color: "red", marginTop: 12 }}>{error}</div>
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
          <h1 style={styles.title}>Edit Job #{job.job_number || job.id}</h1>
          <a href="/app/jobs" style={styles.backLink}>
            ← Back to jobs
          </a>
        </div>

        {(job.xero_invoice_id || job.xero_invoice_number) && (
          <div style={styles.warnBox}>
            <strong>Invoice warning:</strong> this job already has an invoice linked.
            Any commercial changes should be reviewed manually in Xero.
          </div>
        )}

        {job.job_status === "cancelled" && (
          <div style={styles.cancelledBox}>
            This job is cancelled and can no longer be edited.
          </div>
        )}

        {error ? <div style={styles.errorBox}>{error}</div> : null}
        {success ? <div style={styles.successBox}>{success}</div> : null}

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Customer</h3>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {customerLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Skip and date</h3>

          <label style={styles.label}>Skip type</label>
          <select
            value={skipTypeId}
            onChange={(e) => setSkipTypeId(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          >
            <option value="">Select skip type</option>
            {skipTypes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <label style={styles.label}>Scheduled date</label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          />

          <label style={styles.label}>Price inc VAT</label>
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          />
        </div>

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Site</h3>

          <label style={styles.label}>Site name</label>
          <input
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          />

          <label style={styles.label}>Address line 1</label>
          <input
            value={siteAddress1}
            onChange={(e) => setSiteAddress1(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          />

          <label style={styles.label}>Address line 2</label>
          <input
            value={siteAddress2}
            onChange={(e) => setSiteAddress2(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          />

          <label style={styles.label}>Town</label>
          <input
            value={siteTown}
            onChange={(e) => setSiteTown(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          />

          <label style={styles.label}>Postcode</label>
          <input
            value={sitePostcode}
            onChange={(e) => setSitePostcode(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          />
        </div>

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Placement and payment</h3>

          <label style={styles.label}>Payment type</label>
          <select
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          >
            <option value="">Select payment type</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="account">Account</option>
          </select>

          <label style={styles.label}>Placement type</label>
          <select
            value={placementType}
            onChange={(e) => setPlacementType(e.target.value)}
            style={styles.input}
            disabled={job.job_status === "cancelled"}
          >
            <option value="private">Private</option>
            <option value="permit">Permit</option>
          </select>

          {placementType === "permit" ? (
            <>
              <label style={styles.label}>Permit setting</label>
              <select
                value={selectedPermitId}
                onChange={(e) => setSelectedPermitId(e.target.value)}
                style={styles.input}
                disabled={job.job_status === "cancelled"}
              >
                <option value="">Select permit</option>
                {permitSettings.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <label style={styles.label}>Permit price no VAT</label>
              <input
                type="number"
                step="0.01"
                value={permitPriceNoVat}
                onChange={(e) => setPermitPriceNoVat(e.target.value)}
                style={styles.input}
                disabled={job.job_status === "cancelled"}
              />

              <label style={styles.label}>Permit delay business days</label>
              <input
                type="number"
                value={permitDelayBusinessDays}
                onChange={(e) => setPermitDelayBusinessDays(e.target.value)}
                style={styles.input}
                disabled={job.job_status === "cancelled"}
              />

              <label style={styles.label}>Permit validity days</label>
              <input
                type="number"
                value={permitValidityDays}
                onChange={(e) => setPermitValidityDays(e.target.value)}
                style={styles.input}
                disabled={job.job_status === "cancelled"}
              />

              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={permitOverride}
                  onChange={(e) => setPermitOverride(e.target.checked)}
                  disabled={job.job_status === "cancelled"}
                />
                <span>Permit override</span>
              </label>
            </>
          ) : null}

          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={weekendOverride}
              onChange={(e) => setWeekendOverride(e.target.checked)}
              disabled={job.job_status === "cancelled"}
            />
            <span>Weekend override</span>
          </label>
        </div>

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            style={styles.textarea}
            disabled={job.job_status === "cancelled"}
          />
        </div>

        <div style={styles.actions}>
          <button
            onClick={handleSave}
            disabled={saving || job.job_status === "cancelled"}
            style={styles.primaryBtn}
            type="button"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>

          <button
            onClick={handleCancelJob}
            disabled={job.job_status === "cancelled"}
            style={styles.cancelBtn}
            type="button"
          >
            Cancel job
          </button>

          <button
            onClick={handleDeleteJob}
            style={styles.deleteBtn}
            type="button"
          >
            Delete job
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
    fontFamily: "var(--font-sans)",
  },
  wrap: {
    maxWidth: 900,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
    color: "var(--d-ink)",
  },
  backLink: {
    display: "inline-block",
    marginTop: 12,
    color: "#8ecbff",
    textDecoration: "underline",
    textUnderlineOffset: 3,
    fontSize: 14,
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
    marginBottom: 12,
    fontSize: 18,
    color: "#0f172a",
  },
  label: {
    display: "block",
    marginBottom: 6,
    marginTop: 10,
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
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
  checkbox: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
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
