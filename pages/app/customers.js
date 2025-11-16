// pages/app/customers.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

export default function CustomersPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState(null);

  const [customers, setCustomers] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

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

  const [saving, setSaving] = useState(false);

  // Store subscriber_id once we’ve looked it up
  const [subscriberId, setSubscriberId] = useState(null);

  useEffect(() => {
    async function loadData() {
      setChecking(true);
      setErrorMsg("");

      // 1) Check auth
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email);

      // 2) Get profile → subscriber_id
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("subscriber_id")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error(profileError);
        setErrorMsg("Could not load profile / subscriber.");
        setChecking(false);
        return;
      }

      const subId = profile.subscriber_id;
      setSubscriberId(subId);

      // 3) Load customers for this subscriber
      const { data: customerRows, error: customersError } = await supabase
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
        .eq("subscriber_id", subId)
        .order("created_at", { ascending: false });

      if (customersError) {
        console.error(customersError);
        setErrorMsg("Could not load customers.");
      } else {
        setCustomers(customerRows || []);
      }

      setChecking(false);
    }

    loadData();
  }, [router]);

  async function handleAddCustomer(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!subscriberId) {
      setErrorMsg("Missing subscriber. Please refresh and try again.");
      return;
    }

    // Basic required field check
    if (!firstName || !lastName || !email || !phone || !addressLine1 || !postcode) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase.from("customers").insert([
      {
        subscriber_id: subscriberId,
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
      },
    ]).select(`
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
    `).single();

    if (error) {
      console.error(error);
      setErrorMsg("Could not save customer.");
      setSaving(false);
      return;
    }

    // Prepend new customer to list
    setCustomers((prev) => [data, ...prev]);

    // Reset form
    setFirstName("");
    setLastName("");
    setCompanyName("");
    setEmail("");
    setPhone("");
    setAddressLine1("");
    setAddressLine2("");
    setAddressLine3("");
    setPostcode("");
    setCreditAccount("no");

    setSaving(false);
  }

  if (checking) {
    return <p className="p-4">Checking session...</p>;
  }

  return (
    <main className="p-4 max-w-5xl mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold mb-1">Customers</h1>
        {userEmail && (
          <p className="text-sm text-gray-600">Signed in as {userEmail}</p>
        )}
        <button
          type="button"
          className="mt-2 text-blue-600 underline text-sm"
          onClick={() => router.push("/app")}
        >
          ← Back to dashboard
        </button>
      </header>

      {errorMsg && (
        <div className="mb-4 p-3 border border-red-400 bg-red-50 text-red-700 text-sm rounded">
          {errorMsg}
        </div>
      )}

      {/* Add customer form */}
      <section className="mb-8 border rounded p-4">
        <h2 className="text-lg font-semibold mb-3">Add customer</h2>

        <form onSubmit={handleAddCustomer} className="space-y-3">
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
                Company Name <span className="text-gray-400 text-xs">(optional)</span>
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
              <label className="block text-sm mb-1">Credit Account Customer *</label>
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

          <div>
            <button
              type="submit"
              className="px-4 py-2 border rounded text-sm bg-black text-white disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving..." : "Add customer"}
            </button>
          </div>
        </form>
      </section>

      {/* Customers table */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Existing customers</h2>

        {customers.length === 0 ? (
          <p className="text-sm text-gray-600">No customers found yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 text-left">Name</th>
                  <th className="border px-2 py-1 text-left">Company</th>
                  <th className="border px-2 py-1 text-left">Email</th>
                  <th className="border px-2 py-1 text-left">Phone</th>
                  <th className="border px-2 py-1 text-left">Address</th>
                  <th className="border px-2 py-1 text-left">Postcode</th>
                  <th className="border px-2 py-1 text-left">Credit Account</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="border px-2 py-1">
                      {c.first_name} {c.last_name}
                    </td>
                    <td className="border px-2 py-1">
                      {c.company_name || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="border px-2 py-1">{c.email}</td>
                    <td className="border px-2 py-1">{c.phone}</td>
                    <td className="border px-2 py-1">
                      {[c.address_line1, c.address_line2, c.address_line3]
                        .filter(Boolean)
                        .join(", ")}
                    </td>
                    <td className="border px-2 py-1">{c.postcode}</td>
                    <td className="border px-2 py-1">
                      {c.is_credit_account ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
