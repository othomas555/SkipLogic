// pages/api/auth/bootstrap.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    assert(token, "Missing Authorization Bearer token");

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const companyName = String(body.company_name || "").trim();
    const fullName = String(body.full_name || "").trim();
    const phone = String(body.phone || "").trim();

    assert(companyName, "Missing company_name");
    assert(fullName, "Missing full_name");
    assert(phone, "Missing phone");

    const supabase = getSupabaseAdmin();

    // Identify user from JWT
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Invalid session token" });
    }

    const user = userData.user;

    // If profile already exists, do nothing (idempotent)
    const { data: existingProfile, error: profileReadErr } = await supabase
      .from("profiles")
      .select("user_id, subscriber_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileReadErr) {
      return res.status(500).json({ ok: false, error: profileReadErr.message || "Failed reading profile" });
    }

    if (existingProfile?.subscriber_id) {
      return res.status(200).json({ ok: true, already_bootstrapped: true, subscriber_id: existingProfile.subscriber_id });
    }

    // Create subscriber
    const { data: subscriber, error: subErr } = await supabase
      .from("subscribers")
      .insert([
        {
          company_name: companyName,
          owner_user_id: user.id,
        },
      ])
      .select("id, company_name")
      .single();

    if (subErr) {
      return res.status(500).json({ ok: false, error: subErr.message || "Failed creating subscriber" });
    }

    // Create profile
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .insert([
        {
          user_id: user.id,
          subscriber_id: subscriber.id,
          full_name: fullName,
          phone,
          role: "owner",
        },
      ])
      .select("user_id, subscriber_id, role")
      .single();

    if (profErr) {
      return res.status(500).json({ ok: false, error: profErr.message || "Failed creating profile" });
    }

    return res.status(200).json({ ok: true, subscriber_id: subscriber.id, profile });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
