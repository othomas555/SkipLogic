// pages/api/driver/login.js
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

function normaliseLoginCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function buildDriverAuthEmail(loginCode) {
  return `${loginCode}@drivers.skiplogic.local`;
}

async function findDriverByLoginCode(supabase, loginCode) {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, subscriber_id, staff_id, is_active")
    .eq("staff_id", loginCode)
    .limit(2);

  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) return null;
  if (data.length > 1) throw new Error("Multiple drivers match login code");
  return data[0];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const { email, login, login_code, password } = req.body || {};
  const cleanLogin = normaliseLoginCode(login_code || login || email);
  const cleanPw = String(password || "");

  if (!cleanLogin || !cleanPw) return bad(res, "Missing login code or password");

  const supabase = getSupabaseAdmin();

  let driver = null;
  try {
    driver = await findDriverByLoginCode(supabase, cleanLogin);
  } catch (e) {
    return bad(res, "Invalid credentials", 401);
  }

  if (!driver) return bad(res, "Invalid credentials", 401);
  if (driver.is_active === false) return bad(res, "Invalid credentials", 401);

  const internalEmail = buildDriverAuthEmail(cleanLogin);

  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password: cleanPw,
  });

  if (signInErr || !signInData?.user) {
    return bad(res, "Invalid credentials", 401);
  }

  const token = makeOpaqueToken();
  const sessionHash = hashOpaqueToken(token);
  const expires = sessionExpiryDate();

  const { error: sErr } = await supabase.from("driver_sessions").insert({
    driver_id: driver.id,
    session_hash: sessionHash,
    expires_at: expires.toISOString(),
  });

  if (sErr) return bad(res, "Could not create session", 500);

  const maxAgeSeconds = 30 * 24 * 60 * 60;
  res.setHeader("Set-Cookie", buildDriverCookie(token, { maxAgeSeconds }));

  return res.json({ ok: true });
}
