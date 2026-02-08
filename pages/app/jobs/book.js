// pages/app/jobs/book.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";
import { getSkipPricesForPostcode } from "../../../lib/getSkipPricesForPostcode";

function ymdTodayUTC() {
  const dt = new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmdAsUTC(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

function formatYmdUTC(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekendYmd(ymd) {
  const dt = parseYmdAsUTC(ymd);
  if (!dt) return false;
  const dow = dt.getUTCDay();
  return dow === 0 || dow === 6;
}

function addBusinessDaysUTC(startYmd, businessDays) {
  let dt = parseYmdAsUTC(startYmd);
  if (!dt) return null;

  let remaining = Number(businessDays || 0);
  if (!Number.isFinite(remaining) || remaining <= 0) return formatYmdUTC(dt);

  while (remaining > 0) {
    dt = new Date(dt.getTime() + 24 * 60 * 60 * 1000);
    const dow = dt.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    remaining -= 1;
  }

  return formatYmdUTC(dt);
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function clampMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.round(x * 100) / 100);
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

export default function BookJobPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [skipTypes, setSkipTypes] = useState([]);
  const [permitSettings, setPermitSettings] = useState([]);

  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [saving, setSaving] = useState(false);

  const [siteName, setSiteName] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteTown, setSiteTown] = useState("");
  const [sitePostcode, setSitePostcode] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentType, setPaymentType] = useState("card");

  const [placementType, setPlacementType] = useState("private");
  const [selectedPermitId, setSelectedPermitId] = useState("");
  const [permitOverride, setPermitOverride] = useState(false);
  const [weekendOverride, setWeekendOverride] = useState(false);

  const [postcodeSkips, setPostcodeSkips] = useState([]);
  const [postcodeMsg, setPostcodeMsg] = useState("");
  const [jobPrice, setJobPrice] = useState("");
  const [lookingUpPostcode, setLookingUpPostcode] = useState(false);

  const [sameAsCustomerAddress, setSameAsCustomerAddress] = useState(false);

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
  const [newCustomerCreditAccount, setNewCustomerCreditAccount] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState("");

  const [lastJob, setLastJob] = useState(null);
  const [lastJobCustomerName, setLastJobCustomerName] = useState("");
  const [lastJobSkipName, setLastJobSkipName] = useState("");
  const [lastInvoice, setLastInvoice] = useState(null); // { ok, mode, invoiceId, invoiceNumber, invoiceStatus, ... }

  const [selectedSkipTypeId, setSelectedSkipTypeId] = useState("");

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

      const { data: permitsData, error: permitsError } = await supabase
        .from("permit_settings")
        .select("id, name, price_no_vat, delay_business_days, validity_days, is_active")
        .eq("subscriber_id", subscriberId)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (permitsError) {
        console.error("Permit settings error:", permitsError);
        setPermitSettings([]);
      } else {
        setPermitSettings(permitsData || []);
      }
    }

    loadData();
  }, [checking, subscriberId]);

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

  function findPermitById(permitId) {
    return permitSettings.find((p) => p.id === permitId) || null;
  }

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

  const permitInfo = useMemo(() => {
    if (placementType !== "permit") return null;
    if (!selectedPermitId) return null;
    return findPermitById(selectedPermitId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementType, selectedPermitId, permitSettings]);

  const earliestAllowedDateYmd = useMemo(() => {
    if (placementType !== "permit") return "";
    const delay = Number(permitInfo?.delay_business_days || 0);
    return addBusinessDaysUTC(ymdTodayUTC(), delay);
  }, [placementType, permitInfo]);

  function enforceDateRules(nextYmd, { showErrors = true } = {}) {
    if (!nextYmd) return true;

    if (!weekendOverride && isWeekendYmd(nextYmd)) {
      if (showErrors) {
        setFieldErrors((prev) => ({
          ...prev,
          scheduledDate: "Weekends are blocked. Tick “Weekend override” to allow Saturday/Sunday.",
        }));
      }
      return false;
    }

    if (placementType === "permit" && permitInfo && !permitOverride) {
      if (earliestAllowedDateYmd && nextYmd < earliestAllowedDateYmd) {
        if (showErrors) {
          setFieldErrors((prev) => ({
            ...prev,
            scheduledDate: `This permit usually takes ${permitInfo.delay_business_days || 0} business day(s). Earliest delivery is ${earliestAllowedDateYmd}. Tick “Permit override” to book earlier.`,
          }));
        }
        return false;
      }
    }

    return true;
  }

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
    } catch (err) {
      console.error("handleLookupPostcode error:", err);
      setPostcodeMsg("Error looking up skips for this postcode.");
    } finally {
      setLookingUpPostcode(false);
    }
  };

  async function handleCreateCustomerFromModal() {
    try {
      setNewCustomerError("");

      if (!newCustomerFirstName.trim()) return setNewCustomerError("First name is required");
      if (!newCustomerLastName.trim()) return setNewCustomerError("Last name is required");
      if (!newCustomerEmail.trim()) return setNewCustomerError("Customer email is required");
      if (!newCustomerPhone.trim()) return setNewCustomerError("Customer phone is required");
      if (!newCustomerAddress1.trim()) return setNewCustomerError("Address Line 1 is required");
      if (!newCustomerAddress2.trim()) return setNewCustomerError("Address Line 2 is required");
      if (!newCustomerPostcode.trim()) return setNewCustomerError("Postcode is required");
      if (!subscriberId) return setNewCustomerError("Missing subscriberId – please refresh and try again.");

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
    setLastInvoice(null);

    const newErrors = {};

    if (!sitePostcode) newErrors.sitePostcode = "Please enter a site postcode and look up available skips.";
    if (!selectedCustomerId) newErrors.customer = "Please select a customer.";
    if (!paymentType) newErrors.paymentType = "Please select a payment type.";
    if (!selectedSkipTypeId) newErrors.skipType = "Please select a skip type for this postcode.";

    const numericPrice = clampMoney(jobPrice);
    if (!(numericPrice > 0)) newErrors.jobPrice = "Price must be a positive number.";

    if (placementType === "permit") {
      if (!selectedPermitId) newErrors.placement = "Select a council permit (or choose Private ground).";
    }

    if (scheduledDate) {
      const ok = enforceDateRules(scheduledDate, { showErrors: false });
      if (!ok) {
        enforceDateRules(scheduledDate, { showErrors: true });
        newErrors.scheduledDate = "Delivery date not allowed with current rules.";
      }
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

      const permit = placementType === "permit" ? findPermitById(selectedPermitId) : null;

      const token = await getAccessToken();
      if (!token) {
        setErrorMsg("You must be signed in.");
        setSaving(false);
        return;
      }

      const payload = {
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

        placement_type: placementType,
        permit_setting_id: permit ? permit.id : null,
        permit_price_no_vat: permit ? Number(permit.price_no_vat || 0) : null,
        permit_delay_business_days: permit ? Number(permit.delay_business_days || 0) : null,
        permit_validity_days: permit ? Number(permit.validity_days || 0) : null,
        permit_override: !!permitOverride,
        weekend_override: !!weekendOverride,

        // for email convenience (optional)
        customer_name: findCustomerNameById(selectedCustomerId),
        customer_email: findCustomerEmailById(selectedCustomerId),
      };

      const res = await fetch("/api/jobs/create", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErrorMsg(json?.error || "Could not save job.");
        setSaving(false);
        return;
      }

      const inserted = json.job;
      const inv = json.invoice || null;

      setLastJob(inserted);
      setLastInvoice(inv);

      setLastJobCustomerName(findCustomerNameById(inserted.customer_id));
      setLastJobSkipName(findSkipTypeNameById(inserted.skip_type_id));

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

      setPlacementType("private");
      setSelectedPermitId("");
      setPermitOverride(false);
      setWeekendOverride(false);

      setPostcodeSkips([]);
      setPostcodeMsg("");
      setJobPrice("");
      setSameAsCustomerAddress(false);

      setSaving(false);
      setFieldErrors({});
    } catch (err) {
      console.error("Unexpected error adding job:", err);
      setErrorMsg("Something went wrong while adding the job.");
      setSaving(false);
    }
  }

  const permitCostNoVat = useMemo(() => {
    if (placementType !== "permit") return 0;
    const p = placementType === "permit" ? findPermitById(selectedPermitId) : null;
    return p ? Number(p.price_no_vat || 0) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementType, selectedPermitId, permitSettings]);

  const numericSkipPriceIncVat = useMemo(() => {
    const n = Number(jobPrice);
    return Number.isFinite(n) ? n : 0;
  }, [jobPrice]);

  const totalChargeDisplay = useMemo(() => {
    const total = numericSkipPriceIncVat + permitCostNoVat;
    return Number.isFinite(total) ? total : 0;
  }, [numericSkipPriceIncVat, permitCostNoVat]);

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
        {user?.email && <p style={{ fontSize: 14, color: "#555" }}>Signed in as {user.email}</p>}
        <p style={{ marginTop: 8 }}>
          <a href="/app/jobs" style={{ fontSize: 14 }}>
            ← Back to jobs list
          </a>
        </p>
      </header>

      {(authError || errorMsg) && <p style={{ color: "red", marginBottom: 16 }}>{authError || errorMsg}</p>}

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
            Job number: <strong>{lastJob.job_number || lastJob.id}</strong>
          </p>
          <p style={{ margin: "4px 0" }}>
            Customer: {lastJobCustomerName}
            <br />
            Skip type: {lastJobSkipName}
            <br />
            Site: {lastJob.site_name ? `${lastJob.site_name}, ${lastJob.site_postcode || ""}` : lastJob.site_postcode || ""}
            <br />
            Skip price (inc VAT): £{lastJob.price_inc_vat != null ? Number(lastJob.price_inc_vat).toFixed(2) : "N/A"}
            {lastJob.placement_type === "permit" ? (
              <>
                <br />
                Permit (NO VAT): £{lastJob.permit_price_no_vat != null ? Number(lastJob.permit_price_no_vat).toFixed(2) : "0.00"}
              </>
            ) : null}
          </p>

          {lastInvoice ? (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#fff", border: "1px solid #d9f7be" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Invoice</div>
              {lastInvoice.ok === false ? (
                <div style={{ color: "#8a1f1f", fontSize: 13 }}>
                  Invoice failed: {lastInvoice.details || lastInvoice.error}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#333", lineHeight: 1.6 }}>
                  <div>Mode: <b>{lastInvoice.mode}</b></div>
                  {lastInvoice.invoiceNumber ? <div>Invoice number: <b>{lastInvoice.invoiceNumber}</b></div> : null}
                  {lastInvoice.invoiceStatus ? <div>Status: <b>{lastInvoice.invoiceStatus}</b></div> : null}
                </div>
              )}
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                Cash/Card auto-invoice runs on booking now.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
              No invoice created (account customers are handled at month-end).
            </div>
          )}

          <p style={{ margin: "10px 0 0" }}>
            <a href={`/app/jobs/${lastJob.id}`}>View / edit this job ↗</a>
          </p>
        </section>
      )}

      {/* Booking form (unchanged except submit) */}
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
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Step 1: Postcode & Skip</h3>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", marginBottom: 4 }}>Site postcode *</label>
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
              {postcodeMsg && <div style={{ marginTop: 4, fontSize: 12 }}>{postcodeMsg}</div>}
              {fieldErrors.sitePostcode && (
                <div style={{ marginTop: 4, fontSize: 12, color: "red" }}>{fieldErrors.sitePostcode}</div>
              )}
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", marginBottom: 4 }}>Available skips for this postcode *</label>
              <select
                value={selectedSkipTypeId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedSkipTypeId(newId);
                  setFieldErrors((prev) => ({ ...prev, skipType: undefined }));

                  const chosen = postcodeSkips.find((s) => s.skip_type_id === newId);
                  if (chosen) {
                    setJobPrice(chosen.price_inc_vat != null ? chosen.price_inc_vat.toString() : "");
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
                <option value="">{postcodeSkips.length === 0 ? "No skips found yet" : "Select skip type"}</option>
                {postcodeSkips.map((s) => (
                  <option key={s.skip_type_id} value={s.skip_type_id}>
                    {s.skip_type_name} – £{s.price_inc_vat != null ? Number(s.price_inc_vat).toFixed(2) : "N/A"}
                  </option>
                ))}
              </select>
              {fieldErrors.skipType && <div style={{ marginTop: 4, fontSize: 12, color: "red" }}>{fieldErrors.skipType}</div>}
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4 }}>Skip price for this job (inc VAT) (£)</label>
              <input
                type="number"
                step="0.01"
                value={jobPrice}
                onChange={(e) => {
                  setJobPrice(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, jobPrice: undefined }));
                }}
                style={{
                  width: 160,
                  padding: 8,
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  textAlign: "right",
                }}
              />
              <div style={{ marginTop: 4, fontSize: 12 }}>Auto-filled from postcode table. You can override if needed.</div>
              {fieldErrors.jobPrice && <div style={{ marginTop: 4, fontSize: 12, color: "red" }}>{fieldErrors.jobPrice}</div>}
            </div>
          </div>

          {/* Customer */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Customer *</label>
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
            {fieldErrors.customer && <div style={{ marginTop: 4, fontSize: 12, color: "red" }}>{fieldErrors.customer}</div>}
          </div>

          {/* Same as customer address */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={sameAsCustomerAddress}
                disabled={!selectedCustomerId}
                onChange={(e) => handleSameAsCustomerToggle(e.target.checked)}
              />
              Site address same as customer
            </label>
            {!selectedCustomerId && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Select a customer first to use this.</div>
            )}
          </div>

          {/* Site fields */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Site name / description (optional)</label>
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
            <label style={{ display: "block", marginBottom: 4 }}>Site address line 1</label>
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
            <label style={{ display: "block", marginBottom: 4 }}>Site address line 2 (optional)</label>
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

          <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
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

          {/* Placement */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Placement</label>
            <select
              value={placementType === "private" ? "private" : selectedPermitId ? `permit:${selectedPermitId}` : "permit:"}
              onChange={(e) => {
                const v = e.target.value;
                setFieldErrors((prev) => ({ ...prev, placement: undefined, scheduledDate: undefined }));

                if (v === "private") {
                  setPlacementType("private");
                  setSelectedPermitId("");
                  setPermitOverride(false);
                  if (scheduledDate) {
                    const ok = enforceDateRules(scheduledDate, { showErrors: true });
                    if (!ok) setScheduledDate("");
                  }
                  return;
                }

                if (v.startsWith("permit:")) {
                  const id = v.slice("permit:".length);
                  setPlacementType("permit");
                  setSelectedPermitId(id || "");
                  if (scheduledDate) {
                    const ok = enforceDateRules(scheduledDate, { showErrors: true });
                    if (!ok) setScheduledDate("");
                  }
                }
              }}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            >
              <option value="private">Private ground (no permit)</option>
              <optgroup label="Council permit (road)">
                {permitSettings.length === 0 ? (
                  <option value="permit:" disabled>
                    No active permits configured (add them in Settings)
                  </option>
                ) : (
                  permitSettings.map((p) => (
                    <option key={p.id} value={`permit:${p.id}`}>
                      {p.name} — £{Number(p.price_no_vat || 0).toFixed(2)} (NO VAT), {Number(p.delay_business_days || 0)} business day(s)
                    </option>
                  ))
                )}
              </optgroup>
            </select>

            {placementType === "permit" && permitInfo ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "#333" }}>
                Permit: <b>{permitInfo.name}</b> — £{Number(permitInfo.price_no_vat || 0).toFixed(2)} (NO VAT).<br />
                Typical approval delay: <b>{Number(permitInfo.delay_business_days || 0)}</b> business day(s). Earliest delivery:{" "}
                <b>{earliestAllowedDateYmd || "—"}</b> (unless overridden).
              </div>
            ) : null}

            {fieldErrors.placement && <div style={{ marginTop: 4, fontSize: 12, color: "red" }}>{fieldErrors.placement}</div>}
          </div>

          {/* Overrides */}
          <div style={{ marginBottom: 12, display: "grid", gap: 8 }}>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={weekendOverride}
                onChange={(e) => {
                  setWeekendOverride(e.target.checked);
                  setFieldErrors((prev) => ({ ...prev, scheduledDate: undefined }));
                  if (!e.target.checked && scheduledDate && isWeekendYmd(scheduledDate)) {
                    setScheduledDate("");
                  }
                }}
              />
              Weekend override (allow Saturday/Sunday)
            </label>

            <label
              style={{
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
                fontSize: 14,
                opacity: placementType === "permit" ? 1 : 0.5,
              }}
            >
              <input
                type="checkbox"
                checked={permitOverride}
                disabled={placementType !== "permit"}
                onChange={(e) => {
                  setPermitOverride(e.target.checked);
                  setFieldErrors((prev) => ({ ...prev, scheduledDate: undefined }));
                  if (
                    placementType === "permit" &&
                    permitInfo &&
                    !e.target.checked &&
                    scheduledDate &&
                    earliestAllowedDateYmd &&
                    scheduledDate < earliestAllowedDateYmd
                  ) {
                    setScheduledDate("");
                  }
                }}
              />
              Permit override (book earlier than approval delay)
            </label>
          </div>

          {/* Delivery date */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Delivery date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => {
                const next = e.target.value || "";
                setFieldErrors((prev) => ({ ...prev, scheduledDate: undefined }));

                if (!next) {
                  setScheduledDate("");
                  return;
                }

                const ok = enforceDateRules(next, { showErrors: true });
                if (!ok) {
                  setScheduledDate("");
                  return;
                }

                setScheduledDate(next);
              }}
              style={{
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>Weekends are blocked by default. Permit delays count Mon–Fri only.</div>
            {fieldErrors.scheduledDate && <div style={{ marginTop: 4, fontSize: 12, color: "red" }}>{fieldErrors.scheduledDate}</div>}
          </div>

          {/* Payment type */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Payment type</label>
            <select
              value={paymentType}
              onChange={(e) => {
                setPaymentType(e.target.value);
                setFieldErrors((prev) => ({ ...prev, paymentType: undefined }));
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
            {!selectedCustomerId && <div style={{ fontSize: 12, marginTop: 4, color: "#666" }}>Select a customer to choose payment type.</div>}
            {fieldErrors.paymentType && <div style={{ marginTop: 4, fontSize: 12, color: "red" }}>{fieldErrors.paymentType}</div>}
          </div>

          {/* Totals */}
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: "1px solid #eee", background: "#fafafa" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Charges</div>
            <div style={{ fontSize: 13, color: "#333", lineHeight: 1.6 }}>
              <div>Skip hire (inc VAT): <b>£{numericSkipPriceIncVat.toFixed(2)}</b></div>
              <div>Permit (NO VAT): <b>£{permitCostNoVat.toFixed(2)}</b></div>
              <div style={{ marginTop: 6, fontSize: 14 }}>
                Total to charge: <b>£{totalChargeDisplay.toFixed(2)}</b>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4 }}>Notes (optional)</label>
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

      {/* New Customer Modal (unchanged) */}
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
            <h2 style={{ marginTop: 0, marginBottom: 16 }}>Add new customer</h2>

            {newCustomerError && <p style={{ color: "red", marginBottom: 12 }}>{newCustomerError}</p>}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>First Name *</label>
              <input
                type="text"
                value={newCustomerFirstName}
                onChange={(e) => setNewCustomerFirstName(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Last Name *</label>
              <input
                type="text"
                value={newCustomerLastName}
                onChange={(e) => setNewCustomerLastName(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Company Name (optional)</label>
              <input
                type="text"
                value={newCustomerCompanyName}
                onChange={(e) => setNewCustomerCompanyName(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Customer Email *</label>
              <input
                type="email"
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Customer Phone *</label>
              <input
                type="tel"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Address Line 1 *</label>
              <input
                type="text"
                value={newCustomerAddress1}
                onChange={(e) => setNewCustomerAddress1(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Address Line 2 *</label>
              <input
                type="text"
                value={newCustomerAddress2}
                onChange={(e) => setNewCustomerAddress2(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Address Line 3 (optional)</label>
              <input
                type="text"
                value={newCustomerAddress3}
                onChange={(e) => setNewCustomerAddress3(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 14 }}>Postcode *</label>
              <input
                type="text"
                value={newCustomerPostcode}
                onChange={(e) => setNewCustomerPostcode(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={newCustomerCreditAccount}
                  onChange={(e) => setNewCustomerCreditAccount(e.target.checked)}
                />
                Credit Account Customer *
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
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
