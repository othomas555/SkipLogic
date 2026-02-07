// lib/requireOfficeUser.js
import { getSupabaseAdmin } from "./supabaseAdmin";

/**
 * Server-side auth for office users (Supabase Auth).
 * Reads the Supabase auth cookie and returns the user + subscriber_id.
 */
export async function requireOfficeUser(req) {
  const supabase = getSupabaseAdmin();

  // Supabase stores the JWT in cookies; we forward them
  const authHeader = req.headers.authorization;
  const cookieHeader = req.headers.cookie;

  const { data, error } = await supabase.auth.getUser(
    authHeader
      ? authHeader.replace("Bearer ", "")
      : undefined
  );

  if (error || !data?.user) {
    return { ok: false };
  }

  const user = data.user;

  // You already use subscriber_id in your app – assuming it's in user metadata
  const subscriberId =
    user.user_metadata?.subscriber_id ||
    user.app_metadata?.subscriber_id ||
    null;

  if (!subscriberId) {
    return { ok: false };
  }

  return {
    ok: true,
    user,
    subscriber_id: subscriberId,
  };
}
