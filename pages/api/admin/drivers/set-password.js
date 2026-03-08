// pages/api/admin/drivers/set-password.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function bad(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

function normaliseLoginCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function buildDriverAuthEmail(loginCode) {
  return `${loginCode}@drivers.skiplogic.local`;
}

async function findAuthUserByEmail(admin, email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find(
      (u) => String(u.email || "").trim().toLowerCase() === email
    );

    if (found) return found;
    if (users.length < perPage) return null;

    page += 1;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  try {
    const admin = getSupabaseAdmin();

    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

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

    const { data: driver, error: drvErr } = await admin
      .from("drivers")
      .select("id, subscriber_id, staff_id, name, is_active")
      .eq("id", driverId)
      .maybeSingle();

    if (drvErr) return bad(res, drvErr.message || "Could not load driver", 500);
    if (!driver) return bad(res, "Driver not found", 404);
    if (String(driver.subscriber_id) !== subId) return bad(res, "Forbidden", 403);
    if (driver.is_active === false) return bad(res, "Driver is inactive", 400);

    const loginCode = normaliseLoginCode(driver.staff_id);
    if (!loginCode) return bad(res, "Driver login code is required");

    const email = buildDriverAuthEmail(loginCode);

    let authUserId = null;

    const existingUser = await findAuthUserByEmail(admin, email);

    if (existingUser?.id) {
      authUserId = existingUser.id;

      const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
        email,
        password: pw,
        email_confirm: true,
        user_metadata: {
          role: "driver",
          driver_id: driverId,
          subscriber_id: subId,
          login_code: loginCode,
          name: driver.name || "",
        },
      });

      if (updErr) {
        return bad(res, updErr.message || "Failed to update password", 500);
      }
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: pw,
        email_confirm: true,
        user_metadata: {
          role: "driver",
          driver_id: driverId,
          subscriber_id: subId,
          login_code: loginCode,
          name: driver.name || "",
        },
      });

      if (createErr || !created?.user?.id) {
        return bad(res, createErr?.message || "Failed to create auth user", 500);
      }

      authUserId = created.user.id;
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: authUserId,
          email,
          subscriber_id: subId,
          role: "driver",
          driver_id: driverId,
        },
        { onConflict: "id" }
      );

    if (profileErr) {
      return bad(res, profileErr.message || "Password set but profile link failed", 500);
    }

    const { error: upErr } = await admin
      .from("drivers")
      .update({
        password_set_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", driverId)
      .eq("subscriber_id", subId);

    if (upErr) {
      return bad(res, upErr.message || "Password set but driver update failed", 500);
    }

    return res.json({
      ok: true,
      login_code: loginCode,
    });
  } catch (e) {
    console.error("set-password error:", e);
    return bad(res, e?.message || "Unexpected server error", 500);
  }
}
