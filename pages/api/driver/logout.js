// pages/api/driver/logout.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Add/remove names here to match your project.
  // This is intentionally "nuclear" to guarantee logout.
  const COOKIE_NAMES = [
    "driver_session",
    "driverSession",
    "driver_token",
    "driverToken",
    "driver_auth",
    "driverAuth",
    "driver",
    "session",
    "token",
  ];

  // We clear cookies in multiple ways because if the original cookie was set with a Domain,
  // you MUST clear it with the same Domain.
  const domains = [
    null, // host-only (no Domain=)
    "skip-logic.vercel.app",
    ".vercel.app",
  ];

  const setCookies = [];

  for (const name of COOKIE_NAMES) {
    for (const domain of domains) {
      const parts = [];

      // clear value
      parts.push(`${name}=`);
      parts.push("Path=/");

      if (domain) parts.push(`Domain=${domain}`);

      // important: match common production cookie attributes
      parts.push("HttpOnly");
      parts.push("SameSite=Lax");

      // Vercel is HTTPS; Secure is usually used. Clearing with Secure helps match.
      parts.push("Secure");

      // expire immediately
      parts.push("Max-Age=0");

      setCookies.push(parts.join("; "));
    }
  }

  res.setHeader("Set-Cookie", setCookies);
  return res.status(200).json({ ok: true, cleared: COOKIE_NAMES.length * domains.length });
}
