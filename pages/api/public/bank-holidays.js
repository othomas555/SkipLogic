function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const from = asText(req.query?.from);
    const to = asText(req.query?.to);

    const r = await fetch("https://www.gov.uk/bank-holidays.json");
    if (!r.ok) {
      throw new Error(`Bank holiday fetch failed (${r.status})`);
    }

    const json = await r.json();
    const events = Array.isArray(json?.["england-and-wales"]?.events)
      ? json["england-and-wales"].events
      : [];

    const filtered = events.filter((e) => {
      const d = asText(e?.date);
      if (!isYmd(d)) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });

    return res.status(200).json({
      ok: true,
      region: "england-and-wales",
      holidays: filtered.map((e) => ({
        title: asText(e?.title),
        date: asText(e?.date),
        notes: asText(e?.notes),
        bunting: !!e?.bunting,
      })),
    });
  } catch (err) {
    console.error("public/bank-holidays error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to load bank holidays",
    });
  }
}
