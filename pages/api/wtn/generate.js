import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { createWtnForJob, buildWtnPublicUrl } from "../../../lib/wtn";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobId = String(body.job_id || "").trim();
    const transferDate = String(body.transfer_date || "").trim() || null;

    if (!jobId) {
      return res.status(400).json({ ok: false, error: "job_id is required" });
    }

    const out = await createWtnForJob({
      subscriberId: auth.subscriber_id,
      jobId,
      transferDate,
    });

    return res.status(200).json({
      ok: true,
      ...out,
      wtn_url: out?.wtn?.id ? buildWtnPublicUrl(out.wtn.id) : null,
    });
  } catch (err) {
    console.error("wtn/generate error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to generate WTN",
    });
  }
}
