// pages/api/ops/drivers/enable-login.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function randomPin(len = 4) {
  let out = "";
  for (let i = 0; i < len; i++) out += String(Math.floor(Math.random() * 10));
  return out;
}

function toDriverEmail(loginCode) {
  const code = String(loginCode || "").trim().toLowerCase();
  return `${code}@drivers.skiplogic.local`;
}

function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const s = String(h);
  if (!s.toLowerCase().startsWith("bearer ")) return "";
  return s.slice(7).trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const admin = getSupabaseAdmin();

    // Auth (office user) via Bearer token
    const accessToken = getBearerToken(req);
    if (!accessToken) return res.status(401).json({ ok: false, error: "Not authenticated (missing bearer token)" });

    const { data: tokenUser, error: tokenErr } = await admin.auth.getUser(accessToken);
    const officeUser = tokenUser?.user;
    if (tokenErr || !officeUser?.id) return res.status(401).json({ ok: false, error: "Not authenticated (invalid token)" });

    // Office profile / role check
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("id, subscriber_id, role")
      .eq("id", officeUser.id)
      .single();

    if (profErr || !prof) return res.status(403).json({ ok: false, error: "No profile / forbidden", details: profErr?.message });

    const role = String(prof.role || "");
    if (!["owner", "staff", "admin"].includes(role)) {
      return res.status(403).json({ ok: false, error: "Forbidden (office only)" });
    }

    const { driver_id, pin_length = 4, code_length = 6, force_reset = true } = req.body || {};
    if (!driver_id) return res.status(400).json({ ok: false, error: "Missing driver_id" });

    // Driver lookup (your table uses `name`)
    const { data: driverRow, error: driverErr } = await admin
      .from("drivers")
      .select("id, subscriber_id, name, login_code, auth_user_id")
      .eq("id", driver_id)
      .single();

    if (driverErr) return res.status(500).json({ ok: false, error: "Driver lookup failed", details: driverErr.message });
    if (!driverRow) return res.status(404).json({ ok: false, error: "Driver not found" });
    if (driverRow.subscriber_id !== prof.subscriber_id) return res.status(403).json({ ok: false, error: "Driver not in your subscriber" });

    // Generate or reuse login_code
    let loginCode = driverRow.login_code;
    if (!loginCode) {
      for (let i = 0; i < 10; i++) {
        const c = randomCode(code_length);
        const { data: exists, error: exErr } = await admin.from("drivers").select("id").eq("login_code", c).maybeSingle();
        if (exErr) return res.status(500).json({ ok: false, error: "Code uniqueness check failed", details: exErr.message });
        if (!exists) {
          loginCode = c;
          break;
        }
      }
      if (!loginCode) return res.status(500).json({ ok: false, error: "Failed to generate unique login code" });

      const { error: updCodeErr } = await admin.from("drivers").update({ login_code: loginCode }).eq("id", driver_id);
      if (updCodeErr) return res.status(500).json({ ok: false, error: "Failed to save login code", details: updCodeErr.message });
    }

    const pin = randomPin(pin_length);
    const email = toDriverEmail(loginCode);

    let authUserId = driverRow.auth_user_id;

    // If driver already linked, just reset PIN (if requested) + ensure metadata/email correct
    if (authUserId) {
      if (force_reset) {
        const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
          password: pin,
          user_metadata: { kind: "driver", login_code: loginCode, driver_id },
        });
        if (updErr) return res.status(500).json({ ok: false, error: "Failed to reset PIN", details: updErr.message });
      }

      const { error: updEmailErr } = await admin.auth.admin.updateUserById(authUserId, {
        email,
        user_metadata: { kind: "driver", login_code: loginCode, driver_id },
      });
      if (updEmailErr) return res.status(500).json({ ok: false, error: "Failed to update auth user", details: updEmailErr.message });
    } else {
      // Create auth user
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: pin,
        email_confirm: true,
        user_metadata: { kind: "driver", login_code: loginCode, driver_id },
      });

      if (createErr) {
        // Common case: email already exists (previous partial attempt)
        const msg = String(createErr.message || "");
        const looksDuplicate = msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists") || msg.toLowerCase().includes("registered");

        if (looksDuplicate) {
          // Try to find existing driver profile by email (since your trigger auto-creates profiles on auth.users insert)
          const { data: existingProf, error: findErr } = await admin
            .from("profiles")
            .select("id, subscriber_id, role, driver_id, email")
            .eq("subscriber_id", prof.subscriber_id)
            .eq("email", email)
            .maybeSingle();

          if (findErr) {
            return res.status(500).json({ ok: false, error: "Auth user exists but lookup failed", details: findErr.message });
          }

          if (!existingProf?.id) {
            return res.status(500).json({ ok: false, error: "Failed to create auth user", details: createErr.message });
          }

          authUserId = existingProf.id;

          // Reset PIN on that existing auth user
          const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
            password: pin,
            user_metadata: { kind: "driver", login_code: loginCode, driver_id },
          });
          if (updErr) return res.status(500).json({ ok: false, error: "Failed to reset PIN on existing auth user", details: updErr.message });

          // Link driver row
          const { error: updAuthErr } = await admin.from("drivers").update({ auth_user_id: authUserId }).eq("id", driver_id);
          if (updAuthErr) return res.status(500).json({ ok: false, error: "Failed to link existing auth user", details: updAuthErr.message });
        } else {
          // Most likely missing/invalid service role key
          return res.status(500).json({
            ok: false,
            error: "Failed to create auth user",
            details: createErr.message,
          });
        }
      } else {
        if (!created?.user?.id) return res.status(500).json({ ok: false, error: "Failed to create auth user", details: "No user id returned" });
        authUserId = created.user.id;

        const { error: updAuthErr } = await admin.from("drivers").update({ auth_user_id: authUserId }).eq("id", driver_id);
        if (updAuthErr) return res.status(500).json({ ok: false, error: "Failed to link auth user", details: updAuthErr.message });
      }
    }

    // Upsert profile mapping for driver auth user
    const { error: upProfErr } = await admin.from("profiles").upsert(
      {
        id: authUserId,
        subscriber_id: prof.subscriber_id,
        email,
        role: "driver",
        driver_id,
      },
      { onConflict: "id" }
    );

    if (upProfErr) return res.status(500).json({ ok: false, error: "Failed to upsert profile", details: upProfErr.message });

    return res.json({ ok: true, driver_id, login_code: loginCode, pin });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Server error", details: String(e?.message || e) });
  }
}
