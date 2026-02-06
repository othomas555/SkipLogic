// pages/api/driver/logout.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ⚠️ CHANGE THIS to match whatever cookie name getDriverFromSession reads.
  const COOKIE_NAME = "driver_session";

  // Clear cookie
  const cookie = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");

  res.setHeader("Set-Cookie", cookie);
  return res.status(200).json({ ok: true });
}
