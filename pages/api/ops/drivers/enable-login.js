// pages/api/ops/drivers/enable-login.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { supabase } from "../../../../lib/supabaseClient";

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Office-auth check (client session)
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) return res.status(401).json({ error: "Not authenticated" });

    // Fetch profile to confirm office/staff role + subscriber_id
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, subscriber_id, role")
      .eq("id", user.id)
      .single();

    if (profErr || !prof) return res.status(403).json({ error: "No profile / forbidden" });

    const role = String(prof.role || "");
    if (!["owner", "staff", "admin"].includes(role)) {
      return res.status(403).json({ error: "Forbidden (office only)" });
    }

    const { driver_id, pin_length = 4, code_length = 6, force_reset = false } = req.body || {};
    if (!driver_id) return res.status(400).json({ error: "Missing driver_id" });

    const supabaseAdmin = getSupabaseAdmin();

    // Ensure driver belongs to same subscriber (important)
    const { data: driverRow, error: driverErr } = await supabaseAdmin
      .from("drivers")
      .select("id, subscriber_id, full_name, login_code, auth_user_id")
      .eq("id", driver_id)
      .single();

    if (driverErr || !driverRow) return res.status(404).json({ error: "Driver not found" });
    if (driverRow.subscriber_id !== prof.subscriber_id) {
      return res.status(403).json({ error: "Driver not in your subscriber" });
    }

    // Create or reuse login_code
    let loginCode = driverRow.login_code;
    if (!loginCode) {
      // try a few times to avoid unique collision
      for (let i = 0; i < 10; i++) {
        const c = randomCode(code_length);
        const { data: exists } = await supabaseAdmin
          .from("drivers")
          .select("id")
          .eq("login_code", c)
          .maybeSingle();
        if (!exists) {
          loginCode = c;
          break;
        }
      }
      if (!loginCode) return res.status(500).json({ error: "Failed to generate unique login code" });

      await supabaseAdmin.from("drivers").update({ login_code: loginCode }).eq("id", driver_id);
    }

    const pin = randomPin(pin_length);
    const email = toDriverEmail(loginCode);

    let authUserId = driverRow.auth_user_id;

    // If no auth user exists OR force_reset, create/update auth user credentials
    if (!authUserId) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: pin,
        email_confirm: true,
        user_metadata: { kind: "driver", login_code: loginCode, driver_id },
      });

      if (createErr || !created?.user?.id) {
        return res.status(500).json({ error: "Failed to create auth user", details: String(createErr?.message || "") });
      }
      authUserId = created.user.id;

      // Persist auth_user_id
      await supabaseAdmin.from("drivers").update({ auth_user_id: authUserId }).eq("id", driver_id);
    } else {
      if (force_reset) {
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password: pin,
          user_metadata: { kind: "driver", login_code: loginCode, driver_id },
        });
        if (updErr) {
          return res.status(500).json({ error: "Failed to reset PIN", details: String(updErr.message || "") });
        }
      } else {
        // Ensure metadata/email are correct; do not change password unless force_reset
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          email,
          user_metadata: { kind: "driver", login_code: loginCode, driver_id },
        });
      }
    }

    // Upsert profile mapping for the auth user
    const { error: upProfErr } = await supabaseAdmin.from("profiles").upsert(
      {
        id: authUserId,
        subscriber_id: prof.subscriber_id,
        email,
        role: "driver",
        driver_id: driver_id,
      },
      { onConflict: "id" }
    );

    if (upProfErr) return res.status(500).json({ error: "Failed to upsert profile", details: String(upProfErr.message || "") });

    return res.json({
      ok: true,
      driver_id,
      login_code: loginCode,
      pin: force_reset || !driverRow.auth_user_id ? pin : pin, // returned for office to give driver
      note: "PIN is only shown here. Store it safely and reset if lost.",
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
