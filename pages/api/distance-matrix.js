// pages/api/distance-matrix.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { pairs } = req.body || {};

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return res.status(400).json({ error: "No pairs provided" });
    }

    const cleaned = pairs
      .map((p) => ({
        key: String(p?.key || ""),
        from: String(p?.from || "").trim(),
        to: String(p?.to || "").trim(),
      }))
      .filter((p) => p.key && p.from && p.to);

    if (cleaned.length === 0) {
      return res.status(400).json({ error: "All pairs were empty/invalid" });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GOOGLE_MAPS_API_KEY not configured" });
    }

    // This endpoint expects 1:1 pairs: origins[i] -> destinations[i], read [i][i]
    const origins = cleaned.map((p) => p.from).join("|");
    const destinations = cleaned.map((p) => p.to).join("|");

    const params = new URLSearchParams();
    params.set("units", "metric");
    params.set("origins", origins);
    params.set("destinations", destinations);
    params.set("key", apiKey);

    const url = "https://maps.googleapis.com/maps/api/distancematrix/json?" + params.toString();

    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status !== "OK") {
      console.error("Distance Matrix API error:", {
        status: data.status,
        error_message: data.error_message,
        origins_count: cleaned.length,
      });

      return res.status(500).json({
        error: "Distance Matrix API error",
        status: data.status,
        error_message: data.error_message || null,
      });
    }

    const out = {};
    cleaned.forEach((pair, idx) => {
      const row = data.rows?.[idx];
      const element = row?.elements?.[idx];

      if (!element || element.status !== "OK") {
        out[pair.key] = null;
        return;
      }

      out[pair.key] = element.duration?.value ? element.duration.value / 60 : null;
    });

    return res.status(200).json({ ok: true, travelMinutes: out });
  } catch (err) {
    console.error("distance-matrix handler error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
