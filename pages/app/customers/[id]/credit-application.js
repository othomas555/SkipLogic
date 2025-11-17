// pages/app/customers/[id]/credit-application.js
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuthProfile } from "../../../../lib/useAuthProfile";

export default function CreditApplicationPage() {
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

  const [customer, setCustomer] = useState(null);

  useEffect(() => {
    async function loadCustomer() {
      if (!customerId || !subscriberId) return;

      setLoading(true);
      setErrorMsg("");

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

      setCustomer(data);
      setLoading(false);
    }

    if (!checking && subscriberId && customerId) {
      loadCustomer();
    }
  }, [checking, subscriberId, customerId]);

  function formatAddress(c) {
    if (!c) return "";
    return [c.address_line1, c.address_line2, c.address_line3]
      .filter(Boolean)
      .join(", ");
  }

  if (checking || loading || !customerId) {
    return <p className="p-4">Loading credit application…</p>;
  }

  if (authError) {
    return (
      <main className="p-4 max-w-3xl mx-auto font-sans">
        <div className="mb-4 p-3 border border-red-400 bg-red-50 text-red-700 text-sm rounded">
          {authError}
        </div>
      </main>
    );
  }

  if (errorMsg) {
    return (
      <main className="p-4 max-w-3xl mx-auto font-sans">
        <div className="mb-4 p-3 border border-red-400 bg-red-50 text-red-700 text-sm rounded">
          {errorMsg}
        </div>
      </main>
    );
  }

  if (!customer) {
    return (
      <main className="p-4 max-w-3xl mx-auto font-sans">
        <p className="text-sm text-gray-700">Customer not found.</p>
      </main>
    );
  }

  const today = new Date().toLocaleDateString("en-GB");
  const displayName = customer.company_name
    ? customer.company_name
    : `${customer.first_name || ""} ${customer.last_name || ""}`.trim();

  return (
    <main className="p-4 max-w-3xl mx-auto font-sans bg-white">
      {/* Top actions (not printed nicely if you use @media print later) */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          className="text-blue-600 underline text-sm"
          onClick={() => router.push(`/app/customers/${customer.id}`)}
        >
          ← Back to customer
        </button>

        <div className="flex items-center gap-2">
          {user?.email && (
            <span className="text-xs text-gray-500">
              Signed in as {user.email}
            </span>
          )}
          <button
            type="button"
            className="px-3 py-1 border rounded text-xs bg-black text-white"
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* "Document" area */}
      <div className="border rounded p-6 text-sm leading-relaxed">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold mb-1">
            AROC Skips
          </h1>
          <p className="text-xs text-gray-600">
            Credit Account Application
          </p>
        </header>

        <section className="mb-4 text-xs text-gray-600">
          <p>
            <span className="font-semibold">Account Code:</span>{" "}
            {customer.account_code || "—"}
          </p>
          <p>
            <span className="font-semibold">Date:</span> {today}
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold mb-2">
            1. Customer Details
          </h2>
          <div className="space-y-1 text-xs">
            <p>
              <span className="font-semibold">Company Name:</span>{" "}
              {displayName || "______________________________"}
            </p>
            <p>
              <span className="font-semibold">Registered Address:</span>
            </p>
            <p className="ml-4">
              {formatAddress(customer) || "______________________________"}
            </p>
            <p className="ml-4">
              {customer.postcode || "______________________________"}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Contact Name:</span>{" "}
              {customer.first_name || customer.last_name
                ? `${customer.first_name || ""} ${
                    customer.last_name || ""
                  }`.trim()
                : "______________________________"}
            </p>
            <p>
              <span className="font-semibold">Phone:</span>{" "}
              {customer.phone || "______________________________"}
            </p>
            <p>
              <span className="font-semibold">Email for Invoices:</span>{" "}
              {customer.email || "______________________________"}
            </p>
            <p className="mt-2">
              <span className="font-semibold">Company Number:</span>{" "}
              ______________________________
            </p>
            <p>
              <span className="font-semibold">VAT Number:</span>{" "}
              ______________________________
            </p>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold mb-2">
            2. Invoice & Payment Terms
          </h2>
          <div className="text-xs space-y-1">
            <p>
              • Standard payment terms are{" "}
              <span className="font-semibold">30 days</span> from
              invoice date (unless otherwise agreed in writing).
            </p>
            <p>
              • Invoices will be sent by email to the address
              provided above.
            </p>
            <p>
              • All skips remain the property of{" "}
              <span className="font-semibold">AROC Skips</span> until
              paid for in full.
            </p>
            <p>
              • Overdue accounts may be placed on stop without
              notice.
            </p>
            <p>
              • Interest may be charged on overdue balances in
              accordance with Late Payment of Commercial Debts
              legislation.
            </p>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold mb-2">
            3. Trade References (optional)
          </h2>
          <div className="text-xs space-y-4">
            <div>
              <p>
                <span className="font-semibold">Supplier 1:</span>
              </p>
              <p>Name: ______________________________</p>
              <p>Phone / Email: ______________________</p>
              <p>Account Number: _____________________</p>
            </div>
            <div>
              <p>
                <span className="font-semibold">Supplier 2:</span>
              </p>
              <p>Name: ______________________________</p>
              <p>Phone / Email: ______________________</p>
              <p>Account Number: _____________________</p>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold mb-2">
            4. Authorisation
          </h2>
          <p className="text-xs mb-3">
            I/We apply for a credit account with{" "}
            <span className="font-semibold">AROC Skips</span> and
            agree to be bound by the terms and conditions of trade.
          </p>
          <div className="text-xs space-y-4">
            <div>
              <p>Signed: ______________________________</p>
              <p>Name: ________________________________</p>
              <p>Position: _____________________________</p>
              <p>Date: ____ / ____ / ______</p>
            </div>
          </div>
        </section>

        <section className="mb-2">
          <h2 className="text-sm font-semibold mb-2">
            5. For Office Use Only
          </h2>
          <div className="text-xs space-y-2">
            <p>Approved by: __________________________</p>
            <p>Date: ____ / ____ / ______</p>
            <p>Credit limit: £ ________________________</p>
            <p>Notes: ________________________________</p>
            <p>______________________________________</p>
          </div>
        </section>
      </div>
    </main>
  );
}
