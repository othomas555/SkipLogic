// lib/requireOfficeUser.js
import { getSupabaseAdmin } from "./supabaseAdmin";

/**
 * Office auth for API routes using Authorization: Bearer <access_token>.
 * Looks up profiles.id = user.id to get subscriber_id.
 */
export async function requireOfficeUser(req) {
  const supabase = getSupabaseAdmin();

  const authHeader = req.headers.authorization || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = m ? m[1] : null;
  if (!accessToken) return { ok: false, error: "Missing bearer token" };

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) return { ok: false, error: "Invalid session" };

  const user = userData.user;

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, subscriber_id")
    .eq("id", user.id)
    .single();

  if (profErr || !profile?.subscriber_id) {
    return { ok: false, error: "Profile missing subscriber_id" };
  }

  return { ok: true, user, profile, subscriber_id: profile.subscriber_id };
}
