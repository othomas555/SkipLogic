// pages/api/auth/bootstrap.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/);
  return m ? m[1] : null;
}

function clean(s, max = 200) {
  const x = String(s || "").trim();
  if (!x) return "";
  return x.length > max ? x.slice(0, max) : x;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "Missing Authorization Bearer token" });

    const supabase = getSupabaseAdmin();

    // Identify the user from the JWT
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Invalid session" });
    }

    const user = userData.user;
    const userId = user.id;

    const body = req.body || {};
    const companyName = clean(body.company_name, 200);
    const fullName = clean(body.full_name, 200);
    const phone = clean(body.phone, 60);

    if (!companyName) return res.status(400).json({ ok: false, error: "Missing company_name" });
    if (!fullName) return res.status(400).json({ ok: false, error: "Missing full_name" });
    if (!phone) return res.status(400).json({ ok: false, error: "Missing phone" });

    // Do we already have a profile with subscriber_id?
    const { data: existingProfile, error: profReadErr } = await supabase
      .from("profiles")
      .select("id, subscriber_id")
      .eq("id", userId) // IMPORTANT: your schema uses id = auth user id
      .maybeSingle();

    if (profReadErr) throw profReadErr;

    // If already bootstrapped, nothing to do
    if (existingProfile?.subscriber_id) {
      return res.status(200).json({ ok: true, subscriber_id: existingProfile.subscriber_id, already: true });
    }

    // Create subscriber (tenant)
    const { data: subRow, error: subErr } = await supabase
      .from("subscribers")
      .insert({
        company_name: companyName,
        // add other columns you may have later (created_at default etc.)
      })
      .select("id")
      .single();

    if (subErr) throw subErr;

    const subscriberId = subRow.id;

    // Upsert profile (id = userId, not user_id)
    const profilePayload = {
      id: userId,
      subscriber_id: subscriberId,
      full_name: fullName,
      phone: phone,
      email: user.email || null,
      role: "owner", // adjust if your schema uses a different role value
    };

    // If your profiles table doesn't have some of these columns, remove them.
    const { error: upErr } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });

    if (upErr) throw upErr;

    return res.status(200).json({ ok: true, subscriber_id: subscriberId });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Bootstrap failed",
      detail: String(err?.message || err),
    });
  }
}
