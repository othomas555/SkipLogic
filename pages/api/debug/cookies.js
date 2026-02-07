export default function handler(req, res) {
  const raw = req.headers.cookie || "";
  const names = raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split("=")[0]);

  return res.json({ ok: true, cookie_names: names });
}
