import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = await requireOfficeUser(req);
    if (!auth?.ok) {
      return res.status(401).json({ ok: false, error: auth?.error || "Unauthorised" });
    }

    const subscriberId = auth.subscriber_id;
    const jobId = asText(req.query?.id);

    if (!jobId) {
      return res.status(400).json({ ok: false, error: "Job id is required" });
    }

    const supabase = getSupabaseAdmin();

    const { data: job, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return res.status(404).json({
        ok: false,
        error: error?.message || "Job not found",
      });
    }

    return res.status(200).json({ ok: true, job });
  } catch (err) {
    console.error("jobs/get unexpected error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
