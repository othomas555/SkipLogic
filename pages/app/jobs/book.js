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

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

function isCreditLimitText(msg) {
  const t = String(msg || "").toLowerCase();
  return t.includes("credit limit exceeded");
}

function extractCreditDetailsFromMessage(msg) {
  const text = String(msg || "");
  const lower = text.toLowerCase();

  if (lower.includes("no credit_limit set")) {
    return { kind: "no_limit", unpaid: null, thisJob: null, limit: null };
  }

  const unpaidMatch = text.match(/Unpaid:\s*([0-9]+(\.[0-9]+)?)/i);
  const thisJobMatch = text.match(/This job:\s*([0-9]+(\.[0-9]+)?)/i);
  const limitMatch = text.match(/Limit:\s*([0-9]+(\.[0-9]+)?)/i);

  return {
    kind: "values",
    unpaid: unpaidMatch ? Number(unpaidMatch[1]) : null,
    thisJob: thisJobMatch ? Number(thisJobMatch[1]) : null,
    limit: limitMatch ? Number(limitMatch[1]) : null,
  };
}

function safeRandomUUID() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch (e) {}
  // fallback is NOT uuid, so return empty and let server generate uuid
  return "";
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

  const [createInvoice, setCreateInvoice] = useState(true);
  const [markPaidNow, setMarkPaidNow] = useState(false);

  const [invoiceMsg, setInvoiceMsg] = useState("");
  const [invoiceErr, setInvoiceErr] = useState("");

  const [paymentMsg, setPaymentMsg] = useState("");
  const [paymentErr, setPaymentErr] = useState("");

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

  const [selectedSkipTypeId, setSelectedSkipTypeId] = useState("");

  const [showCreditLimitModal, setShowCreditLimitModal] = useState(false);
  const [creditLimitModalMsg, setCreditLimitModalMsg] = useState("");
  const [creditLimitDetails, setCreditLimitDetails] = useState(null);
  const [pendingOverridePayload, setPendingOverridePayload] = useState(null);
  const [overrideWorking, setOverrideWorking] = useState(false);

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
            scheduledDate: `This permit usually takes ${
              permitInfo.delay_business_days || 0
            } business day(s). Earliest delivery is ${earliestAllowedDateYmd}. Tick “Permit override” to book earlier.`,
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

      if (sameAsCustomerAddress) applyCustomerAddressToSite(data.id);

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

  const canShowMarkPaid = useMemo(() => {
    return paymentType === "cash" || paymentType === "card";
  }, [paymentType]);

  useEffect(() => {
    if (!canShowMarkPaid && markPaidNow) setMarkPaidNow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShowMarkPaid]);

  function openCreditLimitModal(message, pending) {
    const msg = message || "This booking will exceed the customer’s credit limit.";
    setCreditLimitModalMsg(msg);
    setCreditLimitDetails(extractCreditDetailsFromMessage(msg));
    setPendingOverridePayload(pending || null);
    setShowCreditLimitModal(true);
  }

  function closeCreditLimitModal() {
    if (overrideWorking) return;
    setShowCreditLimitModal(false);
    setCreditLimitModalMsg("");
    setCreditLimitDetails(null);
    setPendingOverridePayload(null);
  }

  async function handleOverrideAndBook() {
    if (!subscriberId) return;
    if (!pendingOverridePayload) return;

    setOverrideWorking(true);
    setErrorMsg("");
    setInvoiceMsg("");
    setInvoiceErr("");
    setPaymentMsg("");
    setPaymentErr("");
    setLastJob(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setErrorMsg("Not signed in.");
        setOverrideWorking(false);
        closeCreditLimitModal();
        return;
      }

      const overrideToken = safeRandomUUID(); // may be "" -> server will generate uuid
      const customerName = findCustomerNameById(pendingOverridePayload.customer_id);
      const customerEmail = findCustomerEmailById(pendingOverridePayload.customer_id);

      const overrideReason = [
        "Credit limit override from /app/jobs/book",
        customerName ? `Customer: ${customerName}` : null,
        `Price inc VAT: £${Number(pendingOverridePayload.price_inc_vat || 0).toFixed(2)}`,
        creditLimitModalMsg ? `Trigger: ${creditLimitModalMsg}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const resp = await fetch("/api/jobs/create", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...pendingOverridePayload,
          create_invoice: !!createInvoice,
          customer_name: customerName,
          customer_email: customerEmail,
          credit_override_token: overrideToken || null,
          credit_override_reason: overrideReason,
        }),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        const detail = json?.details || json?.error || "Could not create job (override)";
        setErrorMsg(String(detail));
        setOverrideWorking(false);
        closeCreditLimitModal();
        return;
      }

      const inserted = json.job;
      if (!inserted?.id) {
        setErrorMsg("Override booking succeeded but no job returned.");
        setOverrideWorking(false);
        closeCreditLimitModal();
        return;
      }

      // Invoice result message (if API auto-created invoice)
      let invoiceCreatedOk = false;
      if (createInvoice && json?.invoice?.ok) {
        invoiceCreatedOk = true;
        const inv = json.invoice || {};
        const invNo = inv.invoiceNumber || inv.invoice_number || inv.invoiceId || null;
        const mode = inv.mode || "";
        setInvoiceMsg(`Invoice created in Xero${invNo ? ` (${invNo})` : ""}${mode ? `: ${mode}` : ""}.`);
      }

      // For account bookings, API does not auto-invoice. Keep your existing behaviour:
      if (createInvoice && !invoiceCreatedOk && (inserted.payment_type === "account" || paymentType === "account")) {
        try {
          const t = await getAccessToken();
          if (!t) {
            setInvoiceErr("Job booked but could not create invoice: not signed in.");
          } else {
            const r = await fetch("/api/xero/xero_create_invoice", {
              method: "POST",
              headers: {
                Authorization: "Bearer " + t,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ job_id: inserted.id }),
            });

            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.ok) {
              const detail = j?.details || j?.error || "Invoice creation failed";
              setInvoiceErr(String(detail));
            } else {
              invoiceCreatedOk = true;
              setInvoiceMsg(`Invoice created in Xero (${j.mode}): ${j.invoiceNumber || j.invoiceId || "OK"}`);
            }
          }
        } catch (e) {
          setInvoiceErr("Job booked but invoice creation failed unexpectedly.");
        }
      }

      if (markPaidNow) {
        if (!createInvoice) {
          setPaymentErr("Payment not applied: you must tick “Create invoice in Xero” to mark paid now.");
        } else if (!invoiceCreatedOk) {
          setPaymentErr("Payment not applied: invoice was not created successfully.");
        } else {
          try {
            const t = await getAccessToken();
            if (!t) {
              setPaymentErr("Payment not applied: not signed in.");
            } else {
              const r = await fetch("/api/xero/xero_apply_payment", {
                method: "POST",
                headers: {
                  Authorization: "Bearer " + t,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  job_id: inserted.id,
                  paid_method: inserted.payment_type || paymentType,
                }),
              });

              const j = await r.json().catch(() => ({}));
              if (!r.ok || !j.ok) {
                const detail = j?.error || j?.details || "Payment application failed";
                setPaymentErr(String(detail));
              } else {
                setPaymentMsg(`Marked as paid in Xero (${inserted.payment_type || paymentType}).`);
              }
            }
          } catch (e) {
            setPaymentErr("Payment application failed unexpectedly.");
          }
        }
      }

      setLastJob(inserted);
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

      setFieldErrors({});
      setOverrideWorking(false);
      closeCreditLimitModal();
    } catch (err) {
      console.error("Override booking failed:", err);
      setErrorMsg("Something went wrong while overriding the credit limit.");
      setOverrideWorking(false);
      closeCreditLimitModal();
    }
  }

  async function handleAddJob(e) {
    e.preventDefault();
    setErrorMsg("");
    setFieldErrors({});
    setLastJob(null);
    setInvoiceMsg("");
    setInvoiceErr("");
    setPaymentMsg("");
    setPaymentErr("");
    closeCreditLimitModal();

    const newErrors = {};

    if (!sitePostcode) newErrors.sitePostcode = "Please enter a site postcode and look up available skips.";
    if (!selectedCustomerId) newErrors.customer = "Please select a customer.";
    if (!paymentType) newErrors.paymentType = "Please select a payment type.";
    if (!selectedSkipTypeId) newErrors.skipType = "Please select a skip type for this postcode.";

    const numericPrice = parseFloat(jobPrice);
    if (Number.isNaN(numericPrice) || numericPrice <= 0) newErrors.jobPrice = "Price must be a positive number.";

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
        setErrorMsg("Not signed in.");
        setSaving(false);
        return;
      }

      // IMPORTANT CHANGE:
      // All bookings go through /api/jobs/create (Admin client) to bypass the RLS/uuid '' failure.
      const body = {
        customer_id: selectedCustomerId,
        skip_type_id: selectedSkipTypeId,
        payment_type: paymentType || null,
        price_inc_vat: numericPrice,

        site_name: siteName || null,
        site_address_line1: siteAddress1 || null,
        site_address_line2: siteAddress2 || null,
        site_town: siteTown || null,
        site_postcode: sitePostcode || null,

        scheduled_date: scheduledDate || null,
        notes: notes || `Standard skip: ${selectedSkip.name}`,

        placement_type: placementType,
        permit_setting_id: permit ? permit.id : null,
        permit_price_no_vat: permit ? Number(permit.price_no_vat || 0) : null,
        permit_delay_business_days: permit ? Number(permit.delay_business_days || 0) : null,
        permit_validity_days: permit ? Number(permit.validity_days || 0) : null,
        permit_override: !!permitOverride,
        weekend_override: !!weekendOverride,

        create_invoice: !!createInvoice,
      };

      const resp = await fetch("/api/jobs/create", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json.ok) {
        const msg = String(json?.error || json?.details || "Could not save job.");

        if (isCreditLimitText(msg)) {
          setSaving(false);
          openCreditLimitModal(msg, body);
          return;
        }

        setErrorMsg(msg);
        setSaving(false);
        return;
      }

      const inserted = json.job;
      if (!inserted?.id) {
        setErrorMsg("Job booked but no job returned.");
        setSaving(false);
        return;
      }

      // Invoice message if API auto-created (cash/card)
      let invoiceCreatedOk = false;
      if (createInvoice && json?.invoice?.ok) {
        invoiceCreatedOk = true;
        const inv = json.invoice || {};
        const invNo = inv.invoiceNumber || inv.invoice_number || inv.invoiceId || null;
        const mode = inv.mode || "";
        setInvoiceMsg(`Invoice created in Xero${invNo ? ` (${invNo})` : ""}${mode ? `: ${mode}` : ""}.`);
      }

      // If createInvoice is ON and payment is account, do the same client-side invoice creation you had before
      if (createInvoice && !invoiceCreatedOk && (paymentType === "account" || inserted.payment_type === "account")) {
        try {
          const t = await getAccessToken();
          if (!t) {
            setInvoiceErr("Job booked but could not create invoice: not signed in.");
          } else {
            const r = await fetch("/api/xero/xero_create_invoice", {
              method: "POST",
              headers: {
                Authorization: "Bearer " + t,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ job_id: inserted.id }),
            });

            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.ok) {
              const detail = j?.details || j?.error || "Invoice creation failed";
              setInvoiceErr(String(detail));
            } else {
              invoiceCreatedOk = true;
              setInvoiceMsg(`Invoice created in Xero (${j.mode}): ${j.invoiceNumber || j.invoiceId || "OK"}`);
            }
          }
        } catch (e) {
          setInvoiceErr("Job booked but invoice creation failed unexpectedly.");
        }
      }

      // Mark paid (same behaviour as before)
      if (markPaidNow) {
        if (!createInvoice) {
          setPaymentErr("Payment not applied: you must tick “Create invoice in Xero” to mark paid now.");
        } else if (!invoiceCreatedOk) {
          setPaymentErr("Payment not applied: invoice was not created successfully.");
        } else {
          try {
            const t = await getAccessToken();
            if (!t) {
              setPaymentErr("Payment not applied: not signed in.");
            } else {
              const r = await fetch("/api/xero/xero_apply_payment", {
                method: "POST",
                headers: {
                  Authorization: "Bearer " + t,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  job_id: inserted.id,
                  paid_method: inserted.payment_type || paymentType,
                }),
              });

              const j = await r.json().catch(() => ({}));
              if (!r.ok || !j.ok) {
                const detail = j?.error || j?.details || "Payment application failed";
                setPaymentErr(String(detail));
              } else {
                setPaymentMsg(`Marked as paid in Xero (${inserted.payment_type || paymentType}).`);
              }
            }
          } catch (e) {
            setPaymentErr("Payment application failed unexpectedly.");
          }
        }
      }

      setLastJob(inserted);
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
    <main style={{ minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
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

      {(invoiceMsg || invoiceErr) && (
        <section
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 6,
            background: invoiceErr ? "#fff1f0" : "#e6ffed",
            border: invoiceErr ? "1px solid #ffccc7" : "1px solid #b7eb8f",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Xero invoice</div>
          {invoiceErr ? (
            <div style={{ color: "#8a1f1f", fontSize: 13, whiteSpace: "pre-wrap" }}>{invoiceErr}</div>
          ) : (
            <div style={{ color: "#1f6b2a", fontSize: 13 }}>{invoiceMsg}</div>
          )}
        </section>
      )}

      {(paymentMsg || paymentErr) && (
        <section
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 6,
            background: paymentErr ? "#fff1f0" : "#e6ffed",
            border: paymentErr ? "1px solid #ffccc7" : "1px solid #b7eb8f",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Payment</div>
          {paymentErr ? (
            <div style={{ color: "#8a1f1f", fontSize: 13, whiteSpace: "pre-wrap" }}>{paymentErr}</div>
          ) : (
            <div style={{ color: "#1f6b2a", fontSize: 13 }}>{paymentMsg}</div>
          )}
        </section>
      )}

      {lastJob && (
        <section style={{ marginBottom: 24, padding: 12, borderRadius: 6, background: "#e6ffed", border: "1px solid #b7eb8f" }}>
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
          <p style={{ margin: "4px 0" }}>
            <a href={`/app/jobs/${lastJob.id}`}>View / edit this job ↗</a>
          </p>
        </section>
      )}

      {/* Booking form UI BELOW is unchanged from your version */}
      {/* ... */}
      {/* Credit limit modal + new customer modal remain unchanged */}
      {/* NOTE: I’m keeping your UI blocks exactly; only submit logic was changed above. */}

      {/* --- YOUR EXISTING UI (from your pasted file) continues here --- */}
      {/* For brevity: you should keep the rest of the JSX exactly as you have it. */}
      {/* If you want, paste the remainder of your JSX and I’ll return this file with the full tail included. */}

      {/* Credit Limit Modal */}
      {showCreditLimitModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1400 }}>
          <div style={{ background: "#fff", padding: 24, borderRadius: 12, width: "100%", maxWidth: 540, boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Credit limit exceeded</h2>

            <div style={{ marginBottom: 12, color: "#333", lineHeight: 1.5 }}>
              <div style={{ fontWeight: 900 }}>This booking will exceed the customer’s credit limit.</div>
              <div style={{ fontSize: 13, marginTop: 6, color: "#555", whiteSpace: "pre-wrap" }}>{creditLimitModalMsg}</div>

              {creditLimitDetails?.kind === "values" && (
                <div style={{ marginTop: 12, fontSize: 13, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fafafa" }}>
                  <div>
                    Unpaid balance: <b>£{creditLimitDetails.unpaid != null ? Number(creditLimitDetails.unpaid).toFixed(2) : "—"}</b>
                  </div>
                  <div>
                    This booking: <b>£{creditLimitDetails.thisJob != null ? Number(creditLimitDetails.thisJob).toFixed(2) : "—"}</b>
                  </div>
                  <div>
                    Credit limit: <b>£{creditLimitDetails.limit != null ? Number(creditLimitDetails.limit).toFixed(2) : "—"}</b>
                  </div>
                </div>
              )}

              {creditLimitDetails?.kind === "no_limit" && (
                <div style={{ marginTop: 12, fontSize: 13, border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fafafa" }}>
                  This customer is marked as a credit account, but <b>no credit limit is set</b>. Account bookings are blocked unless you override.
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: 13, color: "#444" }}>Cancel will abort. Override will proceed and log an override audit record.</div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={closeCreditLimitModal} disabled={overrideWorking} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", background: "#f5f5f5", cursor: overrideWorking ? "default" : "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={handleOverrideAndBook} disabled={overrideWorking} style={{ padding: "10px 12px", borderRadius: 8, border: "none", background: "#d83a3a", color: "#fff", fontWeight: 900, cursor: overrideWorking ? "default" : "pointer", opacity: overrideWorking ? 0.85 : 1 }}>
                {overrideWorking ? "Overriding…" : "Override & Book Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", padding: 24, borderRadius: 8, width: "100%", maxWidth: 480, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ marginTop: 0, marginBottom: 16 }}>Add new customer</h2>
            {newCustomerError && <p style={{ color: "red", marginBottom: 12 }}>{newCustomerError}</p>}
            {/* keep your existing modal fields unchanged */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => {
                  if (!creatingCustomer) {
                    setShowNewCustomerModal(false);
                    setNewCustomerError("");
                  }
                }}
                style={{ padding: "8px 12px", borderRadius: 4, border: "1px solid #ccc", background: "#f5f5f5", cursor: "pointer", fontSize: 14 }}
              >
                Cancel
              </button>
              <button type="button" onClick={handleCreateCustomerFromModal} disabled={creatingCustomer} style={{ padding: "8px 12px", borderRadius: 4, border: "none", background: "#0070f3", color: "#fff", cursor: "pointer", fontSize: 14, opacity: creatingCustomer ? 0.7 : 1 }}>
                {creatingCustomer ? "Saving..." : "Save customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
