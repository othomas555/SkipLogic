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
  // ymd: "YYYY-MM-DD"
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
  // JS getUTCDay(): Sun=0 .. Sat=6
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
    const dow = dt.getUTCDay(); // 0 Sun .. 6 Sat
    if (dow === 0 || dow === 6) continue; // skip weekends
    remaining -= 1;
  }

  return formatYmdUTC(dt);
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

/**
 * IMPORTANT:
 * credit_override_token is a Postgres UUID column.
 * We MUST send either a real UUID string or null — NEVER "override-123" and NEVER "".
 */
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

function isCreditLimitError(err) {
  const code = err?.code || "";
  const msg = String(err?.message || "");
  if (code !== "P0001") return false;
  // Your trigger raises "Credit limit exceeded..."
  return msg.toLowerCase().includes("credit limit exceeded");
}

function extractCreditDetailsFromMessage(msg) {
  // Expected: "Credit limit exceeded. Unpaid: X, This job: Y, Limit: Z"
  // Or: "Credit limit exceeded (no credit_limit set...)"
  const text = String(msg || "");
  const lower = text.toLowerCase();

  if (lower.includes("no credit_limit set")) {
    return { kind: "no_limit", unpaid: null, thisJob: null, limit: null };
  }

  // Try to parse numbers if present
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

export default function BookJobPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [customers, setCustomers] = useState([]);
  const [skipTypes, setSkipTypes] = useState([]);
  const [permitSettings, setPermitSettings] = useState([]);

  // NOTE: we keep errorMsg for internal use if you ever need it,
  // but we no longer rely on "top of page" banners for user feedback.
  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Toasts (popups) — NEW
  const [toasts, setToasts] = useState([]);
  function pushToast({ type = "info", title = "", message = "", durationMs = 6000 } = {}) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = { id, type, title, message };
    setToasts((prev) => [...prev, toast]);

    // Auto-remove
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

  // Placement / permits
  const [placementType, setPlacementType] = useState("private"); // 'private' | 'permit'
  const [selectedPermitId, setSelectedPermitId] = useState("");
  const [permitOverride, setPermitOverride] = useState(false);
  const [weekendOverride, setWeekendOverride] = useState(false);

  // Postcode → skip + price
  const [postcodeSkips, setPostcodeSkips] = useState([]);
  const [postcodeMsg, setPostcodeMsg] = useState("");
  const [jobPrice, setJobPrice] = useState("");
  const [lookingUpPostcode, setLookingUpPostcode] = useState(false);

  // Create invoice toggle — DEFAULT ON
  const [createInvoice, setCreateInvoice] = useState(true);

  // Mark paid toggle — DEFAULT OFF
  const [markPaidNow, setMarkPaidNow] = useState(false);

  // Invoice result messaging (kept for internal use, but we show popups)
  const [invoiceMsg, setInvoiceMsg] = useState("");
  const [invoiceErr, setInvoiceErr] = useState("");

  // Payment result messaging (kept for internal use, but we show popups)
  const [paymentMsg, setPaymentMsg] = useState("");
  const [paymentErr, setPaymentErr] = useState("");

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
  const [newCustomerCreditAccount, setNewCustomerCreditAccount] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState("");

  // Last booked job for visual confirmation
  const [lastJob, setLastJob] = useState(null);
  const [lastJobCustomerName, setLastJobCustomerName] = useState("");
  const [lastJobSkipName, setLastJobSkipName] = useState("");

  const [selectedSkipTypeId, setSelectedSkipTypeId] = useState("");

  // Credit-limit modal
  const [showCreditLimitModal, setShowCreditLimitModal] = useState(false);
  const [creditLimitModalMsg, setCreditLimitModalMsg] = useState("");
  const [creditLimitDetails, setCreditLimitDetails] = useState(null);
  const [pendingInsertPayload, setPendingInsertPayload] = useState(null);
  const [pendingNumericPrice, setPendingNumericPrice] = useState(null);
  const [creditOverrideWorking, setCreditOverrideWorking] = useState(false);

  useEffect(() => {
    if (checking) return;

    // Auth/load error as popup
    if (authError) {
      pushToast({ type: "error", title: "Auth error", message: String(authError), durationMs: 10000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, authError]);

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
        pushToast({ type: "error", title: "Load failed", message: "Could not load customers.", durationMs: 9000 });
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
        pushToast({ type: "error", title: "Load failed", message: "Could not load skip types.", durationMs: 9000 });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function findPermitById(permitId) {
    return permitSettings.find((p) => p.id === permitId) || null;
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

  // Permit date rules
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

    // Weekend rule (hard rule unless weekend_override)
    if (!weekendOverride && isWeekendYmd(nextYmd)) {
      if (showErrors) {
        const msg = "Weekends are blocked. Tick “Weekend override” to allow Saturday/Sunday.";
        setFieldErrors((prev) => ({
          ...prev,
          scheduledDate: msg,
        }));
        pushToast({ type: "error", title: "Date not allowed", message: msg, durationMs: 8000 });
      }
      return false;
    }

    // Permit earliest rule (unless permit_override)
    if (placementType === "permit" && permitInfo && !permitOverride) {
      if (earliestAllowedDateYmd && nextYmd < earliestAllowedDateYmd) {
        if (showErrors) {
          const msg = `This permit usually takes ${permitInfo.delay_business_days || 0} business day(s). Earliest delivery is ${earliestAllowedDateYmd}. Tick “Permit override” to book earlier.`;
          setFieldErrors((prev) => ({
            ...prev,
            scheduledDate: msg,
          }));
          pushToast({ type: "error", title: "Permit delay", message: msg, durationMs: 9000 });
        }
        return false;
      }
    }

    return true;
  }

  // Postcode lookup
  const handleLookupPostcode = async () => {
    setPostcodeMsg("");
    setErrorMsg("");
    setFieldErrors((prev) => ({ ...prev, sitePostcode: undefined }));

    const trimmed = (sitePostcode || "").trim();
    if (!trimmed) {
      setPostcodeMsg("Enter a postcode first.");
      pushToast({ type: "error", title: "Missing postcode", message: "Enter a postcode first.", durationMs: 6000 });
      return;
    }

    if (!subscriberId) {
      setPostcodeMsg("No subscriber found.");
      pushToast({ type: "error", title: "Missing subscriber", message: "No subscriber found.", durationMs: 8000 });
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
        pushToast({
          type: "error",
          title: "No skips found",
          message: "We don't serve this postcode or no prices are set.",
          durationMs: 8000,
        });
        return;
      }

      setPostcodeSkips(results);
      setPostcodeMsg(`Found ${results.length} skip type(s) for this postcode.`);
      pushToast({
        type: "success",
        title: "Skips found",
        message: `Found ${results.length} skip type(s) for this postcode.`,
        durationMs: 3500,
      });
    } catch (err) {
      console.error("handleLookupPostcode error:", err);
      setPostcodeMsg("Error looking up skips for this postcode.");
      pushToast({
        type: "error",
        title: "Lookup failed",
        message: "Error looking up skips for this postcode.",
        durationMs: 9000,
      });
    } finally {
      setLookingUpPostcode(false);
    }
  };

  // Create customer from modal
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
        pushToast({ type: "error", title: "Customer not saved", message: String(error.message || "Error creating customer"), durationMs: 9000 });
        setCreatingCustomer(false);
        return;
      }

      setCustomers((prev) => [...prev, data]);
      setSelectedCustomerId(data.id);

      if (sameAsCustomerAddress) applyCustomerAddressToSite(data.id);

      pushToast({ type: "success", title: "Customer added", message: "Customer created and selected.", durationMs: 3500 });

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
      pushToast({ type: "error", title: "Customer not saved", message: "Unexpected error creating customer.", durationMs: 9000 });
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
    // Only allow "mark paid now" for cash/card bookings (not account).
    return paymentType === "cash" || paymentType === "card";
  }, [paymentType]);

  useEffect(() => {
    // If payment type changes to something we don't support for marking paid, force it off.
    if (!canShowMarkPaid && markPaidNow) setMarkPaidNow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShowMarkPaid]);

  function openCreditLimitModal({ message, payload, numericPrice }) {
    setCreditLimitModalMsg(message || "This booking will exceed the customer’s credit limit.");
    setCreditLimitDetails(extractCreditDetailsFromMessage(message || ""));
    setPendingInsertPayload(payload || null);
    setPendingNumericPrice(Number.isFinite(numericPrice) ? numericPrice : null);
    setShowCreditLimitModal(true);
  }

  function closeCreditLimitModal() {
    if (creditOverrideWorking) return;
    setShowCreditLimitModal(false);
    setCreditLimitModalMsg("");
    setCreditLimitDetails(null);
    setPendingInsertPayload(null);
    setPendingNumericPrice(null);
  }

  async function runPostInsertWork(inserted, { jobPriceValue }) {
    // Create initial delivery event in the job timeline
    const { error: eventError } = await supabase.rpc("create_job_event", {
      _subscriber_id: subscriberId,
      _job_id: inserted.id,
      _event_type: "delivery",
      _scheduled_at: null,
      _completed_at: null,
      _notes: "Initial delivery booked",
    });

    if (eventError) {
      console.error("Create job event error:", eventError);
      throw new Error(`Job was created but the delivery event failed: ${eventError.message}`);
    }

    // If requested, create invoice immediately
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

    // If requested, apply payment in Xero (only after invoice created)
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
          jobPrice: jobPriceValue,
        }),
      });
    } catch (err) {
      console.error("Email send failed:", err);
      // Non-blocking, but tell you
      pushToast({ type: "info", title: "Email", message: "Booking saved, but email send failed (see console).", durationMs: 8000 });
    }

    // Visual confirmation
    setLastJob(inserted);
    setLastJobCustomerName(findCustomerNameById(inserted.customer_id));
    setLastJobSkipName(findSkipTypeNameById(inserted.skip_type_id));

    // Popup success (so you never need to scroll)
    pushToast({
      type: "success",
      title: "Job booked",
      message: `Job ${inserted.job_number || inserted.id} created.`,
      durationMs: 6500,
    });

    // Reset form (IMPORTANT: keep createInvoice as-is, do NOT force it off)
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

    // If modal is open, we should not submit again
    if (showCreditLimitModal) return;

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

    // IMPORTANT: scheduledDate is optional (your UI allows blank)
    // but if present, it must be valid with rules.
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
      const selectedSkip = skipTypes.find((s) => s.id === selectedSkipTypeId);
      if (!selectedSkip) {
        const msg = "Selected skip type not found.";
        setErrorMsg(msg);
        pushToast({ type: "error", title: "Cannot book", message: msg, durationMs: 9000 });
        setSaving(false);
        return;
      }

      const permit = placementType === "permit" ? findPermitById(selectedPermitId) : null;

      const insertPayload = {
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

        // Placement / permit snapshot
        placement_type: placementType,
        permit_setting_id: permit ? permit.id : null,
        permit_price_no_vat: permit ? Number(permit.price_no_vat || 0) : null,
        permit_delay_business_days: permit ? Number(permit.delay_business_days || 0) : null,
        permit_validity_days: permit ? Number(permit.validity_days || 0) : null,
        permit_override: !!permitOverride,
        weekend_override: !!weekendOverride,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("jobs")
        .insert([insertPayload])
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
          price_inc_vat,
          placement_type,
          permit_setting_id,
          permit_price_no_vat,
          permit_delay_business_days,
          permit_validity_days,
          permit_override,
          weekend_override,
          xero_invoice_id,
          xero_invoice_number,
          xero_invoice_status
        `
        )
        .single();

      if (insertError) {
        console.error("Insert job error:", insertError);

        // CREDIT LIMIT → show modal (no popup here; modal is the popup)
        if (isCreditLimitError(insertError)) {
          setSaving(false);
          openCreditLimitModal({
            message: insertError.message,
            payload: insertPayload,
            numericPrice,
          });
          return;
        }

        const msg = insertError.message || "Could not save job.";
        setErrorMsg(msg);
        pushToast({ type: "error", title: "Booking failed", message: msg, durationMs: 10000 });
        setSaving(false);
        return;
      }

      await runPostInsertWork(inserted, { jobPriceValue: jobPrice });
      setSaving(false);
    } catch (err) {
      console.error("Unexpected error adding job:", err);
      const msg = "Something went wrong while adding the job.";
      setErrorMsg(msg);
      pushToast({ type: "error", title: "Booking failed", message: msg, durationMs: 10000 });
      setSaving(false);
    }
  }

  async function handleOverrideAndBook() {
    if (!pendingInsertPayload) return;
    if (!subscriberId) return;

    setCreditOverrideWorking(true);
    setErrorMsg("");
    setInvoiceMsg("");
    setInvoiceErr("");
    setPaymentMsg("");
    setPaymentErr("");

    try {
      const overrideToken = safeRandomUUIDOrNull();
      if (!overrideToken) {
        const msg = "Override failed: this browser cannot generate UUIDs (crypto.randomUUID unavailable).";
        setErrorMsg(msg);
        pushToast({ type: "error", title: "Override failed", message: msg, durationMs: 10000 });
        setCreditOverrideWorking(false);
        return;
      }

      // Only include columns we KNOW exist (from your schema check):
      // - credit_override_token (uuid)
      // - credit_override_reason (text)
      const overrideReason = `Credit limit override by ${user?.email || "unknown"} on ${new Date().toISOString()}`;

      const overridePayload = {
        ...pendingInsertPayload,
        credit_override_token: overrideToken,
        credit_override_reason: overrideReason,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("jobs")
        .insert([overridePayload])
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
          price_inc_vat,
          placement_type,
          permit_setting_id,
          permit_price_no_vat,
          permit_delay_business_days,
          permit_validity_days,
          permit_override,
          weekend_override,
          xero_invoice_id,
          xero_invoice_number,
          xero_invoice_status
        `
        )
        .single();

      if (insertError) {
        console.error("Override insert job error:", insertError);
        const msg = insertError.message || "Override booking failed.";
        setErrorMsg(msg);
        pushToast({ type: "error", title: "Override failed", message: msg, durationMs: 10000 });
        setCreditOverrideWorking(false);
        // keep modal open so you can try again / cancel
        return;
      }

      // Log override via RPC (does not block booking if it fails)
      try {
        const custName = findCustomerNameById(overridePayload.customer_id);
        const reasonParts = ["Credit limit override from /app/jobs/book", `Customer: ${custName}`];
        if (creditLimitModalMsg) reasonParts.push(`Trigger: ${creditLimitModalMsg}`);
        if (pendingNumericPrice != null) reasonParts.push(`This job: ${Number(pendingNumericPrice).toFixed(2)}`);

        await supabase.rpc("log_job_override", {
          _subscriber_id: subscriberId,
          _job_id: inserted.id,
          _override_type: "credit_limit",
          _reason: reasonParts.join(" | "),
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

      // Continue normal post-insert flow
      await runPostInsertWork(inserted, { jobPriceValue: String(pendingInsertPayload.price_inc_vat ?? "") });

      setCreditOverrideWorking(false);
      closeCreditLimitModal();
    } catch (err) {
      console.error("Unexpected error in override booking:", err);
      const msg = "Override booking failed unexpectedly.";
      setErrorMsg(msg);
      pushToast({ type: "error", title: "Override failed", message: msg, durationMs: 10000 });
      setCreditOverrideWorking(false);
      // keep modal open; user can cancel
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
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Toasts (Popups) */}
      <div
        style={{
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
        }}
      >
        {toasts.map((t) => {
          const bg =
            t.type === "error" ? "#fff1f0" : t.type === "success" ? "#e6ffed" : t.type === "info" ? "#eef5ff" : "#f5f5f5";
          const border =
            t.type === "error" ? "1px solid #ffccc7" : t.type === "success" ? "1px solid #b7eb8f" : t.type === "info" ? "1px solid #b6d4fe" : "1px solid #ddd";
          const titleColor = t.type === "error" ? "#8a1f1f" : t.type === "success" ? "#1f6b2a" : "#1d3b6a";

          return (
            <div
              key={t.id}
              style={{
                background: bg,
                border,
                borderRadius: 10,
                padding: 12,
                boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                pointerEvents: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 900, color: titleColor, fontSize: 14 }}>{t.title || "Notice"}</div>
                <button
                  type="button"
                  onClick={() => removeToast(t.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 2,
                  }}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
              {t.message ? <div style={{ marginTop: 6, fontSize: 13, color: "#333", whiteSpace: "pre-wrap" }}>{t.message}</div> : null}
            </div>
          );
        })}
      </div>

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Book a Standard Skip</h1>
        {user?.email && <p style={{ fontSize: 14, color: "#555" }}>Signed in as {user.email}</p>}
        <p style={{ marginTop: 8 }}>
          <a href="/app/jobs" style={{ fontSize: 14 }}>
            ← Back to jobs list
          </a>
        </p>
      </header>

      {/* (Removed top-of-page error/success banners — everything is now popup-based) */}

      {/* Success / visual confirmation (kept, but popups are the primary feedback) */}
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
              {fieldErrors.sitePostcode && <div style={{ marginTop: 4, fontSize: 12, color: "red" }}>{fieldErrors.sitePostcode}</div>}
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
                  if (sameAsCustomerAddress && id) applyCustomerAddressToSite(id);
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
            {!selectedCustomerId && <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Select a customer first to use this.</div>}
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
                Permit: <b>{permitInfo.name}</b> — £{Number(permitInfo.price_no_vat || 0).toFixed(2)} (NO VAT).
                <br />
                Typical approval delay: <b>{Number(permitInfo.delay_business_days || 0)}</b> business day(s). Earliest delivery: <b>{earliestAllowedDateYmd || "—"}</b>{" "}
                (unless overridden).
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
              <div>
                Skip hire (inc VAT): <b>£{numericSkipPriceIncVat.toFixed(2)}</b>
              </div>
              <div>
                Permit (NO VAT): <b>£{permitCostNoVat.toFixed(2)}</b>
              </div>
              <div style={{ marginTop: 6, fontSize: 14 }}>
                Total to charge: <b>£{totalChargeDisplay.toFixed(2)}</b>
              </div>
            </div>
          </div>

          {/* Create invoice toggle */}
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 8, border: "1px solid #eee", background: "#fafafa" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
              <input type="checkbox" checked={createInvoice} onChange={(e) => setCreateInvoice(e.target.checked)} />
              Create invoice in Xero
            </label>
            <div style={{ fontSize: 12, marginTop: 6, color: "#666", lineHeight: 1.4 }}>If ticked, SkipLogic will create the invoice immediately after booking.</div>
          </div>

          {/* Mark paid now */}
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: "1px solid #eee", background: "#fafafa" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 800,
                opacity: canShowMarkPaid ? 1 : 0.5,
              }}
              title={canShowMarkPaid ? "" : "Mark paid is only available for cash/card bookings"}
            >
              <input type="checkbox" checked={markPaidNow} disabled={!canShowMarkPaid} onChange={(e) => setMarkPaidNow(e.target.checked)} />
              Mark invoice as paid now (applies payment in Xero)
            </label>
            <div style={{ fontSize: 12, marginTop: 6, color: "#666", lineHeight: 1.4 }}>
              Only use this if you have taken the payment now (cash/card). Requires “Create invoice in Xero”.
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

      {/* Credit Limit Modal */}
      {showCreditLimitModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 24,
              borderRadius: 10,
              width: "100%",
              maxWidth: 520,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>Credit limit exceeded</h2>

            <div style={{ marginBottom: 12, color: "#333", lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700 }}>This booking will exceed the customer’s credit limit.</div>
              <div style={{ fontSize: 13, marginTop: 6, color: "#555", whiteSpace: "pre-wrap" }}>{creditLimitModalMsg}</div>

              {creditLimitDetails?.kind === "values" && (
                <div style={{ marginTop: 12, fontSize: 13, border: "1px solid #eee", borderRadius: 8, padding: 12, background: "#fafafa" }}>
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
                <div style={{ marginTop: 12, fontSize: 13, border: "1px solid #eee", borderRadius: 8, padding: 12, background: "#fafafa" }}>
                  This customer is marked as a credit account, but <b>no credit limit is set</b>. Account bookings are blocked unless you override.
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: 13, color: "#444" }}>
                If you override, the booking will proceed and an override audit record will be logged.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={closeCreditLimitModal}
                disabled={creditOverrideWorking}
                style={{
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  background: "#f5f5f5",
                  cursor: creditOverrideWorking ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOverrideAndBook}
                disabled={creditOverrideWorking}
                style={{
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "#d83a3a",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: creditOverrideWorking ? "default" : "pointer",
                  opacity: creditOverrideWorking ? 0.8 : 1,
                }}
              >
                {creditOverrideWorking ? "Overriding…" : "Override & Book Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <input type="checkbox" checked={newCustomerCreditAccount} onChange={(e) => setNewCustomerCreditAccount(e.target.checked)} />
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
