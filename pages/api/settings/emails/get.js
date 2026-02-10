import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireUser(req, supabaseAdmin) {
  const token = getBearer(req);
  if (!token) return { ok: false, status: 401, error: "Missing Authorization bearer token" };

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user?.id) return { ok: false, status: 401, error: "Invalid token" };

  const userId = userData.user.id;

  const { data: prof, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("id, subscriber_id, role, is_active, email")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) return { ok: false, status: 500, error: profErr.message };
  if (!prof || prof.is_active === false) return { ok: false, status: 403, error: "Profile inactive" };
  if (!prof.subscriber_id) return { ok: false, status: 403, error: "Profile missing subscriber_id" };

  return { ok: true, user_id: userId, profile: prof, subscriber_id: prof.subscriber_id };
}

const TEMPLATE_KEYS = [
  "booking_confirmed",
  "skip_due_for_collection",
  "swap_scheduled",
  "collected_confirmation",
  "term_ending_reminder",
];

function defaultTemplate(key) {
  const commonFooter = `
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
    <p style="font-size:12px;color:#666;">
      If you have any questions, just reply to this email.
    </p>
  `;

  switch (key) {
    case "booking_confirmed":
      return {
        subject: "Your skip booking is confirmed ✅",
        body_html: `
          <p>Hi {{customer_name}},</p>
          <p>Your skip booking is confirmed.</p>
          <p><strong>Delivery date:</strong> {{delivery_date}}</p>
          <p><strong>Address:</strong> {{site_address}}</p>
          <p><strong>Skip:</strong> {{skip_type}}</p>

          <p style="margin-top:16px;">
            ⭐ If you’re happy with our service, please leave us a Google review:
            <a href="{{google_review_link}}">Leave a review</a>
          </p>
          ${commonFooter}
        `,
      };

    case "swap_scheduled":
      return {
        subject: "Skip swap booked 🔁",
        body_html: `
          <p>Hi {{customer_name}},</p>
          <p>Your skip swap has been booked.</p>
          <p><strong>Swap date:</strong> {{swap_date}}</p>
          <p><strong>Address:</strong> {{site_address}}</p>
          ${commonFooter}
        `,
      };

    case "skip_due_for_collection":
      return {
        subject: "Ready for collection? 🚚",
        body_html: `
          <p>Hi {{customer_name}},</p>
          <p>If your skip is ready for collection, you can reply to this email to book it in.</p>
          <p><strong>Address:</strong> {{site_address}}</p>
          ${commonFooter}
        `,
      };

    case "collected_confirmation":
      return {
        subject: "Skip collected ✅",
        body_html: `
          <p>Hi {{customer_name}},</p>
          <p>Your skip has been collected. Thanks for using us.</p>
          <p><strong>Collection date:</strong> {{collection_date}}</p>
          <p><strong>Address:</strong> {{site_address}}</p>
          <p>We’ve attached your Waste Transfer Note (where applicable).</p>
          ${commonFooter}
        `,
      };

    case "term_ending_reminder":
      return {
        subject: "Your hire period is nearly up ⏳",
        body_html: `
          <p>Hi {{customer_name}},</p>
          <p>This is a quick reminder your hire period is nearly up.</p>
          <p><strong>Hire ends:</strong> {{term_end_date}}</p>
          <p>If you need more time, reply to this email and we’ll arrange it.</p>
          ${commonFooter}
        `,
      };

    default:
      return { subject: "", body_html: "" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabaseAdmin = getSupabaseAdmin();
  const authz = await requireUser(req, supabaseAdmin);
  if (!authz.ok) return res.status(authz.status).json({ ok: false, error: authz.error });

  const subscriber_id = authz.subscriber_id;

  // settings row (create if missing)
  let { data: settings, error: sErr } = await supabaseAdmin
    .from("email_settings")
    .select("*")
    .eq("subscriber_id", subscriber_id)
    .maybeSingle();

  if (sErr) return res.status(500).json({ ok: false, error: sErr.message });

  if (!settings) {
    const { data: created, error: cErr } = await supabaseAdmin
      .from("email_settings")
      .insert({ subscriber_id, provider: "resend", is_enabled: true })
      .select("*")
      .maybeSingle();
    if (cErr) return res.status(500).json({ ok: false, error: cErr.message });
    settings = created;
  }

  // templates (ensure rows exist for all keys)
  const { data: existing, error: tErr } = await supabaseAdmin
    .from("email_templates")
    .select("*")
    .eq("subscriber_id", subscriber_id);

  if (tErr) return res.status(500).json({ ok: false, error: tErr.message });

  const byKey = new Map((existing || []).map((t) => [t.template_key, t]));
  const toInsert = [];

  for (const key of TEMPLATE_KEYS) {
    if (!byKey.has(key)) {
      const d = defaultTemplate(key);
      toInsert.push({
        subscriber_id,
        template_key: key,
        enabled: true,
        subject: d.subject,
        body_html: d.body_html,
      });
    }
  }

  if (toInsert.length) {
    const { error: iErr } = await supabaseAdmin.from("email_templates").insert(toInsert);
    if (iErr) return res.status(500).json({ ok: false, error: iErr.message });
  }

  const { data: templates, error: t2Err } = await supabaseAdmin
    .from("email_templates")
    .select("*")
    .eq("subscriber_id", subscriber_id)
    .order("template_key", { ascending: true });

  if (t2Err) return res.status(500).json({ ok: false, error: t2Err.message });

  const { data: outbox, error: oErr } = await supabaseAdmin
    .from("email_outbox")
    .select("id,template_key,to_email,status,error,created_at,sent_at")
    .eq("subscriber_id", subscriber_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (oErr) return res.status(500).json({ ok: false, error: oErr.message });

  return res.status(200).json({
    ok: true,
    settings,
    templates: templates || [],
    defaults: Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, defaultTemplate(k)])),
    outbox: outbox || [],
    template_keys: TEMPLATE_KEYS,
    merge_tags: [
      "{{customer_name}}",
      "{{delivery_date}}",
      "{{swap_date}}",
      "{{collection_date}}",
      "{{term_end_date}}",
      "{{site_address}}",
      "{{skip_type}}",
      "{{google_review_link}}",
    ],
  });
}
