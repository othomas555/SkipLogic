import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getDriverFromSession } from "../../../lib/driverAuth";

export const config = {
  api: {
    bodyParser: false,
  },
};

function bad(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function safeExtFromContentType(ct) {
  const x = String(ct || "").toLowerCase();
  if (x.includes("image/jpeg")) return "jpg";
  if (x.includes("image/png")) return "png";
  if (x.includes("image/webp")) return "webp";
  return "bin";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const auth = await getDriverFromSession(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: "Not logged in" });

  const driver = auth.driver;
  const supabase = getSupabaseAdmin();

  const jobId = String(req.query.job_id || "").trim();
  const kind = String(req.query.kind || "").trim();

  if (!jobId) return bad(res, "Missing job_id");
  if (!kind) return bad(res, "Missing kind");

  const contentType = String(req.headers["content-type"] || "application/octet-stream");
  if (!contentType.startsWith("image/")) return bad(res, "Only image uploads allowed");

  const buf = await readRawBody(req);
  if (!buf || !buf.length) return bad(res, "Empty upload");

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, subscriber_id, assigned_driver_id")
    .eq("id", jobId)
    .eq("subscriber_id", driver.subscriber_id)
    .maybeSingle();

  if (jobErr) return bad(res, jobErr.message || "Failed to load job", 500);
  if (!job) return bad(res, "Job not found", 404);

  if (String(job.assigned_driver_id || "") !== String(driver.id)) {
    return bad(res, "This job is not assigned to you", 403);
  }

  const ext = safeExtFromContentType(contentType);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${driver.subscriber_id}/${driver.id}/${jobId}/${ts}_${kind}.${ext}`;

  const bucket = supabase.storage.from("driver-photos");

  const { error: upErr } = await bucket.upload(path, buf, {
    contentType,
    upsert: false,
  });

  if (upErr) return bad(res, upErr.message || "Upload failed", 500);

  const { data: pub } = bucket.getPublicUrl(path);
  const publicUrl = pub?.publicUrl || null;

  if (!publicUrl) return bad(res, "Uploaded but could not get URL", 500);

  const { error: photoErr } = await supabase.from("job_photos").insert({
    subscriber_id: driver.subscriber_id,
    job_id: jobId,
    driver_id: driver.id,
    photo_url: publicUrl,
    photo_type: kind,
    created_at: new Date().toISOString(),
  });

  if (photoErr) {
    return bad(res, photoErr.message || "Uploaded but failed to record photo", 500);
  }

  return res.json({
    ok: true,
    path,
    url: publicUrl,
    kind,
  });
}
