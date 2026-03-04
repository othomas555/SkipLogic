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

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

    // If profile already bootstrapped, stop.
    const { data: existingProfile, error: profReadErr } = await supabase
      .from("profiles")
      .select("id, subscriber_id")
      .eq("id", userId)
      .maybeSingle();

    if (profReadErr) throw profReadErr;

    if (existingProfile?.subscriber_id) {
      return res.status(200).json({ ok: true, subscriber_id: existingProfile.subscriber_id, already: true });
    }

    // Create subscriber (tenant)
    // IMPORTANT: your schema uses subscribers.name (NOT NULL)
    const baseSlug = slugify(companyName) || "subscriber";
    let slug = baseSlug;

    // Ensure unique slug (best-effort)
    for (let i = 0; i < 25; i++) {
      // Check if slug exists
      const { data: existing, error: sErr } = await supabase
        .from("subscribers")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (sErr) throw sErr;

      if (!existing) break;
      slug = `${baseSlug}-${String(i + 2).padStart(2, "0")}`;
    }

    const { data: subRow, error: subErr } = await supabase
      .from("subscribers")
      .insert({
        name: companyName,
        slug,
      })
      .select("id")
      .single();

    if (subErr) throw subErr;

    const subscriberId = subRow.id;

    // Upsert profile (id = auth user id)
    const profilePayload = {
      id: userId,
      subscriber_id: subscriberId,
      full_name: fullName,
      phone,
      email: user.email || null,
      role: "owner",
      is_active: true,
    };

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
