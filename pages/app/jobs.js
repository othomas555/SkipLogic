// pages/app/jobs.js
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";
import { getSkipPricesForPostcode } from "../../lib/getSkipPricesForPostcode";

export default function JobsPage() {
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);

  // Skip types state
  const [skipTypes, setSkipTypes] = useState([]);
  const [selectedSkipTypeId, setSelectedSkipTypeId] = useState("");

  const [errorMsg, setErrorMsg] = useState("");

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = useState({});

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [saving, setSaving] = useState(false);

  // New form fields
  const [siteName, setSiteName] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteTown, setSiteTown] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [scheduledDate, setScheduledDate] = useState(""); // yyyy-mm-dd string
  const [notes, setNotes] = useState("");
  const [paymentType, setPaymentType] = useState("card"); // card | cash | account etc.

  // Postcode → available skips + price
  const [postcodeSkips, setPostcodeSkips] = useState([]); // [{skip_type_id, skip_type_name, price_inc_vat}]
  const [postcodeMsg, setPostcodeMsg] = useState("");
  const [jobPrice, setJobPrice] = useState(""); // price for this job
  const [lookingUpPostcode, setLookingUpPostcode] = useState(false);

  // Whether we should create a Xero invoice (currently parked)
  const [createInvoice, setCreateInvoice] = useState(false);

  // "Add customer" modal state (full details)
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

  // Same-as-customer-address toggle
  const [sameAsCustomerAddress, setSameAsCustomerAddress] = useState(false);

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return; // useAuthProfile handles redirect if not signed in

    async function loadData() {
      setErrorMsg("");

      // 1) Load customers for this subscriber
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

      // 2) Load jobs for this subscriber
      const { data: jobData, error: jobsError } = await supabase
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
          site_town,
          site_postcode,
          payment_type
        `
        )
        .eq("subscriber_id", subscriberId)
        .order("created_at", { ascending: false });

      if (jobsError) {
        console.error("Jobs error:", jobsError);
        setErrorMsg("Could not load jobs.");
        return;
      }

      setJobs(jobData || []);

      // 3) Load skip types for this subscriber
      const { data: skipTypesData, error: skipTypesError } = await supabase
        .from("skip_types")
        .select("id, name, quantity_owned")
        .eq("subscriber_id", subscriberId)
        .order("name", { ascending: true });

      if (skipTypesError) {
        console.error("Skip types error:", skipTypesError);
        // don’t hard fail the page, just show message
        setErrorMsg("Could not load skip types.");
      } else {
        setSkipTypes(skipTypesData || []);
      }
    }

    loadData();
  }, [checking, subscriberId]);

  // Lookup all skips + prices for a postcode
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
        // Clear skip + price if postcode not served
        setSelectedSkipTypeId("");
        setJobPrice("");
        return;
      }

      setPostcodeSkips(results);
      setPostcodeMsg(`Found ${results.length} skip type(s) for this postcode.`);

      // If the currently selected skip isn't in this postcode, clear it
      if (
        selectedSkipTypeId &&
        !results.some((r) => r.skip_type_id === selectedSkipTypeId)
      ) {
        setSelectedSkipTypeId("");
        setJobPrice("");
      }
    } catch (err) {
      console.error("handleLookupPostcode error:", err);
      setPostcodeMsg("Error looking up skips for this postcode.");
    } finally {
      setLookingUpPostcode(false);
    }
  };

  // Helper: copy customer address into site fields
  function applyCustomerAddressToSite(customerId) {
    const c = customers.find((cust) => cust.id === customerId);
    if (!c) return;
    setSiteAddress1(c.address_line1 || "");
    setSiteAddress2(c.address_line2 || "");
    // Treat address_line3 as town/extra line
    setSiteTown(c.address_line3 || "");
    setSitePostcode(c.postcode || "");
  }

  function handleSameAsCustomerToggle(checked) {
    setSameAsCustomerAddress(checked);
    if (checked && selectedCustomerId) {
      applyCustomerAddressToSite(selectedCustomerId);
    }
  }

  // Create a customer directly from the Jobs page modal (full details)
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

      // Add to customers list + select it
      setCustomers((prev) => [...prev, data]);
      setSelectedCustomerId(data.id);

      // If "same as customer" was ticked, apply address
      if (sameAsCustomerAddress) {
        applyCustomerAddressToSite(data.id);
      }

      // Reset + close modal
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

    const newErrors = {};

    if (!sitePostcode) {
      newErrors.sitePostcode =
        "Please enter a site postcode and look up available skips.";
    }

    if (!selectedSkipTypeId) {
      newErrors.skipType = "Please select a skip type for this postcode.";
    }

    if (!selectedCustomerId) {
      newErrors.customer = "Please select a customer.";
    }

    const numericPrice = parseFloat(jobPrice);
    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      newErrors.jobPrice = "Price must be a positive number.";
    }

    // Payment type vs credit account
    const selectedCustomerObj = customers.find(
      (c) => c.id === selectedCustomerId
    );
    const isCreditCustomer = !!selectedCustomerObj?.is_credit_account;

    if (!paymentType) {
      newErrors.paymentType = "Please select a payment type.";
    } else if (isCreditCustomer && paymentType !== "account") {
      newErrors.paymentType =
        "Credit account customers must use 'Account' as payment type.";
    } else if (!isCreditCustomer && paymentType === "account") {
      newErrors.paymentType =
        "Only credit account customers can use 'Account' payment type.";
    }

    if (!subscriberId) {
      // This is a deeper internal problem, keep it as a banner
      setErrorMsg("Could not find your subscriber when adding job.");
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      return;
    }

    setSaving(true);

    try {
      // Find the selected skip type
      const selectedSkip = skipTypes.find((s) => s.id === selectedSkipTypeId);

      if (!selectedSkip) {
        setErrorMsg("Selected skip type not found.");
        setSaving(false);
        return;
      }

      // Insert job with price_inc_vat
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
            // job_status will default to 'booked'
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
          payment_type
        `
        )
        .single();

      if (insertError) {
        console.error("Insert job error:", insertError);
        setErrorMsg("Could not save job.");
        setSaving(false);
        return;
      }

      // Create initial DELIVER event for this job
      const { data: event, error: eventError } = await supabase.rpc(
        "create_job_event",
        {
          _subscriber_id: subscriberId,
          _job_id: inserted.id,
          _event_type: "DELIVER",
          _scheduled_at: null,
          _completed_at: null,
          _notes: "Initial delivery booked",
        }
      );

      if (eventError) {
        console.error("Create job event error:", eventError);
        setErrorMsg(
          `Job was created but the delivery event failed: ${eventError.message}`
        );
        setSaving(false);
        return;
      }

      // Xero integration parked for now (createInvoice ignored for now)

      // Prepend new job to list
      setJobs((prev) => [inserted, ...prev]);

      // Send notification email via SendGrid (fire-and-forget)
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

      // Reset form
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

  function formatCustomerLabel(c) {
    const baseName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (c.company_name) {
      // e.g. "Acme Ltd – John Smith"
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
    return `${s.name} (${s.quantity_owned} owned)`;
  }

  // Derived info for UI (credit-account locking etc.)
  const selectedCustomer =
    selectedCustomerId &&
    customers.find((c) => c.id === selectedCustomerId);
  const selectedCustomerIsCredit = !!selectedCustomer?.is_credit_account;
  const forceInvoiceForCredit =
    selectedCustomerIsCredit && paymentType === "account";

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
        <p>Loading your jobs…</p>
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
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Jobs</h1>
        {user?.email && (
          <p style={{ fontSize: 14, color: "#555" }}>
            Signed in as {user.email}
          </p>
        )}
        <p style={{ marginTop: 8 }}>
          <a href="/app" style={{ fontSize: 14 }}>
            ← Back to dashboard
          </a>
        </p>
      </header>

      {(authError || errorMsg) && (
        <p style={{ color: "red", marginBottom: 16 }}>
          {authError || errorMsg}
        </p>
      )}

      {/* Book A Standard Skip Form */}
      <section
        style={{
          marginBottom: 32,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 8,
          maxWidth: 700,
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>
          Book A Standard Skip
        </h2>
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

            {/* Available skips dropdown */}
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

            {/* Job price field */}
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
                Auto-filled from postcode table. You can override if needed
                (we&apos;ll flag as custom later).
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

                  const sel = customers.find((c) => c.id === id);
                  const isCredit = !!sel?.is_credit_account;

                  // Lock payment type based on credit status
                  if (isCredit) {
                    setPaymentType("account");
                  } else if (paymentType === "account") {
                    setPaymentType("card");
                  }

                  // If "same as customer" is on, copy address
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

          {/* Same as customer address toggle */}
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

          {/* Delivery site */}
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
              <option value="card" disabled={selectedCustomerIsCredit}>
                Card
              </option>
              <option value="cash" disabled={selectedCustomerIsCredit}>
                Cash
              </option>
              <option value="account" disabled={!selectedCustomerIsCredit}>
                Account
              </option>
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
            {selectedCustomerIsCredit && selectedCustomer && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                This customer is a credit account – payment type is locked to
                &apos;Account&apos;.
              </div>
            )}
            {!selectedCustomerIsCredit && selectedCustomer && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                This customer is pay-upfront – use Card or Cash.
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

          {/* Create invoice checkbox */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "inline-flex", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={forceInvoiceForCredit ? true : createInvoice}
                onChange={(e) => {
                  if (forceInvoiceForCredit) return;
                  setCreateInvoice(e.target.checked);
                }}
                style={{ marginRight: 8 }}
                disabled={forceInvoiceForCredit}
              />
              Create invoice in Xero
            </label>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Xero integration currently disabled
              {forceInvoiceForCredit
                ? " – for credit customers on Account, this will always invoice."
                : ""}
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

      {/* Jobs List */}
      <section>
        {jobs.length === 0 ? (
          <p>No jobs found yet.</p>
        ) : (
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              maxWidth: 1000,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Job #
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Customer
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Skip type
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Site / Postcode
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Delivery date
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Payment
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "8px",
                  }}
                >
                  Job status
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.job_number || j.id}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {findCustomerNameById(j.customer_id)}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {findSkipTypeNameById(j.skip_type_id)}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.site_name
                      ? `${j.site_name}, ${j.site_postcode || ""}`
                      : j.site_postcode || ""}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.scheduled_date || ""}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.payment_type || ""}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid #eee",
                      padding: "8px",
                    }}
                  >
                    {j.job_status || "unknown"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* New Customer Modal with full fields */}
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

            {/* Credit Account Customer */}
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
