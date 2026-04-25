import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function row(label, value) {
  return `
    <tr>
      <th>${esc(label)}</th>
      <td>${esc(value || "—")}</td>
    </tr>
  `;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("Method not allowed");
    }

    const id = String(req.query?.id || "").trim();
    if (!id) return res.status(400).send("Missing WTN id");

    const supabase = getSupabaseAdmin();

    const { data: wtn, error } = await supabase
      .from("wtn_records")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!wtn) return res.status(404).send("WTN not found");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Waste Transfer Note ${esc(wtn.wtn_number)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
    h1 { margin: 0 0 4px; font-size: 26px; }
    h2 { margin-top: 28px; font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    .muted { color: #666; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { width: 260px; text-align: left; background: #f7f7f7; }
    th, td { border: 1px solid #ddd; padding: 10px; vertical-align: top; }
    .declaration { border: 1px solid #ddd; padding: 14px; margin-top: 10px; background: #fafafa; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; }
    @media print {
      body { padding: 16px; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <button onclick="window.print()" style="float:right;padding:10px 14px;border-radius:8px;border:1px solid #ccc;background:white;">
    Print / Save PDF
  </button>

  <h1>Waste Transfer Note</h1>
  <div class="muted">WTN Number: <b>${esc(wtn.wtn_number)}</b></div>

  <h2>Transfer details</h2>
  <table>
    ${row("Transfer date", wtn.transfer_date)}
    ${row("Collection address", wtn.collection_address)}
    ${row("Destination site", wtn.destination_site)}
  </table>

  <h2>Waste producer / customer</h2>
  <table>
    ${row("Waste producer", wtn.waste_producer_name)}
    ${row("Producer address", wtn.waste_producer_address)}
  </table>

  <h2>Carrier</h2>
  <table>
    ${row("Carrier name", wtn.carrier_name)}
    ${row("Carrier address", wtn.carrier_address)}
    ${row("Waste carrier registration", wtn.waste_carrier_registration)}
    ${row("Environmental permit / exemption", wtn.environmental_permit_number)}
  </table>

  <h2>Waste description</h2>
  <table>
    ${row("EWC code", wtn.ewc_code)}
    ${row("SIC code", wtn.sic_code)}
    ${row("Waste description", wtn.waste_description)}
    ${row("Container type", wtn.container_type)}
    ${row("Quantity", wtn.quantity_description)}
  </table>

  <h2>Transport</h2>
  <table>
    ${row("Driver", wtn.driver_name)}
    ${row("Vehicle registration", wtn.vehicle_registration)}
  </table>

  <h2>Declaration</h2>
  <div class="declaration">${esc(wtn.declaration_text)}</div>

  <div class="footer">${esc(wtn.footer_text)}</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (err) {
    console.error("api/wtn/[id] error", err);
    return res.status(500).send(err?.message || "Failed to load WTN");
  }
}
