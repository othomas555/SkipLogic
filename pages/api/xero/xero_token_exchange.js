// pages/api/xero_token_exchange.js
//
// Minimal test handler – just proves the route works.
// We will wire in the real Xero token logic later.

export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    method: req.method,
    message: "xero_token_exchange API route is alive",
  });
}
