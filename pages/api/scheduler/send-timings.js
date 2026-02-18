// pages/api/scheduler/send-timings.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { date, jobs } = req.body || {};

    if (!date) return res.status(400).json({ error: "Missing date" });
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: "No jobs to message" });
    }

    // TODO: Replace this with your actual messaging provider integration.
    // For example:
    // - SMS: Vonage / Twilio
    // - Email: Resend / SendGrid
    // - WhatsApp: Twilio
    //
    // This handler currently returns what it WOULD send, so you can confirm payload is correct.

    const candidates = jobs.filter((j) => j && (j.customer_phone || j.customer_email));

    return res.status(200).json({
      ok: true,
      date,
      queued: candidates.length,
      skipped: jobs.length - candidates.length,
      sample: candidates.slice(0, 3),
    });
  } catch (err) {
    console.error("send-timings error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
