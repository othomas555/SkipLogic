import crypto from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";

const COOKIE_NAME = "sl_driver_session";
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
  const parts = [`${COOKIE_NAME}=`, `Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=0`];
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

  if (!token) {
    return { ok: false, reason: "missing_cookie" };
  }

  const sessionHash = hashOpaqueToken(token);

  const { data: sessions, error: sessErr } = await supabase
    .from("driver_sessions")
    .select("driver_id, expires_at, last_seen_at, created_at")
    .eq("session_hash", sessionHash)
    .order("created_at", { ascending: false });

  if (sessErr) {
    return { ok: false, reason: "session_lookup_failed", error: sessErr.message || String(sessErr) };
  }

  const rows = Array.isArray(sessions) ? sessions : [];
  if (rows.length === 0) {
    return { ok: false, reason: "invalid_session" };
  }

  const now = new Date();

  const validSession =
    rows.find((row) => {
      const exp = new Date(row.expires_at);
      return Number.isFinite(exp.getTime()) && exp > now;
    }) || null;

  if (!validSession) {
    return { ok: false, reason: "expired_session" };
  }

  const { data: drivers, error: dErr } = await supabase
    .from("drivers")
    .select("id, subscriber_id, name, email, is_active")
    .eq("id", validSession.driver_id)
    .limit(1);

  if (dErr) {
    return { ok: false, reason: "driver_lookup_failed", error: dErr.message || String(dErr) };
  }

  const driver = Array.isArray(drivers) && drivers.length > 0 ? drivers[0] : null;

  if (!driver) {
    return { ok: false, reason: "driver_not_found" };
  }

  if (driver.is_active === false) {
    return { ok: false, reason: "driver_inactive" };
  }

  await supabase
    .from("driver_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("session_hash", sessionHash);

  return { ok: true, driver };
}
