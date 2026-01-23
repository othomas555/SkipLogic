// pages/api/admin/drivers/set-password.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function bad(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const admin = getSupabaseAdmin();

  // Office auth (Bearer token)
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return bad(res, "Missing auth token", 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const officeUser = userData?.user;
  if (userErr || !officeUser) return bad(res, "Invalid auth token", 401);

  const { driver_id, password, subscriber_id } = req.body || {};
  const driverId = String(driver_id || "").trim();
  const pw = String(password || "");
  const subId = String(subscriber_id || "").trim();

  if (!driverId) return bad(res, "Missing driver_id");
  if (!subId) return bad(res, "Missing subscriber_id");
  if (pw.length < 6) return bad(res, "Password must be at least 6 characters");

  // Load driver (must belong to subscriber)
  const { data: driver, error: drvErr } = await admin
    .from("drivers")
    .select("id, subscriber_id, email")
    .eq("id", driverId)
    .maybeSingle();

  if (drvErr) return bad(res, "Could not load driver", 500);
  if (!driver) return bad(res, "Driver not found", 404);
  if (String(driver.subscriber_id) !== subId) return bad(res, "Forbidden", 403);
  if (!driver.email) return bad(res, "Driver has no email set");

  const email = String(driver.email).trim().toLowerCase();

  // Try to find existing auth user
  let authUserId = null;

  const { data: existingUser, error: findErr } = await admin.auth.admin.getUserByEmail(email);
  if (findErr && !findErr.message.includes("User not found")) {
    return bad(res, "Auth lookup failed", 500);
  }

  if (existingUser?.user?.id) {
    // Update password
    authUserId = existingUser.user.id;

    const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
      password: pw,
    });

    if (updErr) return bad(res, updErr.message || "Failed to update password", 500);
  } else {
    // Create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
    });

    if (createErr || !created?.user?.id) {
      return bad(res, createErr?.message || "Failed to create auth user", 500);
    }

    authUserId = created.user.id;
  }

  // Update driver row for UI tracking only
  const { error: upErr } = await admin
    .from("drivers")
    .update({
      password_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", driverId)
    .eq("subscriber_id", subId);

  if (upErr) return bad(res, "Password set but driver update failed", 500);

  return res.json({ ok: true });
}
