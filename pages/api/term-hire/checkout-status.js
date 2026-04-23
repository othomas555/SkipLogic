import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asMoneyString(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const sessionId = String(req.query?.session_id || "").trim();
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "Missing session_id" });
    }

    const supabase = getSupabaseAdmin();

    const { data: ext, error: extErr } = await supabase
      .from("term_hire_extensions")
      .select("job_id, amount, new_hire_end_date, status")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (extErr) throw extErr;

    let jobNumber = "";
    if (ext?.job_id) {
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("job_number")
        .eq("id", ext.job_id)
        .maybeSingle();

      if (jobErr) throw jobErr;
      jobNumber = job?.job_number || "";
    }

    return res.status(200).json({
      ok: true,
      status: ext?.status || "pending",
      job_number: jobNumber,
      new_hire_end_date: ext?.new_hire_end_date || "",
      amount_paid: ext?.amount != null ? asMoneyString(ext.amount) : "",
    });
  } catch (err) {
    console.error("checkout-status error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to load checkout status",
    });
  }
}
