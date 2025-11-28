const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM_EMAIL;
const SENDGRID_TO = process.env.SENDGRID_TO_EMAIL;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!SENDGRID_API_KEY || !SENDGRID_FROM || !SENDGRID_TO) {
    return res.status(500).json({
      error:
        "Missing SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, or SENDGRID_TO_EMAIL env vars",
    });
  }

  try {
    // ✅ Includes customerEmail, with proper commas
    const { job, customerName, customerEmail, jobPrice } = req.body || {};

    if (!job) {
      return res.status(400).json({ error: "Missing job in request body" });
    }

    const subject = `New skip booking: ${job.job_number || job.id}`;
    const priceText =
      jobPrice && jobPrice !== "" ? `Price: £${jobPrice}\n\n` : "";

    const text = `
A new skip booking has been created.

Job number: ${job.job_number || job.id}
Customer: ${customerName || "Unknown"}
${priceText}Site: ${job.site_name || "(no site name)"}
Postcode: ${job.site_postcode || ""}
Delivery date: ${job.scheduled_date || ""}
Payment type: ${job.payment_type || ""}

This is an automated email from SkipLogic.
`;

    // ✅ Decide where to send
    if (!customerEmail) {
      console.warn("No customerEmail provided, defaulting to SENDGRID_TO");
    }

    const toAddress = customerEmail || SENDGRID_TO;

    const personalizations = [
      {
        to: [{ email: toAddress }],
      },
    ];

    // ✅ Optionally BCC the office if sending to the customer
    if (customerEmail && SENDGRID_TO && SENDGRID_TO !== customerEmail) {
      personalizations[0].bcc = [{ email: SENDGRID_TO }];
    }

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations,
        from: { email: SENDGRID_FROM },
        subject,
        content: [{ type: "text/plain", value: text }],
      }),
    });

    if (response.status !== 202) {
      const msg = await response.text();
      console.error("SendGrid error:", msg);
      return res.status(500).json({ error: "SendGrid error", details: msg });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res
      .status(500)
      .json({ error: "Unexpected error", details: err?.message || err });
  }
}
