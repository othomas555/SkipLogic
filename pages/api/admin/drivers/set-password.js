// pages/api/admin/drivers/set-password.js
import crypto from "crypto";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function bad(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

function makePBKDF2Hash(password) {
  const iterations = 210000;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$sha256$${iterations}$${salt}$${hash}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const supabase = getSupabaseAdmin();

  // Require staff auth token from the browser (so this isn't open to the world)
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) return bad(res, "Missing auth token", 401);

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;

  if (userErr || !user) return bad(res, "Invalid auth token", 401);

  const { driver_id, password, subscriber_id } = req.body || {};
  const id = String(driver_id || "").trim();
  const pw = String(password || "");
  const subId = String(subscriber_id || "").trim();

  if (!id) return bad(res, "Missing driver_id");
  if (!subId) return bad(res, "Missing subscriber_id");
  if (pw.length < 6) return bad(res, "Password must be at least 6 characters");

  // Extra safety: ensure driver belongs to the subscriber_id from the staff UI
  const { data: existing, error: exErr } = await supabase
    .from("drivers")
    .select("id, subscriber_id")
    .eq("id", id)
    .maybeSingle();

  if (exErr) return bad(res, "Could not load driver", 500);
  if (!existing) return bad(res, "Driver not found", 404);
  if (String(existing.subscriber_id || "") !== subId) return bad(res, "Forbidden", 403);

  const stored = makePBKDF2Hash(pw);

  // IMPORTANT: select() so we can detect 0-row update
  const { data: updated, error: upErr } = await supabase
    .from("drivers")
    .update({
      password_hash: stored,
      password_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("subscriber_id", subId)
    .select("id, password_set_at")
    .maybeSingle();

  if (upErr) return bad(res, upErr.message || "Failed to set password", 500);
  if (!updated) return bad(res, "Password not saved (no rows updated)", 500);

  return res.json({ ok: true, password_set_at: updated.password_set_at });
}
