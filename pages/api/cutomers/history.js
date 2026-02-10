// pages/api/customers/history.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function json(res, status, body) {
  return res.status(status).json(body);
}

function pickCustomerShape(c) {
  if (!c) return null;
  return {
    id: c.id,
    first_name: c.first_name || null,
    last_name: c.last_name || null,
    company_name: c.company_name || null,
    email: c.email || null,
    phone: c.phone || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });

  const customerId = String(req.query.customer_id || "").trim();
  if (!customerId) return json(res, 400, { ok: false, error: "Missing customer_id" });

  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return json(res, 401, { ok: false, error: "Missing auth token" });

  const supabase = getSupabaseAdmin();

  // 1) Resolve user from token
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json(res, 401, { ok: false, error: "Invalid auth token" });
  }

  const userId = userData.user.id;

  // 2) Resolve subscriber_id from profiles
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, subscriber_id")
    .eq("id", userId)
    .single();

  if (profErr || !profile?.subscriber_id) {
    return json(res, 403, { ok: false, error: "No subscriber found for this user" });
  }

  const subscriberId = profile.subscriber_id;

  // 3) Load customer (tenant scoped)
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, first_name, last_name, company_name, email, phone")
    .eq("id", customerId)
    .eq("subscriber_id", subscriberId)
    .single();

  if (custErr) {
    return json(res, 404, { ok: false, error: "Customer not found" });
  }

  const warnings = [];

  // Helper: try query a table; if missing/blocked, return [] + warning rather than breaking the page
  async function tryTable(tableName, buildQuery) {
    try {
      const q = buildQuery(supabase.from(tableName));
      const { data, error } = await q;
      if (error) {
        warnings.push(`${tableName}: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (e) {
      warnings.push(`${tableName}: ${e?.message || String(e)}`);
      return [];
    }
  }

  // === BEST-EFFORT table attempts (we will wire to your real schema after you paste warnings/JSON) ===

  // Jobs (common guesses)
  const jobs =
    (await tryTable("jobs", (t) =>
      t
        .select("id, created_at, job_date, date, job_type, type, status, total_inc_vat, price_inc_vat, total, ref, job_ref, booking_ref, site_name, address, delivery_address, postcode, delivery_postcode")
        .eq("subscriber_id", subscriberId)
        .eq("customer_id", customerId)
        .limit(500)
    )) ||
    [];

  // Invoices (common guesses)
  // Some builds store invoices in a dedicated table, others store invoice fields on jobs.
  const invoicesFromInvoicesTable = await tryTable("invoices", (t) =>
    t
      .select("id, created_at, issued_at, date, number, invoice_number, status, total_inc_vat, total, amount, url, xero_status, xero_invoice_number, subscriber_id, customer_id")
      .eq("subscriber_id", subscriberId)
      .eq("customer_id", customerId)
      .limit(500)
  );

  const invoicesFromXeroInvoices = await tryTable("xero_invoices", (t) =>
    t
      .select("id, created_at, date, number, status, total, url, subscriber_id, customer_id")
      .eq("subscriber_id", subscriberId)
      .eq("customer_id", customerId)
      .limit(500)
  );

  let invoices = [];
  if ((invoicesFromInvoicesTable || []).length > 0) invoices = invoicesFromInvoicesTable;
  else if ((invoicesFromXeroInvoices || []).length > 0) invoices = invoicesFromXeroInvoices;
  else {
    // fallback: derive "invoices" from jobs if they contain invoice-ish fields
    const derived = (jobs || [])
      .map((j) => {
        const number = j.invoice_number || j.xero_invoice_number || j.number || null;
        const status = j.invoice_status || j.xero_status || null;
        const total = j.invoice_total_inc_vat || j.total_inc_vat || j.price_inc_vat || j.total || null;
        const date = j.invoice_date || j.date || j.job_date || j.created_at || null;
        if (!number && !status) return null;
        return {
          id: j.invoice_id || j.xero_invoice_id || j.id,
          date,
          number,
          status,
          total_inc_vat: total,
          url: j.invoice_url || j.xero_invoice_url || null,
        };
      })
      .filter(Boolean);

    invoices = derived;
    if (derived.length === 0) warnings.push("Invoices: no matching invoice tables found and no invoice fields detected on jobs.");
  }

  // WTNs (common guesses)
  const wtnsFromWasteOut = await tryTable("waste_out", (t) =>
    t
      .select("id, created_at, date, wtn_number, number, description, notes, customer_id, subscriber_id")
      .eq("subscriber_id", subscriberId)
      .eq("customer_id", customerId)
      .limit(500)
  );

  const wtnsFromWtnTable = await tryTable("waste_transfer_notes", (t) =>
    t
      .select("id, created_at, date, wtn_number, number, description, notes, customer_id, subscriber_id")
      .eq("subscriber_id", subscriberId)
      .eq("customer_id", customerId)
      .limit(500)
  );

  const wtns = (wtnsFromWtnTable || []).length > 0 ? wtnsFromWtnTable : wtnsFromWasteOut;

  return json(res, 200, {
    ok: true,
    customer: pickCustomerShape(customer),
    jobs,
    invoices,
    wtns,
    warnings,
  });
}
