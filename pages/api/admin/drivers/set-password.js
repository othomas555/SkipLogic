// pages/api/admin/drivers/set-password.js
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function bad(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  // TODO: enforce staff/admin auth here (your existing pattern)
  // e.g. verify Supabase staff session, check subscriber_id match, etc.
  // If you paste one of your existing protected admin API routes, I’ll wire it identically.

  const { driver_id, password } = req.body || {};
  const id = String(driver_id || "").trim();
  const pw = String(password || "");

  if (!id) return bad(res, "Missing driver_id");
  if (pw.length < 6) return bad(res, "Password too short (min 6)");

  const hash = await bcrypt.hash(pw, 10);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("drivers")
    .update({ password_hash: hash, password_set_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return bad(res, "Failed to set password", 500);

  return res.json({ ok: true });
}
