// pages/api/distance-matrix.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { pairs } = req.body || {};

    // pairs = [{ key, from, to }, ...]
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return res.status(400).json({ error: "No pairs provided" });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "GOOGLE_MAPS_API_KEY not configured" });
    }

    const origins = pairs.map((p) => p.from || "").join("|");
    const destinations = pairs.map((p) => p.to || "").join("|");

    const params = new URLSearchParams();
    params.set("units", "metric");
    params.set("origins", origins);
    params.set("destinations", destinations);
    params.set("key", apiKey);

    const url =
      "https://maps.googleapis.com/maps/api/distancematrix/json?" +
      params.toString();

    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status !== "OK") {
      console.error("Distance Matrix API error:", data);
      return res
        .status(500)
        .json({ error: "Distance Matrix API error", details: data.status });
    }

    // We sent N origins and N destinations.
    // We'll read element [i][i] as the duration for pair i.
    const out = {};
    (pairs || []).forEach((pair, idx) => {
      const row = data.rows?.[idx];
      const element = row?.elements?.[idx];
      if (!element || element.status !== "OK") {
        // Leave it undefined; frontend will use fallback
        return;
      }
      // duration.value is in seconds
      const minutes = element.duration.value / 60;
      out[pair.key] = minutes;
    });

    return res.status(200).json({ travelMinutes: out });
  } catch (err) {
    console.error("distance-matrix handler error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
