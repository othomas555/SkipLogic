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

function displayCompany(row) {
  return row.company_name || row.name || row.slug || row.subscriber_id || "—";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabaseAdmin = getSupabaseAdmin();

  const authz = await requirePlatformAdmin(req, supabaseAdmin);
  if (!authz.ok) return res.status(authz.status).json({ ok: false, error: authz.error });

  const q = String(req.query.q || "").trim().toLowerCase();

  // Pull from health view (usage + billing + health)
  const { data: rows, error } = await supabaseAdmin
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
    )
    .order("company_name", { ascending: true, nullsFirst: true });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  // If view has null company_name, we can also join subscribers to get name/slug in the future.
  // For now, filter client-side using the fields we have.
  let out = rows || [];
  if (q) {
    out = out.filter((r) => {
      const hay = [
        displayCompany(r),
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

  out = out.map((r) => ({
    ...r,
    display_company: displayCompany(r),
  }));

  return res.status(200).json({ ok: true, subscribers: out });
}
