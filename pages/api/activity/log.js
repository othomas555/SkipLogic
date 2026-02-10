import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const token = getBearer(req);
    assert(token, "Missing Authorization bearer token");

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user?.id) return res.status(401).json({ ok: false, error: "Invalid token" });
    const user_id = userData.user.id;

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const event_type = String(body.event_type || "").trim();
    const entity_type = body.entity_type ? String(body.entity_type) : null;
    const entity_id = body.entity_id ? String(body.entity_id) : null;
    const meta = body.meta && typeof body.meta === "object" ? body.meta : {};

    assert(event_type, "Missing event_type");

    // get subscriber_id from profile
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, subscriber_id")
      .eq("id", user_id)
      .maybeSingle();

    if (profErr) throw new Error(profErr.message);
    assert(prof?.subscriber_id, "Profile missing subscriber_id");

    // update last_seen_at (this also feeds health)
    await supabaseAdmin.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user_id);

    // insert activity event
    const { data: ev, error: evErr } = await supabaseAdmin
      .from("activity_events")
      .insert({
        subscriber_id: prof.subscriber_id,
        user_id,
        event_type,
        entity_type,
        entity_id,
        meta,
      })
      .select("id, created_at")
      .maybeSingle();

    if (evErr) throw new Error(evErr.message);

    return res.status(200).json({ ok: true, event: ev });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
}
