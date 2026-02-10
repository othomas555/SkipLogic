// pages/api/platform/subscribers/list.js
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

function displayCompanyMerged(healthRow, subscriberRow) {
  const s = subscriberRow || {};
  const h = healthRow || {};
  return (
    s.company_name ||
    s.name ||
    s.slug ||
    h.company_name ||
    h.primary_email ||
    h.subscriber_id ||
    "—"
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabaseAdmin = getSupabaseAdmin();
  const authz = await requirePlatformAdmin(req, supabaseAdmin);
  if (!authz.ok) return res.status(authz.status).json({ ok: false, error: authz.error });

  const q = String(req.query.q || "").trim().toLowerCase();

  // 1) Get health rows (usage/billing/health)
  const { data: healthRows, error: hErr } = await supabaseAdmin
    .from("v_platform_subscriber_health")
    .select(
      [
        "subscriber_id",
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
        "xero_connected_at",
        "active_users",
        "active_drivers",
        "last_seen_at",
        "last_activity_at",
        "events_7d",
        "events_30d",
        "jobs_created_7d",
        "jobs_created_30d",
        "invoices_created_30d",
        "errors_7d",
        "health_state",
      ].join(",")
    );

  if (hErr) return res.status(500).json({ ok: false, error: hErr.message });

  const rows = healthRows || [];
  const ids = rows.map((r) => r.subscriber_id).filter(Boolean);

  // 2) Pull subscriber rows for names/slug
  const { data: subs, error: sErr } = await supabaseAdmin
    .from("subscribers")
    .select("id,name,slug,company_name,primary_email,status,plan")
    .in("id", ids);

  if (sErr) return res.status(500).json({ ok: false, error: sErr.message });

  const byId = new Map((subs || []).map((s) => [s.id, s]));

  // 3) Merge
  let out = rows.map((h) => {
    const s = byId.get(h.subscriber_id);
    return {
      ...h,
      // prefer canonical subscriber fields if present
      status: s?.status ?? h.status,
      plan: s?.plan ?? h.plan,
      primary_email: s?.primary_email ?? h.primary_email,
      display_company: displayCompanyMerged(h, s),
    };
  });

  // 4) Search filter
  if (q) {
    out = out.filter((r) => {
      const hay = [
        r.display_company || "",
        r.primary_email || "",
        r.status || "",
        r.plan || "",
        r.billing_status || "",
        r.health_state || "",
        r.subscriber_id || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  // 5) Sort by display name (null-safe)
  out.sort((a, b) => String(a.display_company || "").localeCompare(String(b.display_company || "")));

  return res.status(200).json({ ok: true, subscribers: out });
}
