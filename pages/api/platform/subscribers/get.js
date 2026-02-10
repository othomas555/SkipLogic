// pages/api/platform/subscribers/get.js
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requirePlatformAdmin(req, supabaseAdmin) {
  const token = getBearer(req);
  if (!token) return { ok: false, status: 401, error: "Missing Authorization bearer token" };

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user?.id) return { ok: false, status: 401, error: "Invalid token" };

  const userId = userData.user.id;

  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) return { ok: false, status: 500, error: profErr.message };
  if (!prof || prof.is_active === false) return { ok: false, status: 403, error: "Profile inactive" };
  if (prof.role !== "platform_admin") return { ok: false, status: 403, error: "Not platform admin" };

  return { ok: true, user_id: userId, profile: prof };
}

function displayCompany(row) {
  return row.company_name || row.name || row.slug || row.subscriber_id || "—";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabaseAdmin = getSupabaseAdmin();
  const authz = await requirePlatformAdmin(req, supabaseAdmin);
  if (!authz.ok) return res.status(authz.status).json({ ok: false, error: authz.error });

  const subscriberId = String(req.query.subscriber_id || "");
  if (!subscriberId) return res.status(400).json({ ok: false, error: "Missing subscriber_id" });

  const { data: health, error: healthErr } = await supabaseAdmin
    .from("v_platform_subscriber_health")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (healthErr) return res.status(500).json({ ok: false, error: healthErr.message });
  if (!health) return res.status(404).json({ ok: false, error: "Subscriber not found (health view)" });

  // pull core subscriber row too (so we can show name/slug even if company_name is null)
  const { data: sub, error: subErr } = await supabaseAdmin
    .from("subscribers")
    .select(
      [
        "id",
        "name",
        "slug",
        "company_name",
        "primary_email",
        "status",
        "plan",
        "trial_ends_at",
        "billing_status",
        "current_period_end",
        "last_payment_at",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_price_id",
        "xero_connected_at",
        "xero_tenant_id",
      ].join(",")
    )
    .eq("id", subscriberId)
    .maybeSingle();

  if (subErr) return res.status(500).json({ ok: false, error: subErr.message });

  const { data: users, error: usersErr } = await supabaseAdmin
    .from("profiles")
    .select("id,email,full_name,role,is_active,last_seen_at,driver_id,created_at")
    .eq("subscriber_id", subscriberId)
    .order("created_at", { ascending: true });

  if (usersErr) return res.status(500).json({ ok: false, error: usersErr.message });

  const { data: drivers, error: driversErr } = await supabaseAdmin
    .from("drivers")
    .select("id,name,callsign,phone,email,is_active,created_at,updated_at")
    .eq("subscriber_id", subscriberId)
    .order("created_at", { ascending: true });

  if (driversErr) return res.status(500).json({ ok: false, error: driversErr.message });

  // last 50 activity events for support
  const { data: events, error: evErr } = await supabaseAdmin
    .from("activity_events")
    .select("id,event_type,entity_type,entity_id,meta,created_at,user_id")
    .eq("subscriber_id", subscriberId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (evErr) return res.status(500).json({ ok: false, error: evErr.message });

  const merged = { ...health, ...(sub || {}) };
  return res.status(200).json({
    ok: true,
    subscriber: { ...merged, display_company: displayCompany(merged) },
    users: users || [],
    drivers: drivers || [],
    events: events || [],
  });
}
