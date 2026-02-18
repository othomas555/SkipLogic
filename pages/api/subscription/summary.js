// pages/api/subscription/summary.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = await requireOfficeUser(req);
    if (!auth?.ok) return res.status(401).json({ ok: false, error: auth?.error || "Unauthorized" });

    const subscriberId = auth.subscriber_id;
    const supabase = getSupabaseAdmin();

    const { data: subRow, error: subErr } = await supabase
      .from("subscribers")
      .select("id, plan_variant_id, subscription_status, trial_ends_at, grace_ends_at, locked_at")
      .eq("id", subscriberId)
      .single();
    if (subErr) throw subErr;

    let planVariant = null;
    let activeJobsLimit = null;

    if (subRow?.plan_variant_id) {
      const { data: pv, error: pvErr } = await supabase
        .from("plan_variants")
        .select("id, plan_id, name, slug, active_jobs_limit")
        .eq("id", subRow.plan_variant_id)
        .single();
      if (pvErr) throw pvErr;
      planVariant = pv || null;
      if (pv?.active_jobs_limit != null) activeJobsLimit = Number(pv.active_jobs_limit);
    }

    let plan = null;
    if (planVariant?.plan_id) {
      const { data: p, error: pErr } = await supabase
        .from("plans")
        .select("id, name, slug")
        .eq("id", planVariant.plan_id)
        .single();
      if (pErr) throw pErr;
      plan = p || null;
    }

    const { data: activeRow, error: aErr } = await supabase
      .from("v_active_job_counts")
      .select("active_jobs")
      .eq("subscriber_id", subscriberId)
      .maybeSingle();
    if (aErr) throw aErr;

    const activeJobs = Number(activeRow?.active_jobs || 0);

    return res.status(200).json({
      ok: true,
      subscriber: subRow,
      plan,
      plan_variant: planVariant,
      active_jobs: activeJobs,
      active_jobs_limit: Number.isFinite(activeJobsLimit) ? activeJobsLimit : null,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Failed to load subscription summary",
      detail: String(err?.message || err),
    });
  }
}
