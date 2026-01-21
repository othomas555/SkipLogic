// pages/api/driver/login.js
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  makeOpaqueToken,
  hashOpaqueToken,
  buildDriverCookie,
  sessionExpiryDate,
} from "../../../lib/driverAuth";

function bad(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const { email, password } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPw = String(password || "");

  if (!cleanEmail || !cleanPw) return bad(res, "Missing email or password");

  const supabase = getSupabaseAdmin();

  const { data: driver, error } = await supabase
    .from("drivers")
    .select("id, email, password_hash")
    .ilike("email", cleanEmail)
    .maybeSingle();

  if (error) return bad(res, "Login failed", 500);
  if (!driver) return bad(res, "Invalid credentials", 401);
  if (!driver.password_hash) return bad(res, "Password not set", 401);

  const ok = await bcrypt.compare(cleanPw, driver.password_hash);
  if (!ok) return bad(res, "Invalid credentials", 401);

  const token = makeOpaqueToken();
  const sessionHash = hashOpaqueToken(token);
  const expires = sessionExpiryDate();

  const { error: sErr } = await supabase.from("driver_sessions").insert({
    driver_id: driver.id,
    session_hash: sessionHash,
    expires_at: expires.toISOString(),
  });

  if (sErr) return bad(res, "Could not create session", 500);

  // 30 days in seconds
  const maxAgeSeconds = 30 * 24 * 60 * 60;
  res.setHeader("Set-Cookie", buildDriverCookie(token, { maxAgeSeconds }));

  return res.json({ ok: true });
}
