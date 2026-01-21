// pages/app/customers/[id].js
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

function displayName(c) {
  const base = `${c?.first_name || ""} ${c?.last_name || ""}`.trim();
  if (c?.company_name) return `${c.company_name}${base ? ` – ${base}` : ""}`;
  return base || "Customer";
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [customer, setCustomer] = useState(null);

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

  async function load() {
    if (checking) return;
    if (!user || !subscriberId || !id) return;

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const { data, error } = await supabase
      .from("customers")
      .select(`
        id,
        subscriber_id,
        phone,
        email,
        first_name,
        last_name,
        company_name,
        address_line1,
        address_line2,
        address_line3,
        postcode,
        is_credit_account,
        account_code,
        credit_limit,
        term_hire_exempt,
        term_hire_days_override
      `)
      .eq("id", id)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (error) {
      console.error(error);
      setErrorMsg("Could not load customer.");
      setLoading(false);
      return;
    }
    if (!data) {
      setErrorMsg("Customer not found (or you don't have access).");
      setLoading(false);
      return;
    }

    setCustomer(data);

    setFirstName(data.first_name || "");
    setLastName(data.last_name || "");
    setCompanyName(data.company_name || "");
    setPhone(data.phone || "");
    setEmail(data.email || "");

    setAddress1(data.address_line1 || "");
    setAddress2(data.address_line2 || "");
    setAddress3(data.address_line3 || "");
    setPostcode(data.postcode || "");

    setIsCredit(!!data.is_credit_account);
    setAccountCode(data.account_code || "");
    setCreditLimit(data.credit_limit != null ? String(data.credit_limit) : "");

    setApplyTermHire(!data.term_hire_exempt);
    setOverrideDays(data.term_hire_days_override != null ? String(data.term_hire_days_override) : "");

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId, id]);

  async function save() {
    if (!customer?.id) return;

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    const patch = {
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

    const { error } = await supabase
      .from("customers")
      .update(patch)
      .eq("id", customer.id)
      .eq("subscriber_id", subscriberId);

    setSaving(false);

    if (error) {
      console.error(error);
      setErrorMsg("Could not save customer: " + (error.message || "Unknown error"));
      return;
    }

    setSuccessMsg("Saved.");
    await load();
  }

  async function deleteCustomer() {
    if (!customer?.id) return;
    const ok = window.confirm("Delete this customer? This cannot be undone.");
    if (!ok) return;

    setDeleting(true);
    setErrorMsg("");
    setSuccessMsg("");

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", customer.id)
      .eq("subscriber_id", subscriberId);

    setDeleting(false);

    if (error) {
      console.error(error);
      setErrorMsg("Could not delete customer: " + (error.message || "Unknown error"));
      return;
    }

    router.push("/app/customers");
  }

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading customer…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Customer</h1>
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
          <Link href="/app/customers" style={linkStyle}>← Back to customers</Link>
          <h1 style={{ margin: "10px 0 0" }}>{displayName(customer)}</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Edit full details + credit + term hire settings.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnDanger} onClick={deleteCustomer} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button style={btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {(authError || errorMsg || successMsg) && (
        <div style={{ marginBottom: 14 }}>
          {(authError || errorMsg) ? <p style={{ color: "red", margin: 0 }}>{authError || errorMsg}</p> : null}
          {successMsg ? <p style={{ color: "green", margin: 0 }}>{successMsg}</p> : null}
        </div>
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>Customer details</h2>
        <div style={gridStyle}>
          <label style={labelStyle}>First name<input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Last name<input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Company<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Email<input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></label>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Address</h2>
        <div style={gridStyle}>
          <label style={labelStyle}>Address line 1<input value={address1} onChange={(e) => setAddress1(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Address line 2<input value={address2} onChange={(e) => setAddress2(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Address line 3<input value={address3} onChange={(e) => setAddress3(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Postcode<input value={postcode} onChange={(e) => setPostcode(e.target.value)} style={inputStyle} /></label>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Credit account</h2>
        <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} />
          <span style={{ fontSize: 13 }}><b>Is credit account</b></span>
        </label>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
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
              style={{ ...inputStyle, background: isCredit ? "#fff" : "#f3f3f3" }}
            />
          </label>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Skip hire terms</h2>

        <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={applyTermHire} onChange={(e) => setApplyTermHire(e.target.checked)} />
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

const btnDanger = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #f0b4b4",
  background: "#fff5f5",
  color: "#8a1f1f",
  cursor: "pointer",
  fontSize: 13,
};
