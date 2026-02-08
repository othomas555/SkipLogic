// pages/api/xero/xero_sync_invoice_for_job.js
//
// POST { job_id }
// Auth: Office user via Authorization: Bearer <supabase access token>
//
// Purpose:
// If a Xero invoice exists (created earlier) but the job row did not get updated,
// this endpoint finds the invoice in Xero by Reference == job.job_number
// and writes xero_invoice_id / number / status onto the job.
//
// Deterministic rules:
// - Must find exactly 1 invoice match, otherwise error.
// - Only searches ACCREC invoices.
// - Tenant-safe: uses subscriberId from office auth context.

import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getValidXeroClient } from "../../../lib/xeroOAuth";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

function asText(x) {
  return typeof x === "string" ? x.trim() : "";
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function escapeForXeroWhere(s) {
  return String(s || "").replace(/"/g, '\\"');
}

async function xeroRequest({ accessToken, tenantId, path, method = "GET", body = null }) {
  const url = `${XERO_API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Xero-tenant-id": tenantId,
    Accept: "application/json",
  };
  if (body != null) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`Xero request failed: ${res.status} ${res.statusText} – ${text}`);
  }
  return json;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = String(auth.subscriber_id || "");
    assert(subscriberId, "No subscriber in auth context");

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobId = asText(body.job_id);
    if (!jobId) return res.status(400).json({ ok: false, error: "job_id is required" });

    const supabase = getSupabaseAdmin();

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(
        `
        id,
        subscriber_id,
        job_number,
        payment_type,
        xero_invoice_id,
        xero_invoice_number,
        xero_invoice_status
      `
      )
      .eq("id", jobId)
      .eq("subscriber_id", subscriberId)
      .maybeSingle();

    if (jobErr) {
      console.error("xero_sync_invoice_for_job load job error:", jobErr);
      return res.status(500).json({ ok: false, error: "Failed to load job" });
    }
    if (!job) return res.status(404).json({ ok: false, error: "Job not found" });

    const jobNumber = asText(job.job_number);
    if (!jobNumber) return res.status(400).json({ ok: false, error: "Job has no job_number" });

    // If already linked, return as-is (idempotent)
    if (job.xero_invoice_id) {
      return res.status(200).json({
        ok: true,
        mode: "already",
        job: {
          id: job.id,
          job_number: job.job_number,
          xero_invoice_id: job.xero_invoice_id,
          xero_invoice_number: job.xero_invoice_number,
          xero_invoice_status: job.xero_invoice_status,
        },
      });
    }

    const xc = await getValidXeroClient(subscriberId);
    if (!xc?.tenantId) throw new Error("Xero connected but no organisation selected");

    const accessToken = xc.accessToken;
    const tenantId = xc.tenantId;

    // Find ACCREC invoices with Reference == job_number
    const where = encodeURIComponent(
      `Type=="ACCREC" AND Reference=="${escapeForXeroWhere(jobNumber)}"`
    );
    const found = await xeroRequest({
      accessToken,
      tenantId,
      path: `/Invoices?where=${where}`,
      method: "GET",
    });

    const invoices = Array.isArray(found?.Invoices) ? found.Invoices : [];

    if (invoices.length === 0) {
      return res.status(404).json({
        ok: false,
        error: `No Xero invoice found with Reference == ${jobNumber}`,
      });
    }

    if (invoices.length > 1) {
      // Deterministic: refuse to guess
      const ids = invoices.map((i) => i?.InvoiceID).filter(Boolean).slice(0, 10);
      return res.status(409).json({
        ok: false,
        error: `Multiple Xero invoices found with Reference == ${jobNumber}. Refusing to auto-link.`,
        details: { count: invoices.length, invoice_ids: ids },
      });
    }

    const inv = invoices[0];
    const invoiceId = inv?.InvoiceID ? String(inv.InvoiceID) : "";
    if (!invoiceId) throw new Error("Matched invoice has no InvoiceID");

    const update = {
      xero_invoice_id: invoiceId,
      xero_invoice_number: inv?.InvoiceNumber ? String(inv.InvoiceNumber) : null,
      xero_invoice_status: inv?.Status ? String(inv.Status) : null,
    };

    const { error: updErr } = await supabase
      .from("jobs")
      .update(update)
      .eq("id", job.id)
      .eq("subscriber_id", subscriberId);

    if (updErr) {
      console.error("xero_sync_invoice_for_job update error:", updErr);
      return res.status(500).json({ ok: false, error: "Failed to update job with Xero invoice fields" });
    }

    return res.status(200).json({
      ok: true,
      mode: "linked",
      job: {
        id: job.id,
        job_number: job.job_number,
        ...update,
      },
    });
  } catch (err) {
    console.error("xero_sync_invoice_for_job error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
