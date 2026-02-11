// scripts/list-routes.js
// Usage: node scripts/list-routes.js
// Lists Next.js Pages Router routes derived from /pages

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PAGES_DIR = path.join(ROOT, "pages");

const IGNORE = new Set([
  "_app.js",
  "_document.js",
  "_error.js",
  "404.js",
  "500.js",
]);

function isPageFile(file) {
  return (
    (file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".ts") || file.endsWith(".tsx")) &&
    !file.endsWith(".test.js") &&
    !file.endsWith(".spec.js")
  );
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;

  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (stat.isFile() && isPageFile(name)) {
      out.push(full);
    }
  }
  return out;
}

function toRoute(filePath) {
  const rel = path.relative(PAGES_DIR, filePath).replace(/\\/g, "/");
  const base = rel.replace(/\.(jsx?|tsx?)$/, "");

  const parts = base.split("/");

  // ignore special pages
  if (IGNORE.has(parts[parts.length - 1] + path.extname(filePath))) return null;
  if (parts[0] === "api") return null;

  // index => remove segment
  const cleaned = parts.filter((p) => p !== "index");

  let route = "/" + cleaned.join("/");
  route = route.replace(/\/$/, "");
  if (route === "") route = "/";

  return route;
}

function main() {
  if (!fs.existsSync(PAGES_DIR)) {
    console.error("No /pages directory found.");
    process.exit(1);
  }

  const files = walk(PAGES_DIR);
  const routes = [];

  for (const f of files) {
    const r = toRoute(f);
    if (r) routes.push(r);
  }

  routes.sort((a, b) => a.localeCompare(b));

  console.log(JSON.stringify({ count: routes.length, routes }, null, 2));
}

main();
