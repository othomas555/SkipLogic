// pages/app/customers/new.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function clampIntOrNull(v, min, max) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const x = Math.trunc(n);
  return Math.max(min, Math.min(max, x));
}

function clampMoneyOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

export default function NewCustomerPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Details
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Address
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [address3, setAddress3] = useState("");
  const [postcode, setPostcode] = useState("");

  // Credit
  const [isCredit, setIsCredit] = useState(false);
  const [accountCode, setAccountCode] = useState("");
  const [creditLimit, setCreditLimit] = useState("");

  // Term hire
  const [applyTermHire, setApplyTermHire] = useState(true);
  const [overrideDays, setOverrideDays] = useState("");

  const termHireExempt = useMemo(() => !applyTermHire, [applyTermHire]);
  const termHireDaysOverride = useMemo(() => {
    if (!applyTermHire) return null;
    return clampIntOrNull(overrideDays, 1, 365);
  }, [applyTermHire, overrideDays]);

  useEffect(() => {
    if (!applyTermHire) setOverrideDays("");
  }, [applyTermHire]);

  useEffect(() => {
    if (!isCredit) {
      setAccountCode("");
      setCreditLimit("");
    }
  }, [isCredit]);

  async function save() {
    if (!subscriberId) return;

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    const payload = {
      subscriber_id: subscriberId,

      first_name: firstName || null,
      last_name: lastName || null,
      company_name: companyName || null,
      phone: phone || null,
      email: email || null,

      address_line1: address1 || null,
      address_line2: address2 || null,
      address_line3: address3 || null,
      postcode: postcode || null,

      is_credit_account: !!isCredit,
      account_code: isCredit ? (accountCode || null) : null,
      credit_limit: isCredit ? clampMoneyOrNull(creditLimit) : null,

      term_hire_exempt: termHireExempt,
      term_hire_days_override: termHireDaysOverride,
    };

    const { data, error } = await supabase
      .from("customers")
      .insert(payload)
      .select("id")
      .maybeSingle();

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg("Could not create customer: " + (error.message || "Unknown error"));
      return;
    }

    setSuccessMsg("Customer created.");
    const newId = data?.id;
    if (newId) router.push(`/app/customers/${newId}`);
    else router.push("/app/customers");
  }

  if (checking) {
    return (
      <main style={centerStyle}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Add customer</h1>
        <p>You must be signed in.</p>
        <button style={btnSecondary} onClick={() => router.push("/login")}>
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app/customers" style={linkStyle}>
            ← Back to customers
          </Link>
          <h1 style={{ margin: "10px 0 0" }}>Add customer</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Full customer details + credit + term hire settings.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Create customer"}
          </button>
        </div>
      </header>

      {(authError || errorMsg || successMsg) && (
        <div style={{ marginBottom: 14 }}>
          {(authError || errorMsg) ? (
            <p style={{ color: "red", margin: 0 }}>{authError || errorMsg}</p>
          ) : null}
          {successMsg ? <p style={{ color: "green", margin: 0 }}>{successMsg}</p> : null}
        </div>
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>Customer details</h2>
        <div style={gridStyle}>
          <label style={labelStyle}>
            First name
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Last name
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Company (optional)
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          </label>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Address</h2>
        <div style={gridStyle}>
          <label style={labelStyle}>
            Address line 1
            <input value={address1} onChange={(e) => setAddress1(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Address line 2
            <input value={address2} onChange={(e) => setAddress2(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Address line 3
            <input value={address3} onChange={(e) => setAddress3(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Postcode
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} style={inputStyle} />
          </label>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Credit account</h2>
        <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} />
          <span style={{ fontSize: 13 }}>
            <b>Is credit account</b>
          </span>
        </label>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 10,
          }}
        >
          <label style={labelStyle}>
            Account code
            <input
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              disabled={!isCredit}
              style={{ ...inputStyle, background: isCredit ? "#fff" : "#f3f3f3" }}
            />
          </label>

          <label style={labelStyle}>
            Credit limit
            <input
              type="number"
              step="0.01"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              disabled={!isCredit}
              placeholder={isCredit ? "" : "Disabled"}
              style={{ ...inputStyle, background: isCredit ? "#fff" : "#f3f3f3" }}
            />
          </label>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Skip hire terms</h2>

        <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            checked={applyTermHire}
            onChange={(e) => setApplyTermHire(e.target.checked)}
          />
          <span style={{ fontSize: 13 }}>
            <b>Apply skip hire term rules</b> (untick for contract customers / tip &amp; returns)
          </span>
        </label>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>
            Term days override (optional)
            <input
              type="number"
              min={1}
              max={365}
              disabled={!applyTermHire}
              value={overrideDays}
              onChange={(e) => setOverrideDays(e.target.value)}
              placeholder={applyTermHire ? "Leave blank to use Settings default" : "Disabled (customer exempt)"}
              style={{ ...inputStyle, background: applyTermHire ? "#fff" : "#f3f3f3" }}
            />
          </label>
        </div>
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f7f7f7",
};

const centerStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const linkStyle = { textDecoration: "underline", color: "#0070f3", fontSize: 13 };

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const h2Style = { fontSize: 16, margin: "0 0 10px" };

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "#333",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
};

const btnPrimary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #0070f3",
  background: "#0070f3",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnSecondary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontSize: 13,
};
