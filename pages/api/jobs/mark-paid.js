// pages/api/jobs/mark-paid.js
//
// POST
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Marks a job as paid INSIDE SkipLogic (DB fields only).
// Does NOT create a Xero Payment yet (that is a separate step so we can keep this deterministic).
//
// Body:
// {
//   job_id: string (required),
//   paid_method: string (required)    // e.g. "cash", "card_phone", "bank", "other"
//   paid_reference?: string|null,
//   paid_at?: string|null            // ISO string; if omitted uses now()
//   force?: boolean                  // if true, allows overwriting existing paid fields
//   clear?: boolean                  // if true, clears paid fields (force not required)
// }
//
// Returns:
// { ok: true, job, warning? } OR { ok:false, error, details? }

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function parsePaidAt(x) {
  if (x == null || x === "") return null;
  const s = String(x);
  const dt = new Date(s);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = String(auth.subscriber_id || "");
    const officeUserId = String(auth.user_id || auth.user?.id || "");

    if (!subscriberId) return res.status(401).json({ ok: false, error: "No subscriber in auth context" });

    const supabase = getSupabaseAdmin();
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const jobId = asText(body.job_id);
    const paidMethod = asText(body.paid_method);
    const paidReference = body.paid_reference == null ? null : String(body.paid_reference);
    const force = !!body.force;
    const clear = !!body.clear;

    if (!jobId) return res.status(400).json({ ok: false, error: "job_id is required" });

    // Load job (tenant scoped)
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(
        `
        id,
        subscriber_id,
        job_number,
        payment_type,
        price_inc_vat,
        xero_invoice_id,
        xero_invoice_number,
        xero_invoice_status,
        paid_at,
        paid_method,
        paid_reference,
        paid_by_user_id,
        xero_payment_id
      `
      )
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (jobErr) {
      console.error("mark-paid load job error:", jobErr);
      return res.status(500).json({ ok: false, error: "Failed to load job" });
    }
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });

    // Clear paid state (admin action)
    if (clear) {
      const { data: updated, error: updErr } = await supabase
        .from("jobs")
        .update({
          paid_at: null,
          paid_method: null,
          paid_reference: null,
          paid_by_user_id: null,
          xero_payment_id: null,
        })
        .eq("id", jobId)
        .eq("subscriber_id", subscriberId)
        .select(
          `
          id,
          job_number,
          paid_at,
          paid_method,
          paid_reference,
          paid_by_user_id,
          xero_payment_id
        `
        )
        .single();

      if (updErr || !updated) {
        console.error("mark-paid clear update error:", updErr);
        return res.status(500).json({ ok: false, error: "Failed to clear paid state" });
      }

      return res.status(200).json({ ok: true, job: updated });
    }

    // Mark paid
    if (!paidMethod) return res.status(400).json({ ok: false, error: "paid_method is required" });

    const paidAtIso = parsePaidAt(body.paid_at) || new Date().toISOString();

    // If already paid, only allow overwrite with force=true
    if (job.paid_at && !force) {
      return res.status(409).json({
        ok: false,
        error: "Job is already marked as paid",
        details: {
          paid_at: job.paid_at,
          paid_method: job.paid_method,
          paid_reference: job.paid_reference,
        },
      });
    }

    // Write paid fields (minimal + deterministic)
    const updatePayload = {
      paid_at: paidAtIso,
      paid_method: paidMethod,
      paid_reference: paidReference,
      paid_by_user_id: officeUserId || null,
    };

    const { data: updated, error: updErr } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId)
      .select(
        `
        id,
        job_number,
        payment_type,
        price_inc_vat,
        xero_invoice_id,
        xero_invoice_number,
        xero_invoice_status,
        paid_at,
        paid_method,
        paid_reference,
        paid_by_user_id,
        xero_payment_id
      `
      )
      .single();

    if (updErr || !updated) {
      console.error("mark-paid update error:", updErr);
      return res.status(500).json({ ok: false, error: "Failed to mark job as paid" });
    }

    // Helpful warning (no behaviour change)
    let warning = null;
    if (!updated.xero_invoice_id) {
      warning = "Job marked as paid in SkipLogic, but it has no xero_invoice_id (no Xero invoice to pay).";
    }

    return res.status(200).json({ ok: true, job: updated, warning });
  } catch (err) {
    console.error("mark-paid unexpected error:", err);
    return res.status(500).json({ ok: false, error: "Unexpected error", details: String(err?.message || err) });
  }
}
