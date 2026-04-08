// pages/book/[slug].js

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

function clampMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function formatMoney(value) {
  return clampMoney(value).toFixed(2);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function todayYmdLocal() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd, days) {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Number(days || 0));
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function normalizePhoneHref(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  return `tel:${raw.replace(/\s+/g, "")}`;
}

function FieldError({ children }) {
  if (!children) return null;
  return <div style={styles.fieldError}>{children}</div>;
}

function StepPill({ index, label, active, done }) {
  return (
    <div
      style={{
        ...styles.stepPill,
        ...(active ? styles.stepPillActive : {}),
        ...(done ? styles.stepPillDone : {}),
      }}
    >
      <span style={styles.stepPillNumber}>{index}</span>
      <span>{label}</span>
    </div>
  );
}

export default function PublicBookingPage() {
  const router = useRouter();
  const slug = String(router.query.slug || "").trim().toLowerCase();

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState("");
  const [config, setConfig] = useState(null);

  const [step, setStep] = useState(1);

  const [postcode, setPostcode] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [quoteData, setQuoteData] = useState(null);

  const [placementType, setPlacementType] = useState("private");
  const [permitSettingId, setPermitSettingId] = useState("");
  const [selectedSkipTypeId, setSelectedSkipTypeId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerCompanyName, setCustomerCompanyName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [siteName, setSiteName] = useState("");
  const [siteAddress1, setSiteAddress1] = useState("");
  const [siteAddress2, setSiteAddress2] = useState("");
  const [siteTown, setSiteTown] = useState("");
  const [notes, setNotes] = useState("");

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!router.isReady || !slug) return;

    let cancelled = false;

    async function loadConfig() {
      try {
        setLoadingConfig(true);
        setConfigError("");

        const res = await fetch(`/api/public/booking-config?slug=${encodeURIComponent(slug)}`);
        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json.ok) {
          throw new Error(json?.error || "Could not load booking page");
        }

        if (!cancelled) {
          setConfig(json);
        }
      } catch (err) {
        if (!cancelled) {
          setConfigError(String(err?.message || "Could not load booking page"));
        }
      } finally {
        if (!cancelled) {
          setLoadingConfig(false);
        }
      }
    }

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, slug]);

  async function refreshQuote({
    nextPostcode = postcode,
    nextPlacementType = placementType,
    nextPermitSettingId = permitSettingId,
    nextSkipTypeId = selectedSkipTypeId,
    preserveDate = false,
  } = {}) {
    try {
      setQuoteLoading(true);
      setQuoteError("");
      setQuoteData(null);

      const res = await fetch("/api/public/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          postcode: String(nextPostcode || "").trim(),
          placement_type: nextPlacementType,
          permit_setting_id:
            nextPlacementType === "permit" ? nextPermitSettingId || null : null,
          skip_type_id: nextSkipTypeId || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || "Could not build quote");
      }

      setQuoteData(json);

      const earliest = json?.availability?.earliest_date || "";
      if (!preserveDate) {
        setScheduledDate(earliest || "");
      } else if (scheduledDate && earliest && scheduledDate < earliest) {
        setScheduledDate(earliest);
      }
    } catch (err) {
      setQuoteError(String(err?.message || "Could not build quote"));
      setQuoteData(null);
    } finally {
      setQuoteLoading(false);
    }
  }

  function validateStep1() {
    const errors = {};

    if (!String(postcode || "").trim()) {
      errors.postcode = "Enter a postcode.";
    }

    if (!selectedSkipTypeId) {
      errors.skip = "Select a skip.";
    }

    if (placementType === "permit" && !permitSettingId) {
      errors.permit = "Select a permit authority.";
    }

    if (!scheduledDate) {
      errors.scheduledDate = "Select a delivery date.";
    }

    const earliest = quoteData?.availability?.earliest_date || "";
    if (scheduledDate && earliest && scheduledDate < earliest) {
      errors.scheduledDate = `Earliest available delivery date is ${earliest}.`;
    }

    const maxDaysAhead = quoteData?.availability?.max_days_ahead;
    if (
      scheduledDate &&
      maxDaysAhead != null &&
      Number.isFinite(Number(maxDaysAhead))
    ) {
      const lastAllowed = addDaysYmd(todayYmdLocal(), Number(maxDaysAhead));
      if (scheduledDate > lastAllowed) {
        errors.scheduledDate = `Bookings can only be made up to ${maxDaysAhead} day(s) ahead.`;
      }
    }

    setFieldErrors((prev) => ({ ...prev, ...errors }));
    return Object.keys(errors).length === 0;
  }

  function validateStep2() {
    const errors = {};

    if (!customerFirstName.trim()) errors.customerFirstName = "First name is required.";
    if (!customerLastName.trim()) errors.customerLastName = "Last name is required.";
    if (!customerEmail.trim()) errors.customerEmail = "Email is required.";
    else if (!isEmail(customerEmail)) errors.customerEmail = "Enter a valid email address.";
    if (!customerPhone.trim()) errors.customerPhone = "Phone is required.";
    if (!siteAddress1.trim()) errors.siteAddress1 = "Address line 1 is required.";
    if (!siteTown.trim()) errors.siteTown = "Town is required.";
    if (!postcode.trim()) errors.postcode = "Postcode is required.";
    if (!acceptTerms) errors.acceptTerms = "You must accept the booking terms.";

    setFieldErrors((prev) => ({ ...prev, ...errors }));
    return Object.keys(errors).length === 0;
  }

  async function handleFindSkips(e) {
    e.preventDefault();
    setFieldErrors({});
    setSelectedSkipTypeId("");
    setScheduledDate("");
    await refreshQuote({
      nextPostcode: postcode,
      nextPlacementType: placementType,
      nextPermitSettingId: permitSettingId,
      nextSkipTypeId: "",
    });
  }

  async function handleGoToDetails() {
    setFieldErrors({});
    const ok = validateStep1();
    if (!ok) return;
    setStep(2);
  }

  async function handleGoToConfirm() {
    setFieldErrors({});
    const ok = validateStep2();
    if (!ok) return;
    setStep(3);
  }

  async function handlePayNow() {
    try {
      setPaying(true);
      setFieldErrors({});

      const step1Ok = validateStep1();
      const step2Ok = validateStep2();
      if (!step1Ok || !step2Ok) {
        setPaying(false);
        if (!step1Ok) setStep(1);
        else setStep(2);
        return;
      }

      const res = await fetch("/api/public/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          postcode: postcode.trim(),
          placement_type: placementType,
          permit_setting_id: placementType === "permit" ? permitSettingId : null,
          skip_type_id: selectedSkipTypeId,
          scheduled_date: scheduledDate,

          customer: {
            first_name: customerFirstName.trim(),
            last_name: customerLastName.trim(),
            company_name: customerCompanyName.trim() || null,
            email: customerEmail.trim(),
            phone: customerPhone.trim(),
          },

          site: {
            site_name: siteName.trim() || null,
            address_line1: siteAddress1.trim(),
            address_line2: siteAddress2.trim() || null,
            town: siteTown.trim(),
            postcode: postcode.trim(),
          },

          notes: notes.trim() || null,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok || !json.url) {
        throw new Error(json?.error || "Could not start checkout");
      }

      window.location.href = json.url;
    } catch (err) {
      setFieldErrors((prev) => ({
        ...prev,
        checkout: String(err?.message || "Could not start checkout"),
      }));
    } finally {
      setPaying(false);
    }
  }

  const permitOptions = useMemo(() => {
    return config?.permit_options || [];
  }, [config]);

  const selectedPermit = useMemo(() => {
    return permitOptions.find((p) => p.id === permitSettingId) || null;
  }, [permitOptions, permitSettingId]);

  const skipOptions = useMemo(() => {
    return quoteData?.skip_options || [];
  }, [quoteData]);

  const selectedSkip = useMemo(() => {
    return skipOptions.find((s) => s.skip_type_id === selectedSkipTypeId) || null;
  }, [skipOptions, selectedSkipTypeId]);

  const summaryPricing = useMemo(() => {
    if (!quoteData?.pricing) {
      return {
        skip_price_inc_vat: selectedSkip ? clampMoney(selectedSkip.price_inc_vat) : 0,
        permit_price_no_vat: selectedPermit ? clampMoney(selectedPermit.price_no_vat) : 0,
        total_to_charge:
          (selectedSkip ? clampMoney(selectedSkip.price_inc_vat) : 0) +
          (selectedPermit ? clampMoney(selectedPermit.price_no_vat) : 0),
      };
    }
    return quoteData.pricing;
  }, [quoteData, selectedSkip, selectedPermit]);

  const brandColor = config?.subscriber?.primary_color || "#0f172a";
  const earliestDate = quoteData?.availability?.earliest_date || "";

  if (loadingConfig) {
    return (
      <main style={styles.page}>
        <div style={styles.centerCard}>Loading booking page…</div>
      </main>
    );
  }

  if (configError) {
    return (
      <main style={styles.page}>
        <div style={styles.centerCardError}>
          <h1 style={styles.centerTitle}>Booking page unavailable</h1>
          <p style={styles.centerText}>{configError}</p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.brandRow}>
            {config?.subscriber?.logo_url ? (
              <img
                src={config.subscriber.logo_url}
                alt={config.subscriber.title || "Logo"}
                style={styles.logo}
              />
            ) : (
              <div style={{ ...styles.logoFallback, borderColor: brandColor, color: brandColor }}>
                {String(config?.subscriber?.title || "B").slice(0, 1).toUpperCase()}
              </div>
            )}

            <div>
              <h1 style={styles.pageTitle}>{config?.subscriber?.title || "Book a skip"}</h1>
              <div style={styles.pageSub}>
                Book and pay online
                {config?.subscriber?.phone ? (
                  <>
                    {" · "}
                    <a href={normalizePhoneHref(config.subscriber.phone)} style={{ color: brandColor }}>
                      {config.subscriber.phone}
                    </a>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div style={styles.stepRow}>
            <StepPill index="1" label="Choose skip" active={step === 1} done={step > 1} />
            <StepPill index="2" label="Your details" active={step === 2} done={step > 2} />
            <StepPill index="3" label="Confirm & pay" active={step === 3} done={false} />
          </div>
        </header>

        <section style={styles.mainGrid}>
          <div>
            {step === 1 && (
              <section style={styles.card}>
                <h2 style={styles.cardTitle}>Choose your skip</h2>

                <form onSubmit={handleFindSkips}>
                  <div style={styles.fieldBlock}>
                    <label style={styles.label}>Delivery postcode *</label>
                    <div style={styles.row}>
                      <input
                        type="text"
                        value={postcode}
                        onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                        placeholder="CF32 7AB"
                        style={styles.inputFlex}
                      />
                      <button
                        type="submit"
                        style={{ ...styles.primaryBtn, background: brandColor }}
                        disabled={quoteLoading}
                      >
                        {quoteLoading ? "Looking up…" : "Find skips"}
                      </button>
                    </div>
                    <FieldError>{fieldErrors.postcode}</FieldError>
                  </div>

                  {quoteError ? <div style={styles.errorBox}>{quoteError}</div> : null}
                  {quoteData?.message ? <div style={styles.infoBox}>{quoteData.message}</div> : null}

                  {quoteData?.serviceable && (
                    <>
                      <div style={styles.fieldBlock}>
                        <label style={styles.label}>Placement *</label>
                        <div style={styles.radioWrap}>
                          <label style={styles.radioLabel}>
                            <input
                              type="radio"
                              name="placement_type"
                              checked={placementType === "private"}
                              onChange={async () => {
                                setPlacementType("private");
                                setPermitSettingId("");
                                setFieldErrors((prev) => ({ ...prev, permit: undefined }));
                                await refreshQuote({
                                  nextPostcode: postcode,
                                  nextPlacementType: "private",
                                  nextPermitSettingId: "",
                                  nextSkipTypeId: selectedSkipTypeId,
                                  preserveDate: false,
                                });
                              }}
                            />
                            <span>Private ground</span>
                          </label>

                          <label style={styles.radioLabel}>
                            <input
                              type="radio"
                              name="placement_type"
                              checked={placementType === "permit"}
                              onChange={async () => {
                                const firstPermit = permitOptions[0]?.id || "";
                                setPlacementType("permit");
                                setPermitSettingId(firstPermit);
                                await refreshQuote({
                                  nextPostcode: postcode,
                                  nextPlacementType: "permit",
                                  nextPermitSettingId: firstPermit,
                                  nextSkipTypeId: selectedSkipTypeId,
                                  preserveDate: false,
                                });
                              }}
                            />
                            <span>Road permit required</span>
                          </label>
                        </div>
                      </div>

                      {placementType === "permit" && (
                        <div style={styles.fieldBlock}>
                          <label style={styles.label}>Permit authority *</label>
                          <select
                            value={permitSettingId}
                            onChange={async (e) => {
                              const nextId = e.target.value;
                              setPermitSettingId(nextId);
                              await refreshQuote({
                                nextPostcode: postcode,
                                nextPlacementType: "permit",
                                nextPermitSettingId: nextId,
                                nextSkipTypeId: selectedSkipTypeId,
                                preserveDate: false,
                              });
                            }}
                            style={styles.select}
                          >
                            <option value="">Select permit authority</option>
                            {permitOptions.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} — £{formatMoney(p.price_no_vat)} (NO VAT), {p.delay_business_days} business day(s)
                              </option>
                            ))}
                          </select>
                          <FieldError>{fieldErrors.permit}</FieldError>

                          {selectedPermit ? (
                            <div style={styles.infoBox}>
                              Permit: <b>{selectedPermit.name}</b>
                              <br />
                              Permit fee: <b>£{formatMoney(selectedPermit.price_no_vat)}</b> (NO VAT)
                              <br />
                              Typical delay: <b>{selectedPermit.delay_business_days}</b> business day(s)
                            </div>
                          ) : null}
                        </div>
                      )}

                      <div style={styles.fieldBlock}>
                        <label style={styles.label}>Skip size *</label>
                        <select
                          value={selectedSkipTypeId}
                          onChange={async (e) => {
                            const nextId = e.target.value;
                            setSelectedSkipTypeId(nextId);
                            setFieldErrors((prev) => ({ ...prev, skip: undefined }));
                            await refreshQuote({
                              nextPostcode: postcode,
                              nextPlacementType: placementType,
                              nextPermitSettingId: permitSettingId,
                              nextSkipTypeId: nextId,
                              preserveDate: true,
                            });
                          }}
                          style={styles.select}
                        >
                          <option value="">Select skip size</option>
                          {skipOptions.map((s) => (
                            <option key={s.skip_type_id} value={s.skip_type_id}>
                              {s.skip_type_name} — £{formatMoney(s.price_inc_vat)}
                            </option>
                          ))}
                        </select>
                        <FieldError>{fieldErrors.skip}</FieldError>
                      </div>

                      <div style={styles.fieldBlock}>
                        <label style={styles.label}>Delivery date *</label>
                        <input
                          type="date"
                          value={scheduledDate}
                          min={earliestDate || undefined}
                          onChange={(e) => {
                            setScheduledDate(e.target.value);
                            setFieldErrors((prev) => ({ ...prev, scheduledDate: undefined }));
                          }}
                          style={styles.dateInput}
                        />
                        {earliestDate ? (
                          <div style={styles.hintText}>
                            Earliest available delivery date: <b>{earliestDate}</b>
                          </div>
                        ) : null}
                        {quoteData?.availability?.max_days_ahead != null ? (
                          <div style={styles.hintText}>
                            Maximum advance booking: {quoteData.availability.max_days_ahead} day(s)
                          </div>
                        ) : null}
                        <FieldError>{fieldErrors.scheduledDate}</FieldError>
                      </div>

                      <div style={styles.actionsRow}>
                        <button
                          type="button"
                          onClick={handleGoToDetails}
                          style={{ ...styles.primaryBtnLarge, background: brandColor }}
                        >
                          Continue
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </section>
            )}

            {step === 2 && (
              <section style={styles.card}>
                <h2 style={styles.cardTitle}>Your details</h2>

                <div style={styles.formGrid}>
                  <div style={styles.fieldBlock}>
                    <label style={styles.label}>First name *</label>
                    <input
                      type="text"
                      value={customerFirstName}
                      onChange={(e) => setCustomerFirstName(e.target.value)}
                      style={styles.input}
                    />
                    <FieldError>{fieldErrors.customerFirstName}</FieldError>
                  </div>

                  <div style={styles.fieldBlock}>
                    <label style={styles.label}>Last name *</label>
                    <input
                      type="text"
                      value={customerLastName}
                      onChange={(e) => setCustomerLastName(e.target.value)}
                      style={styles.input}
                    />
                    <FieldError>{fieldErrors.customerLastName}</FieldError>
                  </div>

                  <div style={styles.fieldBlock}>
                    <label style={styles.label}>Company name</label>
                    <input
                      type="text"
                      value={customerCompanyName}
                      onChange={(e) => setCustomerCompanyName(e.target.value)}
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.fieldBlock}>
                    <label style={styles.label}>Email *</label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      style={styles.input}
                    />
                    <FieldError>{fieldErrors.customerEmail}</FieldError>
                  </div>

                  <div style={styles.fieldBlock}>
                    <label style={styles.label}>Phone *</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      style={styles.input}
                    />
                    <FieldError>{fieldErrors.customerPhone}</FieldError>
                  </div>

                  <div style={styles.fieldBlock}>
                    <label style={styles.label}>Site name / description</label>
                    <input
                      type="text"
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      placeholder="Front drive, rear yard, unit 3"
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.fieldBlockWide}>
                    <label style={styles.label}>Address line 1 *</label>
                    <input
                      type="text"
                      value={siteAddress1}
                      onChange={(e) => setSiteAddress1(e.target.value)}
                      style={styles.input}
                    />
                    <FieldError>{fieldErrors.siteAddress1}</FieldError>
                  </div>

                  <div style={styles.fieldBlockWide}>
                    <label style={styles.label}>Address line 2</label>
                    <input
                      type="text"
                      value={siteAddress2}
                      onChange={(e) => setSiteAddress2(e.target.value)}
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.fieldBlock}>
                    <label style={styles.label}>Town *</label>
                    <input
                      type="text"
                      value={siteTown}
                      onChange={(e) => setSiteTown(e.target.value)}
                      style={styles.input}
                    />
                    <FieldError>{fieldErrors.siteTown}</FieldError>
                  </div>

                  <div style={styles.fieldBlock}>
                    <label style={styles.label}>Postcode</label>
                    <input type="text" value={postcode} disabled style={styles.inputDisabled} />
                  </div>

                  <div style={styles.fieldBlockWide}>
                    <label style={styles.label}>Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      style={styles.textarea}
                    />
                  </div>
                </div>

                <div style={styles.termsBox}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => {
                        setAcceptTerms(e.target.checked);
                        setFieldErrors((prev) => ({ ...prev, acceptTerms: undefined }));
                      }}
                    />
                    <span>
                      I confirm these booking details are correct
                      {config?.subscriber?.terms_url ? (
                        <>
                          {" "}and I accept the{" "}
                          <a
                            href={config.subscriber.terms_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: brandColor }}
                          >
                            booking terms
                          </a>
                        </>
                      ) : null}
                      .
                    </span>
                  </label>
                  <FieldError>{fieldErrors.acceptTerms}</FieldError>
                </div>

                <div style={styles.actionsRowBetween}>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    style={styles.secondaryBtn}
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={handleGoToConfirm}
                    style={{ ...styles.primaryBtnLarge, background: brandColor }}
                  >
                    Continue to confirm
                  </button>
                </div>
              </section>
            )}

            {step === 3 && (
              <section style={styles.card}>
                <h2 style={styles.cardTitle}>Confirm and pay</h2>

                <div style={styles.confirmGrid}>
                  <div style={styles.confirmBlock}>
                    <div style={styles.confirmTitle}>Booking</div>
                    <div style={styles.confirmLine}><span>Postcode</span><b>{postcode}</b></div>
                    <div style={styles.confirmLine}><span>Skip</span><b>{selectedSkip?.skip_type_name || "—"}</b></div>
                    <div style={styles.confirmLine}><span>Placement</span><b>{placementType === "permit" ? "Road permit" : "Private ground"}</b></div>
                    {placementType === "permit" && selectedPermit ? (
                      <div style={styles.confirmLine}><span>Permit</span><b>{selectedPermit.name}</b></div>
                    ) : null}
                    <div style={styles.confirmLine}><span>Delivery date</span><b>{scheduledDate || "—"}</b></div>
                  </div>

                  <div style={styles.confirmBlock}>
                    <div style={styles.confirmTitle}>Customer</div>
                    <div style={styles.confirmText}>
                      {customerFirstName} {customerLastName}
                      {customerCompanyName ? (
                        <>
                          <br />
                          {customerCompanyName}
                        </>
                      ) : null}
                      <br />
                      {customerEmail}
                      <br />
                      {customerPhone}
                    </div>
                  </div>

                  <div style={styles.confirmBlock}>
                    <div style={styles.confirmTitle}>Site address</div>
                    <div style={styles.confirmText}>
                      {siteName ? (
                        <>
                          {siteName}
                          <br />
                        </>
                      ) : null}
                      {siteAddress1}
                      {siteAddress2 ? (
                        <>
                          <br />
                          {siteAddress2}
                        </>
                      ) : null}
                      <br />
                      {siteTown}
                      <br />
                      {postcode}
                    </div>
                  </div>

                  <div style={styles.confirmBlock}>
                    <div style={styles.confirmTitle}>Charges</div>
                    <div style={styles.confirmLine}>
                      <span>Skip hire (inc VAT)</span>
                      <b>£{formatMoney(summaryPricing.skip_price_inc_vat)}</b>
                    </div>
                    <div style={styles.confirmLine}>
                      <span>Permit (NO VAT)</span>
                      <b>£{formatMoney(summaryPricing.permit_price_no_vat)}</b>
                    </div>
                    <div style={styles.confirmTotal}>
                      <span>Total to pay now</span>
                      <b>£{formatMoney(summaryPricing.total_to_charge)}</b>
                    </div>
                  </div>
                </div>

                {notes ? (
                  <div style={styles.notesBox}>
                    <div style={styles.confirmTitle}>Notes</div>
                    <div style={styles.confirmText}>{notes}</div>
                  </div>
                ) : null}

                <FieldError>{fieldErrors.checkout}</FieldError>

                <div style={styles.actionsRowBetween}>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    style={styles.secondaryBtn}
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={handlePayNow}
                    disabled={paying}
                    style={{ ...styles.primaryBtnLarge, background: brandColor, opacity: paying ? 0.8 : 1 }}
                  >
                    {paying ? "Redirecting…" : `Pay now £${formatMoney(summaryPricing.total_to_charge)}`}
                  </button>
                </div>
              </section>
            )}
          </div>

          <aside style={styles.sidebar}>
            <div style={styles.sidebarCard}>
              <div style={styles.sidebarTitle}>Order summary</div>

              <div style={styles.sidebarLine}>
                <span>Postcode</span>
                <b>{postcode || "—"}</b>
              </div>

              <div style={styles.sidebarLine}>
                <span>Skip</span>
                <b>{selectedSkip?.skip_type_name || "—"}</b>
              </div>

              <div style={styles.sidebarLine}>
                <span>Placement</span>
                <b>{placementType === "permit" ? "Permit" : "Private"}</b>
              </div>

              <div style={styles.sidebarLine}>
                <span>Delivery</span>
                <b>{scheduledDate || earliestDate || "—"}</b>
              </div>

              <hr style={styles.hr} />

              <div style={styles.sidebarLine}>
                <span>Skip hire</span>
                <b>£{formatMoney(summaryPricing.skip_price_inc_vat)}</b>
              </div>

              <div style={styles.sidebarLine}>
                <span>Permit</span>
                <b>£{formatMoney(summaryPricing.permit_price_no_vat)}</b>
              </div>

              <div style={styles.sidebarTotal}>
                <span>Total</span>
                <b>£{formatMoney(summaryPricing.total_to_charge)}</b>
              </div>

              {earliestDate ? (
                <div style={styles.sidebarHint}>
                  Earliest available date: <b>{earliestDate}</b>
                </div>
              ) : null}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    padding: 20,
    fontFamily: "var(--font-sans)",
  },

  shell: {
    maxWidth: 1180,
    margin: "0 auto",
  },

  header: {
    marginBottom: 18,
  },

  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 18,
    flexWrap: "wrap",
  },

  logo: {
    width: 64,
    height: 64,
    objectFit: "contain",
    borderRadius: 14,
    background: "#fff",
    border: "1px solid #dbe3f0",
    padding: 8,
  },

  logoFallback: {
    width: 64,
    height: 64,
    borderRadius: 14,
    border: "2px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#fff",
    fontWeight: 900,
    fontSize: 28,
  },

  pageTitle: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.05,
    color: "#0f172a",
    letterSpacing: "-0.02em",
  },

  pageSub: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 14,
  },

  stepRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  stepPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid #dbe3f0",
    background: "#fff",
    color: "#475569",
    fontSize: 14,
    fontWeight: 700,
  },

  stepPillActive: {
    border: "1px solid #93c5fd",
    background: "#eff6ff",
    color: "#0f172a",
  },

  stepPillDone: {
    border: "1px solid #bbf7d0",
    background: "#f0fdf4",
    color: "#166534",
  },

  stepPillNumber: {
    width: 22,
    height: 22,
    borderRadius: 999,
    background: "rgba(15,23,42,0.08)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 900,
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 320px",
    gap: 18,
    alignItems: "start",
  },

  card: {
    background: "#fff",
    border: "1px solid #dbe3f0",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
  },

  sidebar: {
    position: "sticky",
    top: 20,
  },

  sidebarCard: {
    background: "#fff",
    border: "1px solid #dbe3f0",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
  },

  sidebarTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: "#0f172a",
    marginBottom: 14,
  },

  sidebarLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 14,
    color: "#334155",
    marginBottom: 10,
  },

  sidebarTotal: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 18,
    fontWeight: 900,
    color: "#0f172a",
    marginTop: 12,
  },

  sidebarHint: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.5,
  },

  hr: {
    border: "none",
    borderTop: "1px solid #e2e8f0",
    margin: "12px 0",
  },

  cardTitle: {
    margin: 0,
    marginBottom: 16,
    fontSize: 24,
    color: "#0f172a",
    letterSpacing: "-0.02em",
  },

  fieldBlock: {
    marginBottom: 16,
  },

  fieldBlockWide: {
    marginBottom: 16,
    gridColumn: "1 / -1",
  },

  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 800,
    color: "#0f172a",
  },

  row: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },

  input: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    boxSizing: "border-box",
    color: "#0f172a",
  },

  inputDisabled: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    boxSizing: "border-box",
    color: "#64748b",
  },

  inputFlex: {
    flex: 1,
    minWidth: 240,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    boxSizing: "border-box",
    color: "#0f172a",
  },

  select: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    boxSizing: "border-box",
    color: "#0f172a",
  },

  dateInput: {
    width: 240,
    maxWidth: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    boxSizing: "border-box",
    color: "#0f172a",
  },

  textarea: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    boxSizing: "border-box",
    color: "#0f172a",
    resize: "vertical",
  },

  primaryBtn: {
    border: "none",
    color: "#fff",
    fontWeight: 900,
    padding: "12px 16px",
    borderRadius: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  primaryBtnLarge: {
    border: "none",
    color: "#fff",
    fontWeight: 900,
    padding: "14px 18px",
    borderRadius: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 14,
  },

  secondaryBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 800,
    padding: "14px 18px",
    borderRadius: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 14,
  },

  radioWrap: {
    display: "flex",
    gap: 18,
    flexWrap: "wrap",
  },

  radioLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    color: "#0f172a",
    fontWeight: 700,
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
    lineHeight: 1.45,
    fontWeight: 700,
  },

  infoBox: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1e3a8a",
    fontSize: 13,
    lineHeight: 1.55,
  },

  errorBox: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#9f1239",
    fontSize: 13,
    lineHeight: 1.55,
  },

  actionsRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 18,
  },

  actionsRowBetween: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 18,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },

  termsBox: {
    marginTop: 6,
    padding: 14,
    borderRadius: 14,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },

  checkboxLabel: {
    display: "inline-flex",
    alignItems: "flex-start",
    gap: 10,
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 1.5,
    fontWeight: 600,
  },

  confirmGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },

  confirmBlock: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 14,
    background: "#fafcff",
  },

  confirmTitle: {
    fontSize: 16,
    fontWeight: 900,
    color: "#0f172a",
    marginBottom: 12,
  },

  confirmLine: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 14,
    color: "#334155",
    marginBottom: 8,
  },

  confirmTotal: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 18,
    color: "#0f172a",
    fontWeight: 900,
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #dbe3f0",
  },

  confirmText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },

  notesBox: {
    marginTop: 14,
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 14,
    background: "#fafcff",
  },

  centerCard: {
    maxWidth: 520,
    margin: "80px auto",
    background: "#fff",
    border: "1px solid #dbe3f0",
    borderRadius: 18,
    padding: 24,
    textAlign: "center",
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
    color: "#0f172a",
    fontSize: 16,
    fontWeight: 700,
  },

  centerCardError: {
    maxWidth: 520,
    margin: "80px auto",
    background: "#fff",
    border: "1px solid #fecdd3",
    borderRadius: 18,
    padding: 24,
    textAlign: "center",
    boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
  },

  centerTitle: {
    margin: 0,
    fontSize: 24,
    color: "#881337",
  },

  centerText: {
    marginTop: 12,
    fontSize: 14,
    color: "#9f1239",
    lineHeight: 1.6,
  },
};
