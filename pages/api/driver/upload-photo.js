// pages/api/driver/upload-photo.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getDriverFromSession } from "../../../lib/driverAuth";

export const config = {
  api: {
    bodyParser: false, // we will read raw bytes
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
  const kind = String(req.query.kind || "").trim(); // e.g. delivered / collected / swap_full / swap_empty
  if (!jobId) return bad(res, "Missing job_id");
  if (!kind) return bad(res, "Missing kind");

  const contentType = String(req.headers["content-type"] || "application/octet-stream");
  if (!contentType.startsWith("image/")) return bad(res, "Only image uploads allowed");

  const buf = await readRawBody(req);
  if (!buf || !buf.length) return bad(res, "Empty upload");

  // Path: subscriber/driver/job/timestamp_kind.ext
  const ext = safeExtFromContentType(contentType);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${driver.subscriber_id}/${driver.id}/${jobId}/${ts}_${kind}.${ext}`;

  const bucket = supabase.storage.from("driver-photos");

  const { error: upErr } = await bucket.upload(path, buf, {
    contentType,
    upsert: false,
  });

  if (upErr) return bad(res, upErr.message || "Upload failed", 500);

  // Public URL (bucket must be public)
  const { data: pub } = bucket.getPublicUrl(path);
  const publicUrl = pub?.publicUrl || null;

  if (!publicUrl) return bad(res, "Uploaded but could not get URL", 500);

  return res.json({ ok: true, path, url: publicUrl });
}
