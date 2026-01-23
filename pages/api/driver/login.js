// pages/api/driver/login.js
import crypto from "crypto";
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

function parseStored(stored) {
  // format: pbkdf2$sha256$210000$saltHex$hashHex
  const s = String(stored || "");
  const parts = s.split("$");
  if (parts.length !== 5) return null;
  const [kind, algo, itersStr, saltHex, hashHex] = parts;
  if (kind !== "pbkdf2") return null;
  if (algo !== "sha256") return null;
  const iterations = Number(itersStr);
  if (!Number.isFinite(iterations) || iterations < 10000) return null;
  if (!saltHex || !hashHex) return null;
  return { iterations, saltHex, hashHex };
}

function verifyPasswordPBKDF2(password, stored) {
  const p = parseStored(stored);
  if (!p) return false;

  const { iterations, saltHex, hashHex } = p;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  const actual = crypto.pbkdf2Sync(String(password), salt, iterations, expected.length, "sha256");

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

async function findDriverByEmailLoose(supabase, cleanEmail) {
  // 1) case-insensitive exact match
  let { data, error } = await supabase
    .from("drivers")
    .select("id, subscriber_id, email, password_hash, is_active")
    .ilike("email", cleanEmail)
    .limit(2);

  if (error) throw error;
  if (Array.isArray(data) && data.length === 1) return data[0];
  if (Array.isArray(data) && data.length > 1) throw new Error("Multiple drivers match email");

  // 2) fallback: starts-with match to handle trailing spaces in DB
  // (e.g. stored "name@domain.com " will match "name@domain.com%")
  ({ data, error } = await supabase
    .from("drivers")
    .select("id, subscriber_id, email, password_hash, is_active")
    .ilike("email", `${cleanEmail}%`)
    .limit(2));

  if (error) throw error;
  if (Array.isArray(data) && data.length === 1) return data[0];
  if (Array.isArray(data) && data.length > 1) throw new Error("Multiple drivers match email");

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const { email, password } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPw = String(password || "");

  if (!cleanEmail || !cleanPw) return bad(res, "Missing email or password");

  const supabase = getSupabaseAdmin();

  let driver = null;
  try {
    driver = await findDriverByEmailLoose(supabase, cleanEmail);
  } catch (e) {
    // don’t leak details to drivers; just fail safely
    return bad(res, "Invalid credentials", 401);
  }

  if (!driver) return bad(res, "Invalid credentials", 401);
  if (driver.is_active === false) return bad(res, "Invalid credentials", 401);
  if (!driver.password_hash) return bad(res, "Password not set", 401);

  const ok = verifyPasswordPBKDF2(cleanPw, driver.password_hash);
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
