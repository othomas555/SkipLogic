// pages/app/settings/online-booking.js

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function cleanSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ""));
}

function FieldError({ children }) {
  if (!children) return null;
  return <div style={styles.fieldError}>{children}</div>;
}

function SectionCard({ title, subtitle, children }) {
  return (
    <section style={styles.sectionCard}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>{title}</h2>
        {subtitle ? <div style={styles.sectionSubtitle}>{subtitle}</div> : null}
      </div>
      <div style={styles.sectionBody}>{children}</div>
    </section>
  );
}

export default function OnlineBookingSettingsPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [companyName, setCompanyName] = useState("");

  const [publicBookingEnabled, setPublicBookingEnabled] = useState(false);
  const [publicBookingSlug, setPublicBookingSlug] = useState("");
  const [publicBookingTitle, setPublicBookingTitle] = useState("");
  const [publicBookingLogoUrl, setPublicBookingLogoUrl] = useState("");
  const [publicBookingPrimaryColor, setPublicBookingPrimaryColor] = useState("");
  const [publicBookingPhone, setPublicBookingPhone] = useState("");
  const [publicBookingTermsUrl, setPublicBookingTermsUrl] = useState("");
  const [publicBookingNoticeDays, setPublicBookingNoticeDays] = useState("0");
  const [publicBookingNoticeWorkingDays, setPublicBookingNoticeWorkingDays] = useState(true);
  const [publicBookingAllowSaturday, setPublicBookingAllowSaturday] = useState(false);
  const [publicBookingAllowSunday, setPublicBookingAllowSunday] = useState(false);
  const [publicBookingMaxDaysAhead, setPublicBookingMaxDaysAhead] = useState("");
  const [publicBookingCutoffTime, setPublicBookingCutoffTime] = useState("");
  const [publicBookingUsePermitLeadTimes, setPublicBookingUsePermitLeadTimes] = useState(true);

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadRow() {
      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");

      const { data, error } = await supabase
        .from("subscribers")
        .select(`
          company_name,
          public_booking_enabled,
          public_booking_slug,
          public_booking_title,
          public_booking_logo_url,
          public_booking_primary_color,
          public_booking_phone,
          public_booking_terms_url,
          public_booking_notice_days,
          public_booking_notice_working_days,
          public_booking_allow_saturday,
          public_booking_allow_sunday,
          public_booking_max_days_ahead,
          public_booking_cutoff_time,
          public_booking_use_permit_lead_times
        `)
        .eq("id", subscriberId)
        .single();

      if (cancelled) return;

      if (error) {
        console.error("Load online booking settings error:", error);
        setErrorMsg(error.message || "Could not load online booking settings.");
        setLoading(false);
        return;
      }

      setCompanyName(data.company_name || "");
      setPublicBookingEnabled(!!data.public_booking_enabled);
      setPublicBookingSlug(data.public_booking_slug || "");
      setPublicBookingTitle(data.public_booking_title || "");
      setPublicBookingLogoUrl(data.public_booking_logo_url || "");
      setPublicBookingPrimaryColor(data.public_booking_primary_color || "");
      setPublicBookingPhone(data.public_booking_phone || "");
      setPublicBookingTermsUrl(data.public_booking_terms_url || "");
      setPublicBookingNoticeDays(String(Number(data.public_booking_notice_days || 0)));
      setPublicBookingNoticeWorkingDays(!!data.public_booking_notice_working_days);
      setPublicBookingAllowSaturday(!!data.public_booking_allow_saturday);
      setPublicBookingAllowSunday(!!data.public_booking_allow_sunday);
      setPublicBookingMaxDaysAhead(
        data.public_booking_max_days_ahead == null
          ? ""
          : String(Number(data.public_booking_max_days_ahead))
      );
      setPublicBookingCutoffTime(data.public_booking_cutoff_time || "");
      setPublicBookingUsePermitLeadTimes(!!data.public_booking_use_permit_lead_times);

      setLoading(false);
    }

    loadRow();

    return () => {
      cancelled = true;
    };
  }, [checking, subscriberId]);

  const bookingUrl = useMemo(() => {
    if (!publicBookingSlug) return "";
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}/book/${publicBookingSlug}`;
    }
    return `/book/${publicBookingSlug}`;
  }, [publicBookingSlug]);

  async function handleCopyUrl() {
    try {
      if (!bookingUrl) return;
      await navigator.clipboard.writeText(bookingUrl);
      setSuccessMsg("Booking link copied.");
    } catch (err) {
      setErrorMsg("Could not copy the booking link.");
    }
  }

  function validate() {
    const nextErrors = {};

    const slug = cleanSlug(publicBookingSlug);
    const noticeDays = Number(publicBookingNoticeDays);
    const maxDaysAhead =
      publicBookingMaxDaysAhead === "" ? null : Number(publicBookingMaxDaysAhead);

    if (publicBookingEnabled) {
      if (!slug) nextErrors.publicBookingSlug = "Slug is required when online booking is enabled.";
      else if (!isValidSlug(slug)) {
        nextErrors.publicBookingSlug =
          "Use lowercase letters, numbers and hyphens only.";
      }
    }

    if (!Number.isFinite(noticeDays) || noticeDays < 0) {
      nextErrors.publicBookingNoticeDays = "Notice days must be 0 or more.";
    }

    if (maxDaysAhead != null && (!Number.isFinite(maxDaysAhead) || maxDaysAhead < 1)) {
      nextErrors.publicBookingMaxDaysAhead = "Max days ahead must be blank or 1 or more.";
    }

    if (
      publicBookingCutoffTime &&
      !/^\d{2}:\d{2}$/.test(String(publicBookingCutoffTime || "").trim())
    ) {
      nextErrors.publicBookingCutoffTime = "Use HH:MM format, for example 14:30.";
    }

    if (
      publicBookingPrimaryColor &&
      !/^#[0-9a-fA-F]{6}$/.test(publicBookingPrimaryColor) &&
      !/^#[0-9a-fA-F]{3}$/.test(publicBookingPrimaryColor)
    ) {
      nextErrors.publicBookingPrimaryColor = "Use a hex colour like #0f172a.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave(e) {
    e.preventDefault();

    setErrorMsg("");
    setSuccessMsg("");
    setFieldErrors({});

    if (!subscriberId) {
      setErrorMsg("No subscriber found.");
      return;
    }

    if (!validate()) return;

    setSaving(true);

    const payload = {
      public_booking_enabled: !!publicBookingEnabled,
      public_booking_slug: cleanSlug(publicBookingSlug) || null,
      public_booking_title: publicBookingTitle.trim() || null,
      public_booking_logo_url: publicBookingLogoUrl.trim() || null,
      public_booking_primary_color: publicBookingPrimaryColor.trim() || null,
      public_booking_phone: publicBookingPhone.trim() || null,
      public_booking_terms_url: publicBookingTermsUrl.trim() || null,
      public_booking_notice_days: Number(publicBookingNoticeDays || 0),
      public_booking_notice_working_days: !!publicBookingNoticeWorkingDays,
      public_booking_allow_saturday: !!publicBookingAllowSaturday,
      public_booking_allow_sunday: !!publicBookingAllowSunday,
      public_booking_max_days_ahead:
        publicBookingMaxDaysAhead === "" ? null : Number(publicBookingMaxDaysAhead),
      public_booking_cutoff_time: publicBookingCutoffTime.trim() || null,
      public_booking_use_permit_lead_times: !!publicBookingUsePermitLeadTimes,
    };

    const { error } = await supabase
      .from("subscribers")
      .update(payload)
      .eq("id", subscriberId);

    if (error) {
      console.error("Save online booking settings error:", error);

      if (String(error.message || "").toLowerCase().includes("public_booking_slug")) {
        setFieldErrors((prev) => ({
          ...prev,
          publicBookingSlug: "That booking slug is already in use.",
        }));
      } else {
        setErrorMsg(error.message || "Could not save online booking settings.");
      }

      setSaving(false);
      return;
    }

    setPublicBookingSlug(cleanSlug(publicBookingSlug));
    setSuccessMsg("Online booking settings saved.");
    setSaving(false);
  }

  if (checking || loading) {
    return (
      <main style={styles.loadingWrap}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Online Booking</h1>
          <p style={styles.pageSub}>
            Turn on a hosted booking page your customer can use online.
          </p>
          <p style={styles.backRow}>
            <a href="/app/settings" style={styles.backLink}>
              ← Back to settings
            </a>
          </p>
        </div>
      </header>

      {authError ? <div style={styles.errorBanner}>{String(authError)}</div> : null}
      {errorMsg ? <div style={styles.errorBanner}>{errorMsg}</div> : null}
      {successMsg ? <div style={styles.successBanner}>{successMsg}</div> : null}

      <form onSubmit={handleSave} style={styles.formWrap}>
        <SectionCard
          title="Status & Link"
          subtitle="Enable online booking and choose the public web address your customers will use."
        >
          <div style={styles.fieldBlock}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={publicBookingEnabled}
                onChange={(e) => setPublicBookingEnabled(e.target.checked)}
              />
              <span>Enable online booking</span>
            </label>
          </div>

          <div style={styles.grid2}>
            <div style={styles.fieldBlock}>
              <label style={styles.label}>Public booking slug</label>
              <input
                type="text"
                value={publicBookingSlug}
                onChange={(e) => {
                  setPublicBookingSlug(cleanSlug(e.target.value));
                  setFieldErrors((prev) => ({ ...prev, publicBookingSlug: undefined }));
                }}
                placeholder="cox-skips"
                style={styles.input}
              />
              <div style={styles.hintText}>
                Example: <b>cox-skips</b>
              </div>
              <FieldError>{fieldErrors.publicBookingSlug}</FieldError>
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Live booking URL</label>
              <div style={styles.row}>
                <input
                  type="text"
                  value={bookingUrl}
                  readOnly
                  style={styles.inputFlex}
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  disabled={!bookingUrl}
                  style={styles.secondaryBtn}
                >
                  Copy link
                </button>
              </div>
              <div style={styles.hintText}>
                Put this link behind a “Book a skip” button on your website.
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Branding"
          subtitle="Choose the title and contact details shown on the hosted booking page."
        >
          <div style={styles.grid2}>
            <div style={styles.fieldBlock}>
              <label style={styles.label}>Booking page title</label>
              <input
                type="text"
                value={publicBookingTitle}
                onChange={(e) => setPublicBookingTitle(e.target.value)}
                placeholder={companyName || "Book a skip"}
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Phone number</label>
              <input
                type="text"
                value={publicBookingPhone}
                onChange={(e) => setPublicBookingPhone(e.target.value)}
                placeholder="01656 123456"
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Logo URL</label>
              <input
                type="text"
                value={publicBookingLogoUrl}
                onChange={(e) => setPublicBookingLogoUrl(e.target.value)}
                placeholder="https://..."
                style={styles.input}
              />
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Primary colour</label>
              <input
                type="text"
                value={publicBookingPrimaryColor}
                onChange={(e) => {
                  setPublicBookingPrimaryColor(e.target.value);
                  setFieldErrors((prev) => ({
                    ...prev,
                    publicBookingPrimaryColor: undefined,
                  }));
                }}
                placeholder="#0f172a"
                style={styles.input}
              />
              <FieldError>{fieldErrors.publicBookingPrimaryColor}</FieldError>
            </div>

            <div style={styles.fieldBlockFull}>
              <label style={styles.label}>Terms URL</label>
              <input
                type="text"
                value={publicBookingTermsUrl}
                onChange={(e) => setPublicBookingTermsUrl(e.target.value)}
                placeholder="https://..."
                style={styles.input}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Availability rules"
          subtitle="Control how far ahead customers must book and which days are allowed."
        >
          <div style={styles.grid2}>
            <div style={styles.fieldBlock}>
              <label style={styles.label}>Minimum notice</label>
              <input
                type="number"
                min="0"
                step="1"
                value={publicBookingNoticeDays}
                onChange={(e) => {
                  setPublicBookingNoticeDays(e.target.value);
                  setFieldErrors((prev) => ({
                    ...prev,
                    publicBookingNoticeDays: undefined,
                  }));
                }}
                style={styles.input}
              />
              <FieldError>{fieldErrors.publicBookingNoticeDays}</FieldError>
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Cutoff time</label>
              <input
                type="text"
                value={publicBookingCutoffTime}
                onChange={(e) => {
                  setPublicBookingCutoffTime(e.target.value);
                  setFieldErrors((prev) => ({
                    ...prev,
                    publicBookingCutoffTime: undefined,
                  }));
                }}
                placeholder="14:30"
                style={styles.input}
              />
              <div style={styles.hintText}>
                After this time, the system pushes the base booking day forward.
              </div>
              <FieldError>{fieldErrors.publicBookingCutoffTime}</FieldError>
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={publicBookingNoticeWorkingDays}
                  onChange={(e) => setPublicBookingNoticeWorkingDays(e.target.checked)}
                />
                <span>Use working days for notice</span>
              </label>
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.label}>Max days ahead</label>
              <input
                type="number"
                min="1"
                step="1"
                value={publicBookingMaxDaysAhead}
                onChange={(e) => {
                  setPublicBookingMaxDaysAhead(e.target.value);
                  setFieldErrors((prev) => ({
                    ...prev,
                    publicBookingMaxDaysAhead: undefined,
                  }));
                }}
                placeholder="Leave blank for no limit"
                style={styles.input}
              />
              <FieldError>{fieldErrors.publicBookingMaxDaysAhead}</FieldError>
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={publicBookingAllowSaturday}
                  onChange={(e) => setPublicBookingAllowSaturday(e.target.checked)}
                />
                <span>Allow Saturday bookings</span>
              </label>
            </div>

            <div style={styles.fieldBlock}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={publicBookingAllowSunday}
                  onChange={(e) => setPublicBookingAllowSunday(e.target.checked)}
                />
                <span>Allow Sunday bookings</span>
              </label>
            </div>

            <div style={styles.fieldBlockFull}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={publicBookingUsePermitLeadTimes}
                  onChange={(e) => setPublicBookingUsePermitLeadTimes(e.target.checked)}
                />
                <span>Apply permit lead times from permit settings</span>
              </label>
            </div>
          </div>
        </SectionCard>

        <div style={styles.footerBar}>
          <div style={styles.footerHelp}>
            Subscribers put the live booking URL on their own website as a normal button or link.
          </div>

          <div style={styles.footerActions}>
            <button
              type="button"
              onClick={() => router.push("/app/settings")}
              style={styles.secondaryBtn}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              style={{
                ...styles.primaryBtn,
                opacity: saving ? 0.8 : 1,
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save online booking settings"}
            </button>
          </div>
        </div>
      </form>
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

  formWrap: {
    maxWidth: 980,
  },

  sectionCard: {
    background: "#f8fafc",
    border: "1px solid #dbe3f0",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },

  sectionHeader: {
    padding: "14px 16px 10px",
    borderBottom: "1px solid #e6edf5",
    background: "#f3f7fb",
  },

  sectionTitle: {
    margin: 0,
    fontSize: 20,
    color: "#0f172a",
    letterSpacing: "-0.01em",
  },

  sectionSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.45,
  },

  sectionBody: {
    padding: 16,
  },

  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
  },

  fieldBlock: {
    marginBottom: 14,
  },

  fieldBlockFull: {
    gridColumn: "1 / -1",
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

  row: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },

  checkboxLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    color: "#0f172a",
    fontWeight: 600,
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

  primaryBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, var(--brand-mint), rgba(58,181,255,0.9))",
    color: "#071013",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  errorBanner: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    background: "#fff1f0",
    border: "1px solid #ffccc7",
    color: "#8a1f1f",
    maxWidth: 980,
  },

  successBanner: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    background: "#e6ffed",
    border: "1px solid #b7eb8f",
    color: "#14532d",
    maxWidth: 980,
  },

  footerBar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    flexWrap: "wrap",
    paddingTop: 4,
  },

  footerHelp: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.45,
  },

  footerActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
};
