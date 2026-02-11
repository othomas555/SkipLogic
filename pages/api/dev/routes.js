// pages/api/dev/routes.js
//
// GET /api/dev/routes
// Returns a list of routes derived from the repo's /pages directory.
//
// Security:
// - Requires authenticated office user (so it doesn't expose routes publicly).
// - This is safe to keep in prod; it's not a secret, and it's gated by auth.

import fs from "fs";
import path from "path";
import { requireOfficeUser } from "../../../lib/requireOfficeUser";

const IGNORE = new Set(["_app", "_document", "_error", "404", "500"]);

function isPageFile(name) {
  return (
    (name.endsWith(".js") || name.endsWith(".jsx") || name.endsWith(".ts") || name.endsWith(".tsx")) &&
    !name.endsWith(".test.js") &&
    !name.endsWith(".spec.js")
  );
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;

  const entries = fs.readdirSync(dir);
  for (const name of entries) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (st.isFile() && isPageFile(name)) {
      out.push(full);
    }
  }
  return out;
}

function toRoute(pagesDir, filePath) {
  const rel = path.relative(pagesDir, filePath).replace(/\\/g, "/");
  const base = rel.replace(/\.(jsx?|tsx?)$/, "");
  const parts = base.split("/");

  if (parts[0] === "api") return null;

  const last = parts[parts.length - 1];
  if (IGNORE.has(last)) return null;

  // Remove trailing /index
  const cleaned = parts.filter((p) => p !== "index");
  let route = "/" + cleaned.join("/");
  route = route.replace(/\/$/, "");
  if (route === "") route = "/";

  return route;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const pagesDir = path.join(process.cwd(), "pages");
    const files = walk(pagesDir);

    const routes = [];
    for (const f of files) {
      const r = toRoute(pagesDir, f);
      if (!r) continue;
      if (!r.startsWith("/app")) continue; // only app routes
      routes.push(r);
    }

    routes.sort((a, b) => a.localeCompare(b));

    return res.status(200).json({ ok: true, count: routes.length, routes });
  } catch (err) {
    console.error("routes api error:", err);
    return res.status(500).json({ ok: false, error: "Unexpected error", details: String(err?.message || err) });
  }
}
