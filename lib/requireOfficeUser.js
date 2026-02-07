// lib/requireOfficeUser.js
import { getSupabaseAdmin } from "./supabaseAdmin";

function parseCookies(cookieHeader) {
  const out = {};
  const raw = cookieHeader || "";
  raw.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v || "");
  });
  return out;
}

/**
 * Supabase (JS client) stores auth in a cookie that looks like:
 * - "supabase-auth-token" OR
 * - "sb-<projectref>-auth-token"
 * Value is JSON: [access_token, refresh_token, ...]
 */
function getAccessTokenFromCookies(req) {
  const cookies = parseCookies(req.headers.cookie);

  // common older name
  if (cookies["supabase-auth-token"]) {
    try {
      const arr = JSON.parse(cookies["supabase-auth-token"]);
      if (Array.isArray(arr) && arr[0]) return arr[0];
    } catch {}
  }

  // supabase newer: sb-<ref>-auth-token
  const authTokenKey = Object.keys(cookies).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  if (authTokenKey) {
    try {
      const arr = JSON.parse(cookies[authTokenKey]);
      if (Array.isArray(arr) && arr[0]) return arr[0];
    } catch {}
  }

  return null;
}

/**
 * Require an office user (Supabase Auth) and return subscriber_id from profiles.
 */
export async function requireOfficeUser(req) {
  const supabase = getSupabaseAdmin();

  const accessToken = getAccessTokenFromCookies(req);
  if (!accessToken) return { ok: false, error: "No auth token" };

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) return { ok: false, error: "Invalid session" };

  const user = userData.user;

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, subscriber_id")
    .eq("id", user.id)
    .single();

  if (profErr || !profile?.subscriber_id) return { ok: false, error: "Profile missing subscriber_id" };

  return {
    ok: true,
    user,
    profile,
    subscriber_id: profile.subscriber_id,
  };
}
