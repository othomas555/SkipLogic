// lib/driverAuth.js
import crypto from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";

const COOKIE_NAME = "sl_driver_session";

// 30 days
const SESSION_DAYS = 30;

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

export function buildDriverCookie(value, { maxAgeSeconds }) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

export function clearDriverCookie() {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=0`,
  ];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}

export function readDriverSessionToken(req) {
  const raw = req?.headers?.cookie || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return "";
  try {
    return decodeURIComponent(m[1] || "");
  } catch {
    return "";
  }
}

export function makeOpaqueToken() {
  // 32 bytes => 64 hex chars. Plenty.
  return crypto.randomBytes(32).toString("hex");
}

export function hashOpaqueToken(token) {
  return sha256Hex(token);
}

export function sessionExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

export async function getDriverFromSession(req) {
  const supabase = getSupabaseAdmin();
  const token = readDriverSessionToken(req);
  if (!token) return { ok: false, reason: "missing_cookie" };

  const sessionHash = hashOpaqueToken(token);

  // Look up session
  const { data: sess, error: sessErr } = await supabase
    .from("driver_sessions")
    .select("driver_id, expires_at")
    .eq("session_hash", sessionHash)
    .maybeSingle();

  if (sessErr) return { ok: false, reason: "session_lookup_failed" };
  if (!sess) return { ok: false, reason: "invalid_session" };

  const exp = new Date(sess.expires_at);
  if (Number.isNaN(exp.getTime()) || exp <= new Date()) {
    return { ok: false, reason: "expired_session" };
  }

  // Load driver
  const { data: driver, error: dErr } = await supabase
    .from("drivers")
    .select("id, email, subscriber_id, full_name")
    .eq("id", sess.driver_id)
    .maybeSingle();

  if (dErr || !driver) return { ok: false, reason: "driver_not_found" };

  // Touch last_seen
  await supabase
    .from("driver_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("session_hash", sessionHash);

  return { ok: true, driver };
}
