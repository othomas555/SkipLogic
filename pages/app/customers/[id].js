// pages/app/customers/[id].js
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function CustomerDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const customerId = Array.isArray(id) ? id[0] : id;

  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  // 🔊 DEBUG: does this component even render?
  console.log("CustomerDetailPage render", {
    checking,
    subscriberId,
    customerId,
  });

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(""); // success state

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

  const [createdAt, setCreatedAt] = useState(null);

  useEffect(() => {
    if (checking) return;
    if (!subscriberId) return;
    if (!customerId) return;

    async function loadCustomer() {
      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");

      console.log("Loading customer from Supabase…", {
        subscriberId,
        customerId,
      });

      const { data, error } = await supabase
        .from("customers")
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
          created_at
        `
        )
        .eq("subscriber_id", subscriberId)
        .eq("id", customerId)
        .single();

      if (error) {
        console.error("Load customer error:", error);
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
      setCreatedAt(data.created_at || null);

      setLoading(false);
    }

    loadCustomer();
  }, [checking, subscriberId, customerId]);

  async function handleSave(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    console.log("handleSave called");

    if (!subscriberId || !customerId) {
      setErrorMsg("Missing subscriber or customer ID.");
      console.log("Missing subscriberId or customerId", {
        subscriberId,
        customerId,
      });
      return;
    }

    if (!firstName || !lastName || !email || !phone || !addressLine1 || !postcode) {
      setErrorMsg("Please fill in all required fields.");
      console.log("Validation failed");
      return;
    }

    setSaving(true);
    console.log("Saving customer changes…");

    const { error } = await supabase
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
        is_credit_account: creditAccount === "yes",
      })
      .eq("subscriber_id", subscriberId)
      .eq("id", customerId);

    if (error) {
      console.error("Update customer error:", error);
      setErrorMsg("Could not save changes.");
      setSaving(false);
      return;
    }

    console.log("Customer updated OK");
    setSaving(false);
    setSuccessMsg("Customer edited");

    setTimeout(() => setSuccessMsg(""), 3000);
  }

  if (checking || loading) {
    return (
      <main className="p-4">
        <p>Loading customer…</p>
      </main>
    );
  }

  return (
    <main className="p-4 max-w-3xl mx-auto font-sans">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold mb-1">Customer details</h1>
        {user?.email && (
          <p className="text-sm text-gray-600">Signed in as {user.email}</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="text-blue-600 underline text-sm"
            onClick={() => router.push("/app/customers")}
          >
            ← Back to customers
          </button>
        </div>
        {createdAt && (
          <p className="mt-1 text-xs text-gray-500">
            Created: {new Date(createdAt).toLocaleString()}
          </p>
        )}
      </header>

      {(authError || errorMsg) && (
        <div className="mb-4 p-3 border border-red-400 bg-red-50 text-red-700 text-sm rounded">
          {authError || errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 border border-green-400 bg-green-50 text-green-700 text-sm rounded">
          {successMsg}
        </div>
      )}

      <section className="border rounded p-4">
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">First Name *</label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Last Name *</label>
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
                <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Customer Email *</label>
              <input
                type="email"
                className="w-full border rounded px-2 py-1 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Customer Phone *</label>
              <input
                type="tel"
                className="w-full border rounded px-2 py-1 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Address Line 1 *</label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Address Line 2 *</label>
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
                <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1 text-sm"
                value={addressLine3}
                onChange={(e) => setAddressLine3(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Postcode *</label>
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
          </div>

          <div className="flex items-center gap-3 mt-2">
            <button
              type="submit"
              className="px-4 py-2 border rounded text-sm bg-black text-white disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>

            {successMsg && !saving && (
              <span className="text-xs text-green-700">Saved ✓</span>
            )}

            <button
              type="button"
              className="px-3 py-2 border rounded text-xs"
              onClick={() => router.push("/app/customers")}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
