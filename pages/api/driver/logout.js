// pages/api/driver/logout.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { clearDriverCookie, readDriverSessionToken, hashOpaqueToken } from "../../../lib/driverAuth";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  const token = readDriverSessionToken(req);
  if (token) {
    const sessionHash = hashOpaqueToken(token);
    await supabase.from("driver_sessions").delete().eq("session_hash", sessionHash);
  }

  res.setHeader("Set-Cookie", clearDriverCookie());
  return res.json({ ok: true });
}
