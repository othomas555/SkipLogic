// pages/api/admin/drivers/set-password.js
import crypto from "crypto";
import { supabase } from "../../../../lib/supabaseClient";

// NOTE: This uses the *logged-in staff user's* supabase client via cookies.
// It will only work if the caller is logged in as staff and RLS allows updating drivers.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { driver_id, password } = req.body || {};
  const id = String(driver_id || "").trim();
  const pw = String(password || "");

  if (!id) return res.status(400).json({ ok: false, error: "Missing driver_id" });
  if (pw.length < 6) return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });

  // PBKDF2 settings
  const iterations = 210000;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, iterations, 32, "sha256").toString("hex");
  const stored = `pbkdf2$sha256$${iterations}$${salt}$${hash}`;

  const { error } = await supabase
    .from("drivers")
    .update({
      password_hash: stored,
      password_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return res.status(500).json({ ok: false, error: error.message || "Failed to set password" });
  }

  return res.json({ ok: true });
}
