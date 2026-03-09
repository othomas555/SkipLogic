// pages/app/jobs/book-custom.js
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

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

function safeRandomUUIDOrNull() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function isCreditLimitErrorPayload(json, respStatus) {
  const code = String(json?.code || "");
  const msg = String(json?.error || json?.details || "");
  if (code === "P0001" && msg.toLowerCase().includes("credit limit exceeded")) return true;
  if (respStatus === 400 && msg.toLowerCase().includes("credit limit exceeded")) return true;
  return false;
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

function FieldError({ children }) {
  if (!children) return null;
  return <div style={styles.fieldError}>{children}</div>;
}

function SectionCard({ title, subtitle, children }) {
  return (
    <section style={styles.sectionCard}>
      <div style={styles.sectionCardHeader}>
        <div>
          <h3 style={styles.sectionCardTitle}>{title}</h3>
          {subtitle ? <div style={styles.sectionCardSubtitle}>{subtitle}</div> : null}
        </div>
      </div>
      <div style={styles.sectionCardBody}>{children}</div>
    </section>
  );
}

export default function BookCustomJobPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [permitSettings, setPermitSettings] = useState([]);

  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [toasts, setToasts] = useState([]);
  function pushToast({ type = "info", title = "", message = "", durationMs = 6000 } = {}) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = { id, type, title, message };
    setToasts((prev) => [...prev, toast]);

    const ms = Number(durationMs);
    if (Number.isFinite(ms) && ms > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ms);
    }
  }
  function removeToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function toastFromFormErrors(errorsObj) {
    const keys = Object.keys(errorsObj || {});
    if (keys.length === 0) return;
    const firstKey = keys[0];
    const firstMsg = errorsObj[firstKey];
    const more = keys.length > 1 ? ` (+${keys.length - 1} more)` : "";
    pushToast({
      type: "error",
      title: "Fix the form",
      message: `${String(firstMsg || "Please check the highlighted fields.")}${more}`,
      durationMs: 8000,
    });
  }

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

  const [customSkipDescription, setCustomSkipDescription] = useState("");
  const [jobPrice, setJobPrice] = useState("");

  const [placementType, setPlacementType] = useState("private");
  const [selectedPermitId, setSelectedPermitId] = useState("");
  const [permitOverride, setPermitOverride] = useState(false);
  const [weekendOverride, setWeekendOverride] = useState(false);

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

  const [showCreditLimitModal, setShowCreditLimitModal] = useState(false);
  const [creditLimitModalMsg, setCreditLimitModalMsg] = useState("");
  const [creditLimitDetails, setCreditLimitDetails] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [creditOverrideWorking, setCreditOverrideWorking] = useState(false);

  useEffect(() => {
    if (checking) return;
    if (authError) {
      pushToast({ type: "error", title: "Auth error", message: String(authError), durationMs: 10000 });
    }
  }, [checking, authError]);

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;

    async function loadData() {
      setErrorMsg("");

      const { data: customerData, error: customersError } = await supabase
        .from("customers")
        .select(`
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
        `)
        .eq("subscriber_id", subscriberId)
        .order("last_name", { ascending: true });

      if (customersError) {
        console.error("Customers error:", customersError);
        setErrorMsg("Could not load customers.");
        pushToast({ type: "error", title: "Load failed", message: "Could not load customers.", durationMs: 9000 });
        return;
      }

      setCustomers(customerData || []);

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
    if (c.company_name) return `${c.company_name} – ${baseName || "Unknown contact"}`;
    return baseName || "Unknown customer";
  }

  function findCustomerNameById(customerId) {
    const c = customers.find((cust) => cust.id === customerId);
    if (!c) return "Unknown customer";
    const baseName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (c.company_name) return `${c.company_name} – ${baseName || "Unknown contact"}`;
    return baseName || "Unknown customer";
  }

  function findCustomerEmailById(customerId) {
    const c = customers.find((cust) => cust.id === customerId);
    return c?.email || "";
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
    if (checked && selectedCustomerId) applyCustomerAddressToSite(selectedCustomerId);
  }

  const permitInfo = useMemo(() => {
    if (placementType !== "permit") return null;
    if (!selectedPermitId) return null;
    return findPermitById(selectedPermitId);
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
        const msg = "Weekends are blocked. Tick “Weekend override” to allow Saturday/Sunday.";
        setFieldErrors((prev) => ({ ...prev, scheduledDate: msg }));
        pushToast({ type: "error", title: "Date not allowed", message: msg, durationMs: 8000 });
      }
      return false;
    }

    if (placementType === "permit" && permitInfo && !permitOverride) {
      if (earliestAllowedDateYmd && nextYmd < earliestAllowedDateYmd) {
        if (showErrors) {
          const msg = `This permit usually takes ${permitInfo.delay_business_days || 0} business day(s). Earliest delivery is ${earliestAllowedDateYmd}. Tick “Permit override” to book earlier.`;
          setFieldErrors((prev) => ({ ...prev, scheduledDate: msg }));
          pushToast({ type: "error", title: "Permit delay", message: msg, durationMs: 9000 });
        }
        return false;
      }
    }

    return true;
  }

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
        .select(`
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
        `)
        .single();

      if (error) {
        console.error("Error creating customer from modal:", error);
        setNewCustomerError(error.message || "Error creating customer");
        pushToast({
          type: "error",
          title: "Customer not saved",
          message: String(error.message || "Error creating customer"),
          durationMs: 9000,
        });
        setCreatingCustomer(false);
        return;
      }

      setCustomers((prev) => [...prev, data]);
      setSelectedCustomerId(data.id);

      if (sameAsCustomerAddress) applyCustomerAddressToSite(data.id);

      pushToast({ type: "success", title: "Customer added", message: "Customer created and selected.", durationMs: 3500 });

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
      pushToast({ type: "error", title: "Customer not saved", message: "Unexpected error creating customer.", durationMs: 9000 });
      setCreatingCustomer(false);
    }
  }

  const permitCostNoVat = useMemo(() => {
    if (placementType !== "permit") return 0;
    const p = placementType === "permit" ? findPermitById(selectedPermitId) : null;
    return p ? Number(p.price_no_vat || 0) : 0;
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
  }, [canShowMarkPaid, markPaidNow]);

  function openCreditLimitModal({ message, payload }) {
    setCreditLimitModalMsg(message || "This booking will exceed the customer’s credit limit.");
    setCreditLimitDetails(extractCreditDetailsFromMessage(message || ""));
    setPendingPayload(payload || null);
    setShowCreditLimitModal(true);
  }

  function closeCreditLimitModal() {
    if (creditOverrideWorking) return;
    setShowCreditLimitModal(false);
    setCreditLimitModalMsg("");
    setCreditLimitDetails(null);
    setPendingPayload(null);
  }

  async function runPostInsertWork(inserted) {
    let invoiceCreatedOk = false;

    if (createInvoice) {
      try {
        const token = await getAccessToken();
        if (!token) {
          setInvoiceErr("Job booked but could not create invoice: not signed in.");
          pushToast({ type: "error", title: "Invoice not created", message: "Job booked but could not create invoice: not signed in.", durationMs: 9000 });
        } else {
          const res = await fetch("/api/xero/xero_create_invoice", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ job_id: inserted.id }),
          });

          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json.ok) {
            const detail = json?.details || json?.error || "Invoice creation failed";
            setInvoiceErr(String(detail));
            pushToast({ type: "error", title: "Invoice not created", message: String(detail), durationMs: 10000 });
          } else {
            invoiceCreatedOk = true;
            const msg = `Invoice created in Xero (${json.mode}): ${json.invoiceNumber || json.invoiceId || "OK"}`;
            setInvoiceMsg(msg);
            pushToast({ type: "success", title: "Invoice created", message: msg, durationMs: 6000 });
          }
        }
      } catch (e) {
        setInvoiceErr("Job booked but invoice creation failed unexpectedly.");
        pushToast({ type: "error", title: "Invoice not created", message: "Job booked but invoice creation failed unexpectedly.", durationMs: 10000 });
      }
    }

    if (markPaidNow) {
      if (!createInvoice) {
        const msg = "Payment not applied: you must tick “Create invoice in Xero” to mark paid now.";
        setPaymentErr(msg);
        pushToast({ type: "error", title: "Payment not applied", message: msg, durationMs: 9000 });
      } else if (!invoiceCreatedOk) {
        const msg = "Payment not applied: invoice was not created successfully.";
        setPaymentErr(msg);
        pushToast({ type: "error", title: "Payment not applied", message: msg, durationMs: 9000 });
      } else {
        try {
          const token = await getAccessToken();
          if (!token) {
            const msg = "Payment not applied: not signed in.";
            setPaymentErr(msg);
            pushToast({ type: "error", title: "Payment not applied", message: msg, durationMs: 9000 });
          } else {
            const res = await fetch("/api/xero/xero_apply_payment", {
              method: "POST",
              headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                job_id: inserted.id,
                paid_method: paymentType,
              }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) {
              const detail = json?.error || json?.details || "Payment application failed";
              setPaymentErr(String(detail));
              pushToast({ type: "error", title: "Payment not applied", message: String(detail), durationMs: 10000 });
            } else {
              const msg = `Marked as paid in Xero (${paymentType}).`;
              setPaymentMsg(msg);
              pushToast({ type: "success", title: "Payment applied", message: msg, durationMs: 6000 });
            }
          }
        } catch (e) {
          const msg = "Payment application failed unexpectedly.";
          setPaymentErr(msg);
          pushToast({ type: "error", title: "Payment not applied", message: msg, durationMs: 10000 });
        }
      }
    }

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
          jobPrice: String(inserted.price_inc_vat ?? ""),
        }),
      });
    } catch (err) {
      console.error("Email send failed:", err);
      pushToast({ type: "info", title: "Email", message: "Booking saved, but email send failed (see console).", durationMs: 8000 });
    }

    setLastJob(inserted);
    setLastJobCustomerName(findCustomerNameById(inserted.customer_id));

    pushToast({
      type: "success",
      title: "Custom job booked",
      message: `Job ${inserted.job_number || inserted.id} created.`,
      durationMs: 6500,
    });

    setSelectedCustomerId("");
    setSiteName("");
    setSiteAddress1("");
    setSiteAddress2("");
    setSiteTown("");
    setSitePostcode("");
    setScheduledDate("");
    setNotes("");
    setPaymentType("card");
    setCustomSkipDescription("");
    setJobPrice("");

    setPlacementType("private");
    setSelectedPermitId("");
    setPermitOverride(false);
    setWeekendOverride(false);
    setSameAsCustomerAddress(false);

    setFieldErrors({});
  }

  async function callBookCustomApi(body) {
    const token = await getAccessToken();
    if (!token) throw new Error("You must be signed in via /login to book a custom job.");

    const res = await fetch("/api/jobs/book-custom", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => ({}));
    return { res, json };
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

    if (showCreditLimitModal) return;

    const newErrors = {};

    if (!selectedCustomerId) newErrors.customer = "Please select a customer.";
    if (!paymentType) newErrors.paymentType = "Please select a payment type.";
    if (!sitePostcode) newErrors.sitePostcode = "Please enter a site postcode.";
    if (!customSkipDescription.trim()) newErrors.customSkipDescription = "Please describe the custom skip/job.";
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
      const msg = "Could not find your subscriber when adding job.";
      setErrorMsg(msg);
      pushToast({ type: "error", title: "Cannot book", message: msg, durationMs: 9000 });
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      toastFromFormErrors(newErrors);
      return;
    }

    setSaving(true);

    try {
      const permit = placementType === "permit" ? findPermitById(selectedPermitId) : null;

      const body = {
        customer_id: selectedCustomerId,
        custom_skip_description: customSkipDescription.trim(),

        site_name: siteName || null,
        site_address_line1: siteAddress1 || null,
        site_address_line2: siteAddress2 || null,
        site_town: siteTown || null,
        site_postcode: sitePostcode || null,

        scheduled_date: scheduledDate || null,
        notes: notes || null,

        payment_type: paymentType || null,
        price_inc_vat: numericPrice,

        placement_type: placementType,
        permit_setting_id: permit ? permit.id : null,
        permit_price_no_vat: permit ? Number(permit.price_no_vat || 0) : null,
        permit_delay_business_days: permit ? Number(permit.delay_business_days || 0) : null,
        permit_validity_days: permit ? Number(permit.validity_days || 0) : null,
        permit_override: !!permitOverride,
        weekend_override: !!weekendOverride,

        create_invoice: !!createInvoice,
      };

      const { res, json } = await callBookCustomApi(body);

      if (!res.ok || !json.ok) {
        if (isCreditLimitErrorPayload(json, res.status)) {
          setSaving(false);
          openCreditLimitModal({
            message: json?.error || json?.details || "Credit limit exceeded",
            payload: body,
          });
          return;
        }

        const msg = json?.error || json?.details || "Could not save custom job.";
        setErrorMsg(String(msg));
        pushToast({ type: "error", title: "Booking failed", message: String(msg), durationMs: 10000 });
        setSaving(false);
        return;
      }

      await runPostInsertWork(json.job);
      setSaving(false);
    } catch (err) {
      console.error("Unexpected error adding custom job:", err);
      const msg = err?.message || "Something went wrong while adding the custom job.";
      setErrorMsg(msg);
      pushToast({ type: "error", title: "Booking failed", message: msg, durationMs: 10000 });
      setSaving(false);
    }
  }

  async function handleOverrideAndBook() {
    if (!pendingPayload) return;

    setCreditOverrideWorking(true);
    setErrorMsg("");
    setInvoiceMsg("");
    setInvoiceErr("");
    setPaymentMsg("");
    setPaymentErr("");

    try {
      const overrideToken = safeRandomUUIDOrNull();
      if (!overrideToken) {
        const msg = "Override failed: this browser cannot generate UUIDs.";
        setErrorMsg(msg);
        pushToast({ type: "error", title: "Override failed", message: msg, durationMs: 10000 });
        setCreditOverrideWorking(false);
        return;
      }

      const overrideReason = `Credit limit override by ${user?.email || "unknown"} on ${new Date().toISOString()}`;

      const body = {
        ...pendingPayload,
        credit_override_token: overrideToken,
        credit_override_reason: overrideReason,
      };

      const { res, json } = await callBookCustomApi(body);

      if (!res.ok || !json.ok) {
        const msg = json?.error || json?.details || "Override booking failed.";
        setErrorMsg(String(msg));
        pushToast({ type: "error", title: "Override failed", message: String(msg), durationMs: 10000 });
        setCreditOverrideWorking(false);
        return;
      }

      try {
        await supabase.rpc("log_job_override", {
          _subscriber_id: subscriberId,
          _job_id: json.job.id,
          _override_type: "credit_limit",
          _reason: `Credit limit override from /app/jobs/book-custom | ${overrideReason}`,
        });
      } catch (logErr) {
        console.error("log_job_override failed:", logErr);
        pushToast({
          type: "info",
          title: "Override logged?",
          message: "Booking succeeded, but override logging failed (see console).",
          durationMs: 9000,
        });
      }

      await runPostInsertWork(json.job);

      setCreditOverrideWorking(false);
      closeCreditLimitModal();
    } catch (err) {
      console.error("Unexpected error in override booking:", err);
      const msg = err?.message || "Override booking failed unexpectedly.";
      setErrorMsg(msg);
      pushToast({ type: "error", title: "Override failed", message: msg, durationMs: 10000 });
      setCreditOverrideWorking(false);
    }
  }

  if (checking) {
    return (
      <main style={styles.loadingWrap}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.toastStack}>
        {toasts.map((t) => {
          const bg =
            t.type === "error" ? "#fff1f0" : t.type === "success" ? "#e6ffed" : t.type === "info" ? "#eef5ff" : "#f5f5f5";
          const border =
            t.type === "error" ? "1px solid #ffccc7" : t.type === "success" ? "1px solid #b7eb8f" : t.type === "info" ? "1px solid #b6d4fe" : "1px solid #ddd";
          const titleColor = t.type === "error" ? "#8a1f1f" : t.type === "success" ? "#1f6b2a" : "#1d3b6a";

          return (
            <div key={t.id} style={{ ...styles.toast, background: bg, border }}>
              <div style={styles.toastHead}>
                <div style={{ ...styles.toastTitle, color: titleColor }}>{t.title || "Notice"}</div>
                <button type="button" onClick={() => removeToast(t.id)} style={styles.toastClose} aria-label="Dismiss">
                  ×
                </button>
              </div>
              {t.message ? <div style={styles.toastMessage}>{t.message}</div> : null}
            </div>
          );
        })}
      </div>

      <header style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Book a Custom Skip / Job</h1>
          {user?.email ? <p style={styles.pageSub}>Signed in as {user.email}</p> : null}
          <p style={styles.backRow}>
            <a href="/app/jobs" style={styles.backLink}>
              ← Back to jobs list
            </a>
          </p>
        </div>
      </header>

      {lastJob && (
        <section style={styles.successBanner}>
          <h2 style={styles.successTitle}>Custom job booked</h2>
          <p style={styles.successText}>
            Job number: <strong>{lastJob.job_number || lastJob.id}</strong>
          </p>
          <p style={styles.successText}>
            Customer: {lastJobCustomerName}
            <br />
            Custom: {lastJob.custom_skip_description || customSkipDescription || "—"}
            <br />
            Site: {lastJob.site_name ? `${lastJob.site_name}, ${lastJob.site_postcode || ""}` : lastJob.site_postcode || ""}
            <br />
            Price (inc VAT): £{lastJob.price_inc_vat != null ? Number(lastJob.price_inc_vat).toFixed(2) : "N/A"}
            {lastJob.placement_type === "permit" ? (
              <>
                <br />
                Permit (NO VAT): £{lastJob.permit_price_no_vat != null ? Number(lastJob.permit_price_no_vat).toFixed(2) : "0.00"}
              </>
            ) : null}
          </p>
          <p style={styles.successText}>
            <a href={`/app/jobs/${lastJob.id}`}>View / edit this job ↗</a>
          </p>
        </section>
      )}

      <section className="sl-page-surface" style={styles.formSurface}>
        <form onSubmit={handleAddJob}>
          <SectionCard
            title="Custom job details"
            subtitle="Describe exactly what this specialist skip or out-of-standard job is, then enter the price manually."
          >
            <div style={styles.fieldBlock}>
              <label style={styles.label}>Custom skip / job description *</label>
              <input
                type="text"
                value={customSkipDescription}
                onChange={(e) => {
                  setCustomSkipDescription(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, customSkipDescription: undefined }));
                }}
                placeholder="e.g. 40yd RoRo – cardboard only"
                style={styles.input}
              />
              <div style={styles.hintText}>
                This is what makes the job custom. Keep it clear and specific.
              </div>
              <FieldError>{fieldErrors.customSkipDescription}</FieldError>
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Manual price for this job (inc VAT) (£) *</label>
              <input
                type="number"
                step="0.01"
                value={jobPrice}
                onChange={(e) => {
                  setJobPrice(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, jobPrice: undefined }));
                }}
                style={styles.priceInput}
              />
              <div style={styles.hintText}>Enter the selling price manually. This does not use postcode pricing.</div>
              <FieldError>{fieldErrors.jobPrice}</FieldError>
            </div>
          </SectionCard>

          <SectionCard
            title="Customer & Site"
            subtitle="Choose the customer first, then confirm the delivery address and site details."
          >
            <div style={styles.fieldBlock}>
              <label style={styles.label}>Customer *</label>
              <div style={styles.row}>
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
                    if (sameAsCustomerAddress && id) applyCustomerAddressToSite(id);
                  }}
                  style={styles.inputFlex}
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
                  style={styles.secondaryBtn}
                >
                  + New
                </button>
              </div>
              <FieldError>{fieldErrors.customer}</FieldError>
            </div>

            <div style={styles.checkboxRowWrap}>
              <label style={styles.checkboxLabelLight}>
                <input
                  type="checkbox"
                  checked={sameAsCustomerAddress}
                  disabled={!selectedCustomerId}
                  onChange={(e) => handleSameAsCustomerToggle(e.target.checked)}
                />
                <span>Site address same as customer</span>
              </label>
              {!selectedCustomerId ? <div style={styles.hintText}>Select a customer first to use this.</div> : null}
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Site name / description (optional)</label>
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g. Rear yard, Transfer station, Unit 5"
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Site address line 1</label>
              <input
                type="text"
                value={siteAddress1}
                onChange={(e) => setSiteAddress1(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Site address line 2 (optional)</label>
              <input
                type="text"
                value={siteAddress2}
                onChange={(e) => setSiteAddress2(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Town</label>
              <input
                type="text"
                value={siteTown}
                onChange={(e) => setSiteTown(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Site postcode *</label>
              <input
                type="text"
                value={sitePostcode}
                onChange={(e) => {
                  setSitePostcode(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, sitePostcode: undefined }));
                }}
                placeholder="CF32 7AB"
                style={styles.input}
              />
              <div style={styles.hintText}>Custom jobs can be outside your normal postcode pricing area.</div>
              <FieldError>{fieldErrors.sitePostcode}</FieldError>
            </div>
          </SectionCard>

          <SectionCard
            title="Placement, Date & Payment"
            subtitle="Choose whether the skip is on private ground or requires a road permit, then confirm date and payment."
          >
            <div style={styles.fieldBlock}>
              <label style={styles.label}>Placement</label>
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
                style={styles.select}
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
                <div style={styles.infoBox}>
                  Permit: <b>{permitInfo.name}</b> — £{Number(permitInfo.price_no_vat || 0).toFixed(2)} (NO VAT).
                  <br />
                  Typical approval delay: <b>{Number(permitInfo.delay_business_days || 0)}</b> business day(s). Earliest delivery: <b>{earliestAllowedDateYmd || "—"}</b>.
                </div>
              ) : null}

              <FieldError>{fieldErrors.placement}</FieldError>
            </div>

            <div style={styles.toggleGrid}>
              <label style={styles.checkboxLabelLight}>
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
                <span>Weekend override (allow Saturday/Sunday)</span>
              </label>

              <label
                style={{
                  ...styles.checkboxLabelLight,
                  opacity: placementType === "permit" ? 1 : 0.55,
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
                <span>Permit override (book earlier than approval delay)</span>
              </label>
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Delivery date</label>
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
                style={styles.dateInput}
              />
              <div style={styles.hintText}>Weekends are blocked by default. Permit delays count Mon–Fri only.</div>
              <FieldError>{fieldErrors.scheduledDate}</FieldError>
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Payment type</label>
              <select
                value={paymentType}
                onChange={(e) => {
                  setPaymentType(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, paymentType: undefined }));
                }}
                disabled={!selectedCustomerId}
                style={styles.select}
              >
                <option value="">Select payment type</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="account">Account</option>
              </select>
              {!selectedCustomerId ? <div style={styles.hintText}>Select a customer to choose payment type.</div> : null}
              <FieldError>{fieldErrors.paymentType}</FieldError>
            </div>
          </SectionCard>

          <SectionCard
            title="Charges & Notes"
            subtitle="Review the amount to charge, decide whether to invoice immediately, and add any notes."
          >
            <div style={styles.chargeBox}>
              <div style={styles.chargeTitle}>Charges</div>
              <div style={styles.chargeLine}>
                <span>Custom job (inc VAT):</span>
                <b>£{numericSkipPriceIncVat.toFixed(2)}</b>
              </div>
              <div style={styles.chargeLine}>
                <span>Permit (NO VAT):</span>
                <b>£{permitCostNoVat.toFixed(2)}</b>
              </div>
              <div style={styles.chargeTotal}>
                <span>Total to charge:</span>
                <b>£{totalChargeDisplay.toFixed(2)}</b>
              </div>
            </div>

            <div style={styles.togglePanel}>
              <label style={styles.checkboxLabelLight}>
                <input type="checkbox" checked={createInvoice} onChange={(e) => setCreateInvoice(e.target.checked)} />
                <span>Create invoice in Xero</span>
              </label>
              <div style={styles.hintText}>If ticked, SkipLogic will create the invoice immediately after booking.</div>
            </div>

            <div style={styles.togglePanel}>
              <label
                style={{
                  ...styles.checkboxLabelLight,
                  opacity: canShowMarkPaid ? 1 : 0.55,
                }}
                title={canShowMarkPaid ? "" : "Mark paid is only available for cash/card bookings"}
              >
                <input
                  type="checkbox"
                  checked={markPaidNow}
                  disabled={!canShowMarkPaid}
                  onChange={(e) => setMarkPaidNow(e.target.checked)}
                />
                <span>Mark invoice as paid now (applies payment in Xero)</span>
              </label>
              <div style={styles.hintText}>
                Only use this if you have taken the payment now (cash/card). Requires “Create invoice in Xero”.
              </div>
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                style={styles.textarea}
                placeholder="Operational notes, access info, waste notes, special instructions..."
              />
            </div>
          </SectionCard>

          <div style={styles.footerBar}>
            <div style={styles.footerMeta}>
              {invoiceMsg ? <div style={styles.metaSuccess}>{invoiceMsg}</div> : null}
              {invoiceErr ? <div style={styles.metaError}>{invoiceErr}</div> : null}
              {paymentMsg ? <div style={styles.metaSuccess}>{paymentMsg}</div> : null}
              {paymentErr ? <div style={styles.metaError}>{paymentErr}</div> : null}
              {errorMsg ? <div style={styles.metaError}>{errorMsg}</div> : null}
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{
                ...styles.submitBtn,
                opacity: saving ? 0.75 : 1,
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Book Custom Job"}
            </button>
          </div>
        </form>
      </section>

      {showCreditLimitModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h2 style={styles.modalTitle}>Credit limit exceeded</h2>

            <div style={styles.modalBody}>
              <div style={styles.modalLead}>This booking will exceed the customer’s credit limit.</div>
              <div style={styles.modalText}>{creditLimitModalMsg}</div>

              {creditLimitDetails?.kind === "values" && (
                <div style={styles.modalInfoBox}>
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
                <div style={styles.modalInfoBox}>
                  This customer is marked as a credit account, but <b>no credit limit is set</b>. Account bookings are blocked unless you override.
                </div>
              )}

              <div style={styles.modalHelp}>
                If you override, the booking will proceed and an override audit record will be logged.
              </div>
            </div>

            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={closeCreditLimitModal}
                disabled={creditOverrideWorking}
                style={styles.modalCancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOverrideAndBook}
                disabled={creditOverrideWorking}
                style={{
                  ...styles.modalDangerBtn,
                  opacity: creditOverrideWorking ? 0.85 : 1,
                }}
              >
                {creditOverrideWorking ? "Overriding…" : "Override & Book Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewCustomerModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCardLarge}>
            <h2 style={styles.modalTitle}>Add new customer</h2>

            {newCustomerError ? <p style={styles.modalError}>{newCustomerError}</p> : null}

            <div style={styles.modalFormGrid}>
              <div style={styles.fieldBlock}>
                <label style={styles.label}>First Name *</label>
                <input
                  type="text"
                  value={newCustomerFirstName}
                  onChange={(e) => setNewCustomerFirstName(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.label}>Last Name *</label>
                <input
                  type="text"
                  value={newCustomerLastName}
                  onChange={(e) => setNewCustomerLastName(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.label}>Company Name (optional)</label>
                <input
                  type="text"
                  value={newCustomerCompanyName}
                  onChange={(e) => setNewCustomerCompanyName(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.label}>Customer Email *</label>
                <input
                  type="email"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.label}>Customer Phone *</label>
                <input
                  type="tel"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.label}>Address Line 1 *</label>
                <input
                  type="text"
                  value={newCustomerAddress1}
                  onChange={(e) => setNewCustomerAddress1(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.label}>Address Line 2 *</label>
                <input
                  type="text"
                  value={newCustomerAddress2}
                  onChange={(e) => setNewCustomerAddress2(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.label}>Address Line 3 (optional)</label>
                <input
                  type="text"
                  value={newCustomerAddress3}
                  onChange={(e) => setNewCustomerAddress3(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.label}>Postcode *</label>
                <input
                  type="text"
                  value={newCustomerPostcode}
                  onChange={(e) => setNewCustomerPostcode(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.checkboxLabelLight}>
                  <input
                    type="checkbox"
                    checked={newCustomerCreditAccount}
                    onChange={(e) => setNewCustomerCreditAccount(e.target.checked)}
                  />
                  <span>Credit Account Customer</span>
                </label>
              </div>
            </div>

            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => {
                  if (!creatingCustomer) {
                    setShowNewCustomerModal(false);
                    setNewCustomerError("");
                  }
                }}
                style={styles.modalCancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCustomerFromModal}
                disabled={creatingCustomer}
                style={{
                  ...styles.modalPrimaryBtn,
                  opacity: creatingCustomer ? 0.8 : 1,
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

const styles = {
  loadingWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-sans)",
  },

  page: {
    minHeight: "100vh",
    padding: 24,
    fontFamily: "var(--font-sans)",
  },

  toastStack: {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 2000,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: 380,
    maxWidth: "calc(100vw - 32px)",
    pointerEvents: "none",
  },

  toast: {
    borderRadius: 12,
    padding: 12,
    boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
    pointerEvents: "auto",
  },

  toastHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },

  toastTitle: {
    fontWeight: 900,
    fontSize: 14,
  },

  toastClose: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
    padding: 2,
  },

  toastMessage: {
    marginTop: 6,
    fontSize: 13,
    color: "#333",
    whiteSpace: "pre-wrap",
  },

  header: {
    marginBottom: 18,
  },

  pageTitle: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.1,
    color: "var(--d-ink)",
    letterSpacing: "-0.02em",
  },

  pageSub: {
    marginTop: 10,
    marginBottom: 0,
    fontSize: 14,
    color: "var(--d-muted)",
  },

  backRow: {
    marginTop: 12,
    marginBottom: 0,
  },

  backLink: {
    fontSize: 14,
    color: "#8ecbff",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },

  successBanner: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 12,
    background: "#e6ffed",
    border: "1px solid #b7eb8f",
    maxWidth: 980,
  },

  successTitle: {
    margin: 0,
    fontSize: 16,
    color: "#14532d",
  },

  successText: {
    margin: "6px 0 0",
    color: "#14532d",
    lineHeight: 1.5,
  },

  formSurface: {
    maxWidth: 980,
    padding: 18,
  },

  sectionCard: {
    background: "#f8fafc",
    border: "1px solid #dbe3f0",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },

  sectionCardHeader: {
    padding: "14px 16px 10px",
    borderBottom: "1px solid #e6edf5",
    background: "#f3f7fb",
  },

  sectionCardTitle: {
    margin: 0,
    fontSize: 20,
    color: "#0f172a",
    letterSpacing: "-0.01em",
  },

  sectionCardSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.45,
  },

  sectionCardBody: {
    padding: 16,
  },

  fieldBlock: {
    marginBottom: 14,
  },

  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },

  hintText: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.45,
  },

  fieldError: {
    marginTop: 6,
    fontSize: 12,
    color: "#b91c1c",
    lineHeight: 1.4,
    fontWeight: 600,
  },

  row: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
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

  inputFlex: {
    flex: 1,
    minWidth: 260,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    boxSizing: "border-box",
  },

  select: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    boxSizing: "border-box",
  },

  priceInput: {
    width: 220,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    textAlign: "right",
    boxSizing: "border-box",
  },

  dateInput: {
    width: 220,
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

  secondaryBtn: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 700,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },

  checkboxRowWrap: {
    marginBottom: 14,
  },

  checkboxLabelLight: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    color: "#0f172a",
    fontWeight: 600,
  },

  infoBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    background: "#eef6ff",
    border: "1px solid #cfe4ff",
    color: "#0f172a",
    fontSize: 13,
    lineHeight: 1.55,
  },

  toggleGrid: {
    display: "grid",
    gap: 10,
    marginBottom: 14,
  },

  chargeBox: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    background: "#f8fafc",
    border: "1px solid #dbe3f0",
  },

  chargeTitle: {
    fontWeight: 900,
    marginBottom: 10,
    color: "#0f172a",
  },

  chargeLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 14,
    color: "#334155",
    marginBottom: 6,
  },

  chargeTotal: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 16,
    color: "#0f172a",
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid #dbe3f0",
    fontWeight: 900,
  },

  togglePanel: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    background: "#f8fafc",
    border: "1px solid #dbe3f0",
  },

  footerBar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
    paddingTop: 4,
  },

  footerMeta: {
    display: "grid",
    gap: 6,
    minWidth: 280,
  },

  metaSuccess: {
    fontSize: 12,
    color: "#166534",
  },

  metaError: {
    fontSize: 12,
    color: "#b91c1c",
  },

  submitBtn: {
    padding: "14px 18px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, var(--brand-mint), rgba(58,181,255,0.9))",
    color: "#071013",
    fontWeight: 900,
    fontSize: 14,
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1200,
    padding: 20,
  },

  modalCard: {
    background: "#fff",
    padding: 24,
    borderRadius: 14,
    width: "100%",
    maxWidth: 520,
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  },

  modalCardLarge: {
    background: "#fff",
    padding: 24,
    borderRadius: 14,
    width: "100%",
    maxWidth: 620,
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    maxHeight: "90vh",
    overflowY: "auto",
  },

  modalTitle: {
    marginTop: 0,
    marginBottom: 16,
    color: "#0f172a",
  },

  modalBody: {
    color: "#334155",
    lineHeight: 1.55,
  },

  modalLead: {
    fontWeight: 800,
    color: "#0f172a",
  },

  modalText: {
    fontSize: 13,
    marginTop: 8,
    color: "#475569",
    whiteSpace: "pre-wrap",
  },

  modalInfoBox: {
    marginTop: 12,
    fontSize: 13,
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 12,
    background: "#f8fafc",
    color: "#0f172a",
    lineHeight: 1.6,
  },

  modalHelp: {
    marginTop: 12,
    fontSize: 13,
    color: "#475569",
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
    flexWrap: "wrap",
  },

  modalCancelBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    cursor: "pointer",
    color: "#0f172a",
    fontWeight: 700,
  },

  modalDangerBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "#d83a3a",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },

  modalPrimaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, var(--brand-mint), rgba(58,181,255,0.9))",
    color: "#071013",
    fontWeight: 900,
    cursor: "pointer",
  },

  modalError: {
    color: "#b91c1c",
    marginBottom: 12,
  },

  modalFormGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
};
