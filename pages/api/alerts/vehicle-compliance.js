// pages/api/alerts/vehicle-compliance.js
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  // protect endpoint with a secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data: subscribers } = await supabase
    .from("subscribers")
    .select("id, transport_manager_email, vehicle_alert_days_before")
    .not("transport_manager_email", "is", null);

  let sent = 0;

  for (const sub of subscribers || []) {
    // prevent duplicate daily sends
    const { data: already } = await supabase
      .from("vehicle_alert_runs")
      .select("id")
      .eq("subscriber_id", sub.id)
      .eq("run_date", today)
      .maybeSingle();

    if (already) continue;

    const alertDays = sub.vehicle_alert_days_before ?? 14;
    const alertDate = new Date();
    alertDate.setDate(alertDate.getDate() + alertDays);

    const { data: issues } = await supabase
      .from("v_vehicle_compliance")
      .select("reg, item, due_date")
      .eq("subscriber_id", sub.id)
      .lte("due_date", alertDate.toISOString().slice(0, 10));

    if (!issues || issues.length === 0) continue;

    // build email
    const rows = issues
      .map((i) => `<li><b>${i.reg}</b> – ${i.item} due ${i.due_date}</li>`)
      .join("");

    const html = `
      <h2>Vehicle compliance alerts</h2>
      <p>The following items are due or overdue:</p>
      <ul>${rows}</ul>
      <p>Please log into SkipLogic to review.</p>
    `;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SkipLogic <alerts@skiplogic.app>",
        to: sub.transport_manager_email,
        subject: "⚠ Vehicle compliance alerts",
        html,
      }),
    });

    await supabase.from("vehicle_alert_runs").insert({
      subscriber_id: sub.id,
      run_date: today,
    });

    sent++;
  }

  res.json({ ok: true, sent });
}
