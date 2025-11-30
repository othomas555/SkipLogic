// pages/app/jobs/book.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";
import { getSkipPricesForPostcode } from "../../../lib/getSkipPricesForPostcode";

export default function BookJobPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [skipTypes, setSkipTypes] = useState([]);

  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [saving, setSaving] = useState(false);

  // Site / job fields
  const [siteName, setSiteName] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteTown, setSiteTown] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [scheduledDate, setScheduledDate] = useState(""); // yyyy-mm-dd
  const [notes, setNotes] = useState("");
  const [paymentType, setPaymentType] = useState("card");

  // Postcode → skip + price
  const [postcodeSkips, setPostcodeSkips] = useState([]);
  const [postcodeMsg, setPostcodeMsg] = useState("");
  const [jobPrice, setJobPrice] = useState("");
  const [lookingUpPostcode, setLookingUpPostcode] = useState(false);

  // Xero (parked)
  const [createInvoice, setCreateInvoice] = useState(false);

  // “Same as customer address”
  const [sameAsCustomerAddress, setSameAsCustomerAddress] = useState(false);

  // Add customer modal
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newCustomerCompanyName, setNewCustomerCompanyName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress1, setNewCustomerAddress1] = useState("");
  const [newCustomerAddress2, setNewCustomerAddress2] = useState("");
  const [newCustomerAddress3, setNewCustomerAddress3] = useState("");
  const [newCustomerPostcode, setNewCustomerPostcode] = useState("");
  const [newCustomerCreditAccount, setNewCustomerCreditAccount] =
    useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState("");

  // Last booked job for visual confirmation
  const [lastJob, setLastJob] = useState(null);
  const [lastJobCustomerName, setLastJobCustomerName] = useState("");
  const [lastJobSkipName, setLastJobSkipName] = useState("");

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;

    async function loadData() {
      setErrorMsg("");

      const { data: customerData, error: customersError } = await supabase
        .from("customers")
        .select(
          `
          id,
          first_name,
          last_name,
          company_name,
          email,
          address_line1,
          address_line2,
          address_line3,
          postcode,
          is_credit_account
        `
        )
        .eq("subscriber_id", subscriberId)
        .order("last_name", { ascending: true });

      if (customersError) {
        console.error("Customers error:", customersError);
        setErrorMsg("Could not load customers.");
        return;
      }

      setCustomers(customerData || []);

      const { data: skipTypesData, error: skipTypesError } = await supabase
        .from("skip_types")
        .select("id, name, quantity_owned")
        .eq("subscriber_id", subscriberId)
        .order("name", { ascending: true });

      if (skipTypesError) {
        console.error("Skip types error:", skipTypesError);
        setErrorMsg("Could not load skip types.");
      } else {
        setSkipTypes(skipTypesData || []);
      }
    }

    loadData();
  }, [checking, subscriberId]);

  // Helpers
  function formatCustomerLabel(c) {
    const baseName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (c.company_name) {
      return `${c.company_name} – ${baseName || "Unknown contact"}`;
    }
    return baseName || "Unknown customer";
  }

  function findCustomerNameById(customerId) {
    const c = customers.find((cust) => cust.id === customerId);
    if (!c) return "Unknown customer";
    const baseName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (c.company_name) {
      return `${c.company_name} – ${baseName || "Unknown contact"}`;
    }
    return baseName || "Unknown customer";
  }

  function findCustomerEmailById(customerId) {
    const c = customers.find((cust) => cust.id === customerId);
    return c?.email || "";
  }

  function findSkipTypeNameById(skipTypeId) {
    const s = skipTypes.find((st) => st.id === skipTypeId);
    if (!s) return "Unknown skip type";
    return s.name;
  }

  // Copy customer address into site fields
  function applyCustomerAddressToSite(customerId) {
    const c = customers.find((cust) => cust.id === customerId);
    if (!c) return;
    setSiteAddress1(c.address_line1 || "");
    setSiteAddress2(c.address_line2 || "");
    setSiteTown(c.address_line3 || "");
    setSitePostcode(c.postcode || "");
  }

  function handleSameAsCustomerToggle(checked) {
    setSameAsCustomerAddress(checked);
    if (checked && selectedCustomerId) {
      applyCustomerAddressToSite(selectedCustomerId);
    }
  }

  // Postcode lookup
  const handleLookupPostcode = async () => {
    setPostcodeMsg("");
    setErrorMsg("");
    setFieldErrors((prev) => ({ ...prev, sitePostcode: undefined }));

    const trimmed = (sitePostcode || "").trim();
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
        setSelectedSkipTypeId("");
        setJobPrice("");
        return;
      }

      setPostcodeSkips(results);
      setPostcodeMsg(`Found ${results.length} skip type(s) for this postcode.`);

      if (
        selectedCustomerId &&
        !results.some((r) => r.skip_type_id === selectedCustomerId)
      ) {
        setSelectedCustomerId("");
        setJobPrice("");
      }
    } catch (err) {
      console.error("handleLookupPostcode error:", err);
      setPostcodeMsg("Error looking up skips for this postcode.");
    } finally {
      setLookingUpPostcode(false);
    }
  };

  // Create customer from modal
  async function handleCreateCustomerFromModal() {
    try {
      setNewCustomerError("");

      if (!newCustomerFirstName.trim()) {
        setNewCustomerError("First name is required");
        return;
      }
      if (!newCustomerLastName.trim()) {
        setNewCustomerError("Last name is required");
        return;
      }
      if (!newCustomerEmail.trim()) {
        setNewCustomerError("Customer email is required");
        return;
      }
      if (!newCustomerPhone.trim()) {
        setNewCustomerError("Customer phone is required");
        return;
      }
      if (!newCustomerAddress1.trim()) {
        setNewCustomerError("Address Line 1 is required");
        return;
      }
      if (!newCustomerAddress2.trim()) {
        setNewCustomerError("Address Line 2 is required");
        return;
      }
      if (!newCustomerPostcode.trim()) {
        setNewCustomerError("Postcode is required");
        return;
      }
      if (!subscriberId) {
        setNewCustomerError(
          "Missing subscriberId – please refresh and try again."
        );
        return;
      }

      setCreatingCustomer(true);

      const { data, error } = await supabase
        .from("customers")
        .insert([
          {
            subscriber_id: subscriberId,
            first_name: newCustomerFirstName.trim(),
            last_name: newCustomerLastName.trim(),
            company_name: newCustomerCompanyName.trim() || null,
            email: newCustomerEmail.trim(),
            phone: newCustomerPhone.trim(),
            address_line1: newCustomerAddress1.trim(),
            address_line2: newCustomerAddress2.trim(),
            address_line3: newCustomerAddress3.trim() || null,
            postcode: newCustomerPostcode.trim(),
            is_credit_account: newCustomerCreditAccount,
          },
        ])
        .select(
          `
          id,
          first_name,
          last_name,
          company_name,
          email,
          address_line1,
          address_line2,
          address_line3,
          postcode,
          is_credit_account
        `
        )
        .single();

      if (error) {
        console.error("Error creating customer from modal:", error);
        setNewCustomerError(error.message || "Error creating customer");
        setCreatingCustomer(false);
        return;
      }

      setCustomers((prev) => [...prev, data]);
      setSelectedCustomerId(data.id);

      if (sameAsCustomerAddress) {
        applyCustomerAddressToSite(data.id);
      }

      // Reset modal
      setNewCustomerFirstName("");
      setNewCustomerLastName("");
      setNewCustomerCompanyName("");
      setNewCustomerEmail("");
      setNewCustomerPhone("");
      setNewCustomerAddress1("");
      setNewCustomerAddress2("");
      setNewCustomerAddress3("");
      setNewCustomerPostcode("");
      setNewCustomerCreditAccount(false);
      setCreatingCustomer(false);
      setShowNewCustomerModal(false);
    } catch (err) {
      console.error("Unexpected error creating customer:", err);
      setNewCustomerError("Unexpected error creating customer");
      setCreatingCustomer(false);
    }
  }

  async function handleAddJob(e) {
    e.preventDefault();
    setErrorMsg("");
    setFieldErrors({});
    setLastJob(null);

    const newErrors = {};

    if (!sitePostcode) {
      newErrors.sitePostcode =
        "Please enter a site postcode and look up available skips.";
    }

    if (!selectedCustomerId) {
      newErrors.customer = "Please select a customer.";
    }

    if (!selectedSkipTypeId && postcodeSkips.length === 0) {
      // safety but we’ll validate properly below
    }

    if (!paymentType) {
      newErrors.paymentType = "Please select a payment type.";
    }

    if (!selectedSkipTypeId) {
      newErrors.skipType = "Please select a skip type for this postcode.";
    }

    const numericPrice = parseFloat(jobPrice);
    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      newErrors.jobPrice = "Price must be a positive number.";
    }

    if (!subscriberId) {
      setErrorMsg("Could not find your subscriber when adding job.");
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      return;
    }

    setSaving(true);

    try {
      const selectedSkip = skipTypes.find((s) => s.id === selectedSkipTypeId);
      if (!selectedSkip) {
        setErrorMsg("Selected skip type not found.");
        setSaving(false);
        return;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("jobs")
        .insert([
          {
            subscriber_id: subscriberId,
            customer_id: selectedCustomerId,
            skip_type_id: selectedSkipTypeId,
            site_name: siteName || null,
            site_address_line1: siteAddress1 || null,
            site_address_line2: siteAddress2 || null,
            site_town: siteTown || null,
            site_postcode: sitePostcode || null,
            scheduled_date: scheduledDate || null,
            notes: notes || `Standard skip: ${selectedSkip.name}`,
            payment_type: paymentType || null,
            price_inc_vat: numericPrice,
          },
        ])
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
          site_town,
          site_postcode,
          payment_type,
          price_inc_vat
        `
        )
        .single();

      if (insertError) {
        console.error("Insert job error:", insertError);
        setErrorMsg("Could not save job.");
        setSaving(false);
        return;
      }

            // Create initial delivery event in the job timeline
      const { error: eventError } = await supabase.rpc("create_job_event", {
        _subscriber_id: subscriberId,
        _job_id: inserted.id,
        // Use the clean event type; the DB trigger will normalise if needed
        _event_type: "delivery",
        _scheduled_at: null,
        _completed_at: null,
        _notes: "Initial delivery booked",
      });

      if (eventError) {
        console.error("Create job event error:", eventError);
        setErrorMsg(
          `Job was created but the delivery event failed: ${eventError.message}`
        );
        setSaving(false);
        return;
      }

      // Email (fire and forget)
      try {
        const customerLabel = findCustomerNameById(inserted.customer_id);
        const customerEmail = findCustomerEmailById(inserted.customer_id);

        await fetch("/api/send_booking_email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job: inserted,
            customerName: customerLabel,
            customerEmail,
            jobPrice,
          }),
        });
      } catch (err) {
        console.error("Email send failed:", err);
      }

      // Visual confirmation
      setLastJob(inserted);
      setLastJobCustomerName(findCustomerNameById(inserted.customer_id));
      setLastJobSkipName(findSkipTypeNameById(inserted.skip_type_id));

      // Reset form (but keep postcode message etc. simple)
      setSelectedCustomerId("");
      setSelectedSkipTypeId("");
      setSiteName("");
      setSiteAddress1("");
      setSiteAddress2("");
      setSiteTown("");
      setSitePostcode("");
      setScheduledDate("");
      setNotes("");
      setPaymentType("card");
      setPostcodeSkips([]);
      setPostcodeMsg("");
      setJobPrice("");
      setCreateInvoice(false);
      setSameAsCustomerAddress(false);
      setSaving(false);
      setFieldErrors({});
    } catch (err) {
      console.error("Unexpected error adding job:", err);
      setErrorMsg("Something went wrong while adding the job.");
      setSaving(false);
    }
  }

  const [selectedSkipTypeId, setSelectedSkipTypeId] = useState("");

  if (checking) {
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
        <p>Loading…</p>
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
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Book a Standard Skip</h1>
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

      {/* Success / visual confirmation */}
      {lastJob && (
        <section
          style={{
            marginBottom: 24,
            padding: 12,
            borderRadius: 6,
            background: "#e6ffed",
            border: "1px solid #b7eb8f",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>Job booked</h2>
          <p style={{ margin: "4px 0" }}>
            Job number:{" "}
            <strong>{lastJob.job_number || lastJob.id}</strong>
          </p>
          <p style={{ margin: "4px 0" }}>
            Customer: {lastJobCustomerName}
            <br />
            Skip type: {lastJobSkipName}
            <br />
            Site:{" "}
            {lastJob.site_name
              ? `${lastJob.site_name}, ${lastJob.site_postcode || ""}`
              : lastJob.site_postcode || ""}
            <br />
            Price: £
            {lastJob.price_inc_vat != null
              ? Number(lastJob.price_inc_vat).toFixed(2)
              : "N/A"}
          </p>
          <p style={{ margin: "4px 0" }}>
            <a href={`/app/jobs/${lastJob.id}`}>View / edit this job ↗</a>
          </p>
        </section>
      )}

      {/* Booking form */}
      <section
        style={{
          marginBottom: 32,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          maxWidth: 700,
        }}
      >
        <form onSubmit={handleAddJob}>
          {/* Step 1 – Postcode & Skip */}
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 6,
              border: "1px solid #eee",
              backgroundColor: "#f9f9f9",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>
              Step 1: Postcode & Skip
            </h3>

            {/* Postcode input */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", marginBottom: 4 }}>
                Site postcode *
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={sitePostcode}
                  onChange={(e) => setSitePostcode(e.target.value)}
                  placeholder="CF32 7AB"
                  style={{
                    flex: 1,
                    padding: 8,
                    borderRadius: 4,
                    border: "1px solid #ccc",
                  }}
                />
                <button
                  type="button"
                  onClick={handleLookupPostcode}
                  disabled={lookingUpPostcode}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 4,
                    border: "1px solid #0070f3",
                    backgroundColor: lookingUpPostcode ? "#e0e0e0" : "#0070f3",
                    color: "#fff",
                    cursor: lookingUpPostcode ? "default" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lookingUpPostcode ? "Looking up…" : "Find skips"}
                </button>
              </div>
              {postcodeMsg && (
                <div style={{ marginTop: 4, fontSize: 12 }}>{postcodeMsg}</div>
              )}
              {fieldErrors.sitePostcode && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "red",
                  }}
                >
                  {fieldErrors.sitePostcode}
                </div>
              )}
            </div>

            {/* Skips */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", marginBottom: 4 }}>
                Available skips for this postcode *
              </label>
              <select
                value={selectedSkipTypeId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedSkipTypeId(newId);
                  setFieldErrors((prev) => ({ ...prev, skipType: undefined }));

                  const chosen = postcodeSkips.find(
                    (s) => s.skip_type_id === newId
                  );
                  if (chosen) {
                    setJobPrice(
                      chosen.price_inc_vat != null
                        ? chosen.price_inc_vat.toString()
                        : ""
                    );
                  } else {
                    setJobPrice("");
                  }
                }}
                disabled={postcodeSkips.length === 0}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              >
                <option value="">
                  {postcodeSkips.length === 0
                    ? "No skips found yet"
                    : "Select skip type"}
                </option>
                {postcodeSkips.map((s) => (
                  <option key={s.skip_type_id} value={s.skip_type_id}>
                    {s.skip_type_name} – £
                    {s.price_inc_vat != null
                      ? Number(s.price_inc_vat).toFixed(2)
                      : "N/A"}
                  </option>
                ))}
              </select>
              {fieldErrors.skipType && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "red",
                  }}
                >
                  {fieldErrors.skipType}
                </div>
              )}
            </div>

            {/* Price */}
            <div>
              <label style={{ display: "block", marginBottom: 4 }}>
                Price for this job (£)
              </label>
              <input
                type="number"
                step="0.01"
                value={jobPrice}
                onChange={(e) => {
                  setJobPrice(e.target.value);
                  setFieldErrors((prev) => ({
                    ...prev,
                    jobPrice: undefined,
                  }));
                }}
                style={{
                  width: 160,
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  textAlign: "right",
                }}
              />
              <div style={{ marginTop: 4, fontSize: 12 }}>
                Auto-filled from postcode table. You can override if needed.
              </div>
              {fieldErrors.jobPrice && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "red",
                  }}
                >
                  {fieldErrors.jobPrice}
                </div>
              )}
            </div>
          </div>

          {/* Customer */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Customer *
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCustomerId(id);
                  setFieldErrors((prev) => ({
                    ...prev,
                    customer: undefined,
                    paymentType: undefined,
                  }));
                  if (sameAsCustomerAddress && id) {
                    applyCustomerAddressToSite(id);
                  }
                }}
                style={{
                  flex: 1,
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatCustomerLabel(c)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setNewCustomerError("");
                  setShowNewCustomerModal(true);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  background: "#f5f5f5",
                  cursor: "pointer",
                  fontSize: 14,
                  whiteSpace: "nowrap",
                }}
              >
                + New
              </button>
            </div>
            {fieldErrors.customer && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "red",
                }}
              >
                {fieldErrors.customer}
              </div>
            )}
          </div>

          {/* Same as customer address */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={sameAsCustomerAddress}
                disabled={!selectedCustomerId}
                onChange={(e) => handleSameAsCustomerToggle(e.target.checked)}
              />
              Site address same as customer
            </label>
            {!selectedCustomerId && (
              <div
                style={{
                  fontSize: 12,
                  color: "#666",
                  marginTop: 4,
                }}
              >
                Select a customer first to use this.
              </div>
            )}
          </div>

          {/* Site fields */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Site name / description (optional)
            </label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Front drive, Unit 3, Rear yard"
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            />
          </div>

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

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Site address line 2 (optional)
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

          <div
            style={{
              marginBottom: 12,
              display: "flex",
              gap: 8,
            }}
          >
            <div style={{ flex: 1 }}>
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
              disabled={!selectedCustomerId}
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
            {!selectedCustomerId && (
              <div
                style={{
                  fontSize: 12,
                  marginTop: 4,
                  color: "#666",
                }}
              >
                Select a customer to choose payment type.
              </div>
            )}
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

          {/* Create invoice toggle (future Xero) */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "inline-flex", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={createInvoice}
                onChange={(e) => setCreateInvoice(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Create invoice in Xero
            </label>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Xero integration currently disabled
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>
              Notes (optional)
            </label>
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
            {saving ? "Saving…" : "Book A Standard Skip"}
          </button>
        </form>
      </section>

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 24,
              borderRadius: 8,
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 16 }}>
              Add new customer
            </h2>

            {newCustomerError && (
              <p style={{ color: "red", marginBottom: 12 }}>
                {newCustomerError}
              </p>
            )}

            {/* First Name */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                First Name *
              </label>
              <input
                type="text"
                value={newCustomerFirstName}
                onChange={(e) => setNewCustomerFirstName(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* Last Name */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                Last Name *
              </label>
              <input
                type="text"
                value={newCustomerLastName}
                onChange={(e) => setNewCustomerLastName(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* Company Name */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                Company Name (optional)
              </label>
              <input
                type="text"
                value={newCustomerCompanyName}
                onChange={(e) => setNewCustomerCompanyName(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                Customer Email *
              </label>
              <input
                type="email"
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* Phone */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                Customer Phone *
              </label>
              <input
                type="tel"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* Address Line 1 */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                Address Line 1 *
              </label>
              <input
                type="text"
                value={newCustomerAddress1}
                onChange={(e) => setNewCustomerAddress1(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* Address Line 2 */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                Address Line 2 *
              </label>
              <input
                type="text"
                value={newCustomerAddress2}
                onChange={(e) => setNewCustomerAddress2(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* Address Line 3 */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                Address Line 3 (optional)
              </label>
              <input
                type="text"
                value={newCustomerAddress3}
                onChange={(e) => setNewCustomerAddress3(e.target.value)}
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
              <label
                style={{ display: "block", marginBottom: 4, fontSize: 14 }}
              >
                Postcode *
              </label>
              <input
                type="text"
                value={newCustomerPostcode}
                onChange={(e) => setNewCustomerPostcode(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            {/* Credit Account */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={newCustomerCreditAccount}
                  onChange={(e) =>
                    setNewCustomerCreditAccount(e.target.checked)
                  }
                />
                Credit Account Customer *
              </label>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 8,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (!creatingCustomer) {
                    setShowNewCustomerModal(false);
                    setNewCustomerError("");
                  }
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  background: "#f5f5f5",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCustomerFromModal}
                disabled={creatingCustomer}
                style={{
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: "#0070f3",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 14,
                  opacity: creatingCustomer ? 0.7 : 1,
                }}
              >
                {creatingCustomer ? "Saving..." : "Save customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
