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

  // store as text, but enforce a sensible format:
  // allow digits + letters + hyphen/underscore (some orgs use non-numeric codes)
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return `${fieldName} has invalid characters`;

  if (v.length > 50) return `${fieldName} is too long`;
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
  // Creates the row if missing. If it already exists, no-op.
  const { error: insErr } = await supabaseAdmin
    .from("invoice_settings")
    .insert([{ subscriber_id: subscriberId }], { returning: "minimal" });

  // If duplicate, ignore. Supabase/PostgREST returns 409-ish errors depending on config.
  // We treat any unique-violation as ok and continue to select.
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

export default async function handler(req, res) {
  const supabaseAdmin = getSupabaseAdmin();

  // Auth: office users only (drivers do not have Supabase auth tokens)
  const auth = await getSubscriberIdFromAuth(req, supabaseAdmin);
  if (!auth.ok) return json(res, 401, { ok: false, error: auth.error });

  const { subscriberId } = auth;

  if (req.method === "GET") {
    const ensured = await ensureDefaultsRow(subscriberId, supabaseAdmin);
    if (!ensured.ok) return json(res, 500, { ok: false, error: ensured.error });

    const { data, error } = await supabaseAdmin
      .from("invoice_settings")
      .select(
        "subscriber_id, skip_hire_sales_account_code, permit_sales_account_code, card_clearing_account_code, sales_categories, use_defaults_when_missing, created_at, updated_at"
      )
      .eq("subscriber_id", subscriberId)
      .single();

    if (error) return json(res, 500, { ok: false, error: error.message });

    return json(res, 200, { ok: true, settings: data });
  }

  if (req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const skipHire = asText(body.skip_hire_sales_account_code);
    const permit = asText(body.permit_sales_account_code);
    const cardClearing = asText(body.card_clearing_account_code);

    const salesCategories = body.sales_categories;
    const useDefaults = typeof body.use_defaults_when_missing === "boolean" ? body.use_defaults_when_missing : true;

    const errors = [];
    const e1 = validateAccountCode(skipHire, "skip_hire_sales_account_code");
    const e2 = validateAccountCode(permit, "permit_sales_account_code");
    const e3 = validateAccountCode(cardClearing, "card_clearing_account_code");
    if (e1) errors.push(e1);
    if (e2) errors.push(e2);
    if (e3) errors.push(e3);

    if (salesCategories !== undefined && !isJsonArray(salesCategories)) {
      errors.push("sales_categories must be an array");
    }

    if (errors.length) return json(res, 400, { ok: false, error: "Validation failed", errors });

    // Ensure row exists so upsert is deterministic
    const ensured = await ensureDefaultsRow(subscriberId, supabaseAdmin);
    if (!ensured.ok) return json(res, 500, { ok: false, error: ensured.error });

    const updatePayload = {
      skip_hire_sales_account_code: skipHire,
      permit_sales_account_code: permit,
      card_clearing_account_code: cardClearing,
      use_defaults_when_missing: useDefaults,
    };

    if (salesCategories !== undefined) {
      updatePayload.sales_categories = salesCategories;
    }

    const { data, error } = await supabaseAdmin
      .from("invoice_settings")
      .update(updatePayload)
      .eq("subscriber_id", subscriberId)
      .select(
        "subscriber_id, skip_hire_sales_account_code, permit_sales_account_code, card_clearing_account_code, sales_categories, use_defaults_when_missing, created_at, updated_at"
      )
      .single();

    if (error) return json(res, 500, { ok: false, error: error.message });

    return json(res, 200, { ok: true, settings: data });
  }

  return json(res, 405, { ok: false, error: "Method not allowed" });
}
