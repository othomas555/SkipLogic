// pages/app/customers/[id].js
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

// Helper: generate a human-friendly account code like COX-001, COX-002...
async function generateAccountCode(rawName) {
  let base = (rawName || "").trim();

  if (!base) {
    base = "Customer";
  }

  // Remove non-alphanumeric, take first 3 chars, uppercase
  const cleaned = base.replace(/[^a-zA-Z0-9]/g, "");
  const prefix = cleaned.substring(0, 3).toUpperCase() || "CUS";

  // Find existing codes with this prefix
  const { data, error } = await supabase
    .from("customers")
    .select("account_code")
    .ilike("account_code", `${prefix}-%`);

  if (error) {
    console.error("Error checking existing account codes:", error);
    // Fall back to 001 if something goes wrong
    return `${prefix}-001`;
  }

  // Determine the next number by looking at existing suffixes
  let maxNumber = 0;

  (data || []).forEach((row) => {
    if (!row.account_code) return;
    const code = row.account_code;
    const parts = code.split("-");
    if (parts.length !== 2) return;

    const num = parseInt(parts[1], 10);
    if (!isNaN(num) && num > maxNumber) {
      maxNumber = num;
    }
  });

  const nextNumber = maxNumber + 1;
  const padded = String(nextNumber).padStart(3, "0");
  return `${prefix}-${padded}`;
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const customerId = Array.isArray(id) ? id[0] : id;

  const {
    checking,
    user,
    subscriberId,
    errorMsg: authError,
  } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressLine3, setAddressLine3] = useState("");
  const [postcode, setPostcode] = useState("");
  const [creditAccount, setCreditAccount] = useState("no"); // "yes" | "no"
  const [accountCode, setAccountCode] = useState("");
  const [creditLimit, setCreditLimit] = useState(""); // £ credit limit

  const [saving, setSaving] = useState(false);

  // Track original credit/account_code so we know when it changes
  const [originalIsCredit, setOriginalIsCredit] = useState(false);
  const [originalAccountCode, setOriginalAccountCode] = useState(null);

  useEffect(() => {
    async function loadCustomer() {
      if (!customerId || !subscriberId) return;

      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");

      const { data, error } = await supabase
        .from("customers")
        .select(
          `
          id,
          subscriber_id,
          first_name,
          last_name,
          company_name,
          email,
          phone,
          address_line1,
          address_line2,
          address_line3,
          postcode,
          is_credit_account,
          account_code,
          credit_limit,
          created_at
        `
        )
        .eq("id", customerId)
        .eq("subscriber_id", subscriberId)
        .single();

      if (error) {
        console.error(error);
        setErrorMsg("Could not load customer.");
        setLoading(false);
        return;
      }

      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setCompanyName(data.company_name || "");
      setEmail(data.email || "");
      setPhone(data.phone || "");
      setAddressLine1(data.address_line1 || "");
      setAddressLine2(data.address_line2 || "");
      setAddressLine3(data.address_line3 || "");
      setPostcode(data.postcode || "");
      setCreditAccount(data.is_credit_account ? "yes" : "no");
      setAccountCode(data.account_code || "");
      setCreditLimit(
        data.credit_limit !== null && data.credit_limit !== undefined
          ? String(data.credit_limit)
          : ""
      );

      setOriginalIsCredit(!!data.is_credit_account);
      setOriginalAccountCode(data.account_code || null);

      setLoading(false);
    }

    if (!checking && subscriberId && customerId) {
      loadCustomer();
    }
  }, [checking, subscriberId, customerId]);

  async function handleSave(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!subscriberId || !customerId) {
      setErrorMsg("Missing subscriber or customer ID.");
      return;
    }

    // basic required check
    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !addressLine1 ||
      !postcode
    ) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }

    setSaving(true);

    const isCredit = creditAccount === "yes";
    let accountCodeToSave = accountCode || null;

    // If they were NOT credit before, and are now, and don't have a code, generate one
    if (!originalIsCredit && isCredit && !accountCodeToSave) {
      const nameForCode =
        companyName.trim() ||
        `${firstName.trim()} ${lastName.trim()}`;
      accountCodeToSave = await generateAccountCode(nameForCode);
    }

    const { data, error } = await supabase
      .from("customers")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        company_name: companyName.trim() || null,
        email: email.trim(),
        phone: phone.trim(),
        address_line1: addressLine1.trim(),
        address_line2: addressLine2.trim() || null,
        address_line3: addressLine3.trim() || null,
        postcode: postcode.trim().toUpperCase(),
        is_credit_account: isCredit,
        account_code: accountCodeToSave,
        credit_limit:
          creditLimit.trim() === ""
            ? null
            : Number(creditLimit.trim()),
      })
      .eq("id", customerId)
      .eq("subscriber_id", subscriberId)
      .select(
        `
        id,
        first_name,
        last_name,
        company_name,
        email,
        phone,
        address_line1,
        address_line2,
        address_line3,
        postcode,
        is_credit_account,
        account_code,
        credit_limit,
        created_at
      `
      )
      .single();

    if (error) {
      console.error(error);
      setErrorMsg("Could not save customer.");
      setSaving(false);
      return;
    }

    // Update local + original state with latest data
    setFirstName(data.first_name || "");
    setLastName(data.last_name || "");
    setCompanyName(data.company_name || "");
    setEmail(data.email || "");
    setPhone(data.phone || "");
    setAddressLine1(data.address_line1 || "");
    setAddressLine2(data.address_line2 || "");
    setAddressLine3(data.address_line3 || "");
    setPostcode(data.postcode || "");
    setCreditAccount(data.is_credit_account ? "yes" : "no");
    setAccountCode(data.account_code || "");
    setCreditLimit(
      data.credit_limit !== null && data.credit_limit !== undefined
        ? String(data.credit_limit)
        : ""
    );

    setOriginalIsCredit(!!data.is_credit_account);
    setOriginalAccountCode(data.account_code || null);

    setSaving(false);
    setSuccessMsg("Customer Edited");

    setTimeout(() => setSuccessMsg(""), 3000);
  }

  if (checking || loading || !customerId) {
    return <p className="p-4">Loading customer...</p>;
  }

  return (
    <main className="p-4 max-w-3xl mx-auto font-sans">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold mb-1">
          Customer Details
        </h1>
        {user?.email && (
          <p className="text-sm text-gray-600">
            Signed in as {user.email}
          </p>
        )}
        <button
          type="button"
          className="mt-2 text-blue-600 underline text-sm"
          onClick={() => router.push("/app/customers")}
        >
          ← Back to customers
        </button>
        <button
          type="button"
          className="mt-2 ml-2 text-blue-600 underline text-sm"
          onClick={() =>
            router.push(
              `/app/customers/${customerId}/credit-application`
            )
          }
        >
          View Credit Application (PDF)
        </button>
      </header>

      {authError && (
        <div className="mb-4 p-3 border border-red-400 bg-red-50 text-red-700 text-sm rounded">
          {authError}
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 p-3 border border-red-400 bg-red-50 text-red-700 text-sm rounded">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 border border-green-400 bg-green-50 text-green-700 text-sm rounded">
          {successMsg}
        </div>
      )}

      <section className="border rounded p-4">
        <h2 className="text-lg font-semibold mb-3">Edit customer</h2>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">
                First Name *
              </label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">
                Last Name *
              </label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">
                Company Name{" "}
                <span className="text-gray-400 text-xs">
                  (optional)
                </span>
              </label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1">
                Customer Email *
              </label>
              <input
                type="email"
                className="w-full border rounded px-2 py-1 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">
                Customer Phone *
              </label>
              <input
                type="tel"
                className="w-full border rounded px-2 py-1 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">
                Address Line 1 *
              </label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">
                Address Line 2 *
              </label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1">
                Address Line 3{" "}
                <span className="text-gray-400 text-xs">
                  (optional)
                </span>
              </label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={addressLine3}
                onChange={(e) => setAddressLine3(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1">
                Postcode *
              </label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">
                Credit Account Customer *
              </label>
              <select
                className="w-full border rounded px-2 py-1 text-sm"
                value={creditAccount}
                onChange={(e) => setCreditAccount(e.target.value)}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1">
                Account Code{" "}
                <span className="text-gray-400 text-xs">
                  (auto for credit customers)
                </span>
              </label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm bg-gray-50"
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                placeholder="Will be generated when set as credit account"
              />
              {/* 
                NOTE: Currently editable – if you want it read-only,
                change to readOnly and remove onChange.
              */}
            </div>

            <div>
              <label className="block text-sm mb-1">
                Credit Limit (£){" "}
                <span className="text-gray-400 text-xs">
                  (optional)
                </span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border rounded px-2 py-1 text-sm"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="e.g. 1000.00"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <button
              type="submit"
              className="px-4 py-2 border rounded text-sm bg-black text-white disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>

            {successMsg && !saving && (
              <span className="text-xs text-green-700">Saved ✓</span>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
