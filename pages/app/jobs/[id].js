// pages/app/jobs/[id].js
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const jobId = Array.isArray(id) ? id[0] : id;

  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [job, setJob] = useState(null);
  const [customerLabel, setCustomerLabel] = useState("");
  const [skipLabel, setSkipLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Editable fields
  const [siteName, setSiteName] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteTown, setSiteTown] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;
    if (!jobId) return;

    async function loadJob() {
      setLoading(true);
      setErrorMsg("");

      const { data, error } = await supabase
        .from("jobs")
        .select(
          `
          id,
          job_number,
          customer_id,
          skip_type_id,
          job_status,
          scheduled_date,
          notes,
          site_name,
          site_address_line1,
          site_address_line2,
          site_town,
          site_postcode,
          payment_type,
          price_inc_vat
        `
        )
        .eq("subscriber_id", subscriberId)
        .eq("id", jobId)
        .single();

      if (error) {
        console.error("Error loading job:", error);
        setErrorMsg("Could not load job.");
        setLoading(false);
        return;
      }

      setJob(data);
      setSiteName(data.site_name || "");
      setSiteAddress1(data.site_address_line1 || "");
      setSiteAddress2(data.site_address_line2 || "");
      setSiteTown(data.site_town || "");
      setSitePostcode(data.site_postcode || "");
      setScheduledDate(data.scheduled_date || "");
      setPaymentType(data.payment_type || "");
      setNotes(data.notes || "");

      // Fetch customer label
      try {
        const { data: cust } = await supabase
          .from("customers")
          .select("first_name, last_name, company_name")
          .eq("subscriber_id", subscriberId)
          .eq("id", data.customer_id)
          .single();

        if (cust) {
          const base = `${cust.first_name ?? ""} ${
            cust.last_name ?? ""
          }`.trim();
          setCustomerLabel(
            cust.company_name
              ? `${cust.company_name} – ${base || "Unknown contact"}`
              : base || "Unknown customer"
          );
        }
      } catch (e) {
        console.error("Error loading customer for job:", e);
      }

      // Fetch skip label
      try {
        const { data: skip } = await supabase
          .from("skip_types")
          .select("name, quantity_owned")
          .eq("subscriber_id", subscriberId)
          .eq("id", data.skip_type_id)
          .single();

        if (skip) {
          setSkipLabel(`${skip.name} (${skip.quantity_owned} owned)`);
        }
      } catch (e) {
        console.error("Error loading skip type for job:", e);
      }

      setLoading(false);
    }

    loadJob();
  }, [checking, subscriberId, jobId]);

  async function handleSave(e) {
    e.preventDefault();
    setErrorMsg("");
    setFieldErrors({});

    const newErrors = {};
    if (!paymentType) {
      newErrors.paymentType = "Please choose a payment type.";
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      return;
    }

    setSaving(true);

    try {
      const updates = {
        site_name: siteName || null,
        site_address_line1: siteAddress1 || null,
        site_address_line2: siteAddress2 || null,
        site_town: siteTown || null,
        site_postcode: sitePostcode || null,
        scheduled_date: scheduledDate || null,
        payment_type: paymentType || null,
        notes: notes || null,
      };

      const { data, error } = await supabase
        .from("jobs")
        .update(updates)
        .eq("subscriber_id", subscriberId)
        .eq("id", jobId)
        .select(
          `
          id,
          job_number,
          customer_id,
          skip_type_id,
          job_status,
          scheduled_date,
          notes,
          site_name,
          site_address_line1,
          site_address_line2,
          site_town,
          site_postcode,
          payment_type,
          price_inc_vat
        `
        )
        .single();

      if (error) {
        console.error("Error saving job:", error);
        setErrorMsg("Could not save changes.");
        setSaving(false);
        return;
      }

      setJob(data);
      setSaving(false);
    } catch (err) {
      console.error("Unexpected error saving job:", err);
      setErrorMsg("Unexpected error saving job.");
      setSaving(false);
    }
  }

  if (checking || loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p>Loading job…</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: 24,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p>Job not found.</p>
        <p>
          <a href="/app/jobs">← Back to jobs</a>
        </p>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>
          Job {job.job_number || job.id}
        </h1>
        {user?.email && (
          <p style={{ fontSize: 14, color: "#555" }}>
            Signed in as {user.email}
          </p>
        )}
        <p style={{ marginTop: 8 }}>
          <a href="/app/jobs" style={{ fontSize: 14 }}>
            ← Back to jobs list
          </a>
        </p>
      </header>

      {(authError || errorMsg) && (
        <p style={{ color: "red", marginBottom: 16 }}>
          {authError || errorMsg}
        </p>
      )}

      <section
        style={{
          marginBottom: 24,
          padding: 16,
          borderRadius: 8,
          border: "1px solid #ddd",
          maxWidth: 700,
        }}
      >
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 12 }}>
          Overview
        </h2>
        <p style={{ margin: "4px 0" }}>
          <strong>Customer:</strong> {customerLabel || job.customer_id}
        </p>
        <p style={{ margin: "4px 0" }}>
          <strong>Skip type:</strong> {skipLabel || job.skip_type_id}
        </p>
        <p style={{ margin: "4px 0" }}>
          <strong>Status:</strong> {job.job_status || "unknown"}
        </p>
        <p style={{ margin: "4px 0" }}>
          <strong>Price (inc VAT):</strong>{" "}
          {job.price_inc_vat != null
            ? `£${Number(job.price_inc_vat).toFixed(2)}`
            : "N/A"}
        </p>
      </section>

      <section
        style={{
          marginBottom: 24,
          padding: 16,
          borderRadius: 8,
          border: "1px solid #ddd",
          maxWidth: 700,
        }}
      >
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 12 }}>
          Edit job details
        </h2>

        <form onSubmit={handleSave}>
          {/* Site name */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Site name / description
            </label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            />
          </div>

          {/* Address line 1 */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Site address line 1
            </label>
            <input
              type="text"
              value={siteAddress1}
              onChange={(e) => setSiteAddress1(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            />
          </div>

          {/* Address line 2 */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Site address line 2
            </label>
            <input
              type="text"
              value={siteAddress2}
              onChange={(e) => setSiteAddress2(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            />
          </div>

          {/* Town */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Town</label>
            <input
              type="text"
              value={siteTown}
              onChange={(e) => setSiteTown(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            />
          </div>

          {/* Postcode */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Site postcode
            </label>
            <input
              type="text"
              value={sitePostcode}
              onChange={(e) => setSitePostcode(e.target.value)}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            />
          </div>

          {/* Delivery date */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Delivery date
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              style={{
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            />
          </div>

          {/* Payment type */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Payment type
            </label>
            <select
              value={paymentType}
              onChange={(e) => {
                setPaymentType(e.target.value);
                setFieldErrors((prev) => ({
                  ...prev,
                  paymentType: undefined,
                }));
              }}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            >
              <option value="">Select payment type</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="account">Account</option>
            </select>
            {fieldErrors.paymentType && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "red",
                }}
              >
                {fieldErrors.paymentType}
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
                resize: "vertical",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "8px 16px",
              borderRadius: 4,
              border: "none",
              cursor: saving ? "default" : "pointer",
              backgroundColor: saving ? "#999" : "#0070f3",
              color: "#fff",
              fontWeight: 500,
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>
    </main>
  );
}
