// pages/api/settings/invoicing.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function isJsonArray(val) {
  return Array.isArray(val);
}

function validateAccountCode(code, fieldName) {
  const v = asText(code);
  if (!v) return `${fieldName} is required`;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return `${fieldName} has invalid characters`;
  if (v.length > 80) return `${fieldName} is too long`;
  return null;
}

async function getSubscriberIdFromAuth(req, supabaseAdmin) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, error: "Missing Authorization Bearer token" };

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user?.id) return { ok: false, error: "Invalid token" };

  const userId = userData.user.id;

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("subscriber_id")
    .eq("id", userId)
    .single();

  if (profErr) return { ok: false, error: `Profile lookup failed: ${profErr.message}` };
  if (!profile?.subscriber_id) return { ok: false, error: "No subscriber_id on profile" };

  return { ok: true, userId, subscriberId: profile.subscriber_id };
}

async function ensureDefaultsRow(subscriberId, supabaseAdmin) {
  const { error: insErr } = await supabaseAdmin
    .from("invoice_settings")
    .insert([{ subscriber_id: subscriberId }], { returning: "minimal" });

  if (insErr) {
    const msg = String(insErr.message || "");
    const code = String(insErr.code || "");
    const details = String(insErr.details || "");
    const combined = `${code} ${msg} ${details}`.toLowerCase();

    const looksLikeUnique =
      combined.includes("duplicate") ||
      combined.includes("unique") ||
      combined.includes("23505");

    if (!looksLikeUnique) {
      return { ok: false, error: `Failed to create defaults row: ${insErr.message}` };
    }
  }

  return { ok: true };
}

const SETTINGS_SELECT = `
  subscriber_id,
  skip_hire_sales_account_code,
  term_hire_extension_sales_account_code,
  permit_sales_account_code,
  card_clearing_account_code,
  cash_bank_account_code,
  sales_categories,
  use_defaults_when_missing,
  created_at,
  updated_at
`;

export default async function handler(req, res) {
  const supabaseAdmin = getSupabaseAdmin();

  const auth = await getSubscriberIdFromAuth(req, supabaseAdmin);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.error });

  const { subscriberId } = auth;

  if (req.method === "GET") {
    const ensured = await ensureDefaultsRow(subscriberId, supabaseAdmin);
    if (!ensured.ok) return json(res, 500, { ok: false, error: ensured.error });

    const { data, error } = await supabaseAdmin
      .from("invoice_settings")
      .select(SETTINGS_SELECT)
      .eq("subscriber_id", subscriberId)
      .single();

    if (error) return json(res, 500, { ok: false, error: error.message });

    return json(res, 200, { ok: true, settings: data });
  }

  if (req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const skipHire = asText(body.skip_hire_sales_account_code);
    const termHireExtension = asText(body.term_hire_extension_sales_account_code) || skipHire;
    const permit = asText(body.permit_sales_account_code);
    const cardClearing = asText(body.card_clearing_account_code);
    const cashBank = asText(body.cash_bank_account_code);

    const salesCategories = body.sales_categories;
    const useDefaults =
      typeof body.use_defaults_when_missing === "boolean"
        ? body.use_defaults_when_missing
        : true;

    const errors = [];

    const e1 = validateAccountCode(skipHire, "skip_hire_sales_account_code");
    const e2 = validateAccountCode(termHireExtension, "term_hire_extension_sales_account_code");
    const e3 = validateAccountCode(permit, "permit_sales_account_code");
    const e4 = validateAccountCode(cardClearing, "card_clearing_account_code");
    const e5 = validateAccountCode(cashBank, "cash_bank_account_code");

    if (e1) errors.push(e1);
    if (e2) errors.push(e2);
    if (e3) errors.push(e3);
    if (e4) errors.push(e4);
    if (e5) errors.push(e5);

    if (salesCategories !== undefined && !isJsonArray(salesCategories)) {
      errors.push("sales_categories must be an array");
    }

    if (errors.length) {
      return json(res, 400, { ok: false, error: "Validation failed", errors });
    }

    const ensured = await ensureDefaultsRow(subscriberId, supabaseAdmin);
    if (!ensured.ok) return json(res, 500, { ok: false, error: ensured.error });

    const updatePayload = {
      skip_hire_sales_account_code: skipHire,
      term_hire_extension_sales_account_code: termHireExtension,
      permit_sales_account_code: permit,
      card_clearing_account_code: cardClearing,
      cash_bank_account_code: cashBank,
      use_defaults_when_missing: useDefaults,
    };

    if (salesCategories !== undefined) {
      updatePayload.sales_categories = salesCategories;
    }

    const { data, error } = await supabaseAdmin
      .from("invoice_settings")
      .update(updatePayload)
      .eq("subscriber_id", subscriberId)
      .select(SETTINGS_SELECT)
      .single();

    if (error) return json(res, 500, { ok: false, error: error.message });

    return json(res, 200, { ok: true, settings: data });
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
}
