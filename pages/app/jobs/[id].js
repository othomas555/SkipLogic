import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export default function EditJobPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [job, setJob] = useState(null);
  const [lookups, setLookups] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // form fields
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

  // load job
  useEffect(() => {
    if (!id) return;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const token = await getAccessToken();

        const res = await fetch(`/api/jobs/get?id=${id}`, {
          headers: { Authorization: "Bearer " + token },
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Failed to load job");
        }

        const j = json.job;

        setJob(j);
        setLookups(json.lookups);

        // populate form
        setCustomerId(j.customer_id || "");
        setSkipTypeId(j.skip_type_id || "");
        setScheduledDate(j.scheduled_date || "");
        setPrice(j.price_inc_vat || "");
        setNotes(j.notes || "");

        setSiteName(j.site_name || "");
        setSiteAddress1(j.site_address_line1 || "");
        setSiteAddress2(j.site_address_line2 || "");
        setSiteTown(j.site_town || "");
        setSitePostcode(j.site_postcode || "");

        setPaymentType(j.payment_type || "card");
        setPlacementType(j.placement_type || "private");
      } catch (err) {
        setError(err.message);
      }

      setLoading(false);
    }

    load();
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/jobs/update", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          customer_id: customerId,
          skip_type_id: skipTypeId,
          scheduled_date: scheduledDate,
          price_inc_vat: price,
          notes,

          site_name: siteName,
          site_address_line1: siteAddress1,
          site_address_line2: siteAddress2,
          site_town: siteTown,
          site_postcode: sitePostcode,

          payment_type: paymentType,
          placement_type: placementType,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Update failed");
      }

      if (json.invoice_review_flagged) {
        setSuccess("Saved. ⚠ Invoice needs manual review.");
      } else {
        setSuccess("Saved.");
      }
    } catch (err) {
      setError(err.message);
    }

    setSaving(false);
  }

  async function handleCancelJob() {
    if (!confirm("Cancel this job?")) return;

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/jobs/cancel", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          cancellation_reason: "Cancelled via edit page",
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error);
      }

      alert("Job cancelled");
      router.push("/app/jobs");
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeleteJob() {
    if (!confirm("DELETE this job permanently?")) return;

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/jobs/delete", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error);
      }

      alert("Job deleted");
      router.push("/app/jobs");
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

  if (!job) return <div style={{ padding: 20 }}>Job not found</div>;

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <h1>Edit Job #{job.job_number}</h1>

      {job.xero_invoice_id && (
        <div style={{ background: "#fff3cd", padding: 10, marginBottom: 20 }}>
          ⚠ This job has an invoice. Changes will require manual review.
        </div>
      )}

      {error && <div style={{ color: "red" }}>{error}</div>}
      {success && <div style={{ color: "green" }}>{success}</div>}

      <h3>Customer</h3>
      <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
        {lookups.customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.company_name || `${c.first_name} ${c.last_name}`}
          </option>
        ))}
      </select>

      <h3>Skip</h3>
      <select value={skipTypeId} onChange={(e) => setSkipTypeId(e.target.value)}>
        {lookups.skip_types.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <h3>Date</h3>
      <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />

      <h3>Price</h3>
      <input value={price} onChange={(e) => setPrice(e.target.value)} />

      <h3>Notes</h3>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />

      <h3>Address</h3>
      <input placeholder="Site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
      <input value={siteAddress1} onChange={(e) => setSiteAddress1(e.target.value)} />
      <input value={siteAddress2} onChange={(e) => setSiteAddress2(e.target.value)} />
      <input value={siteTown} onChange={(e) => setSiteTown(e.target.value)} />
      <input value={sitePostcode} onChange={(e) => setSitePostcode(e.target.value)} />

      <h3>Payment</h3>
      <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
        <option value="card">Card</option>
        <option value="cash">Cash</option>
        <option value="account">Account</option>
      </select>

      <br /><br />

      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save Changes"}
      </button>

      <hr />

      <button onClick={handleCancelJob} style={{ background: "orange" }}>
        Cancel Job
      </button>

      <button onClick={handleDeleteJob} style={{ background: "red", marginLeft: 10 }}>
        Delete Job
      </button>
    </div>
  );
}
