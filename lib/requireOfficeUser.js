import { getSupabaseAdmin } from "./supabaseAdmin";

/**
 * Office auth for API routes using Authorization: Bearer <access_token>.
 * Looks up profiles.id = user.id to get subscriber_id.
 */
export async function requireOfficeUser(req) {
  try {
    const supabase = getSupabaseAdmin();

    // Get bearer token
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = match ? match[1] : null;

    if (!accessToken) {
      return { ok: false, error: "Missing bearer token" };
    }

    // Validate user
    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);

    if (userErr || !userData?.user) {
      return { ok: false, error: "Invalid session" };
    }

    const user = userData.user;

    // Get profile (to find subscriber_id)
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, subscriber_id")
      .eq("id", user.id)
      .single();

    if (profileErr) {
      return { ok: false, error: profileErr.message };
    }

    if (!profile?.subscriber_id) {
      return { ok: false, error: "Profile missing subscriber_id" };
    }

    return {
      ok: true,
      user,
      profile,
      subscriber_id: profile.subscriber_id,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "Auth error",
    };
  }
}
