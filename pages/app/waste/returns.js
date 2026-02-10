// pages/app/waste/returns.js
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function clampText(v) {
  return String(v ?? "").trim();
}

function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfQuarter(year, q) {
  // q: 1..4
  const month = (q - 1) * 3; // 0,3,6,9
  return new Date(year, month, 1, 0, 0, 0, 0);
}

function endOfQuarterExclusive(year, q) {
  // exclusive end: first day of next quarter
  const month = q * 3;
  return new Date(year, month, 1, 0, 0, 0, 0);
}

function toIsoStartOfDay(localYmd) {
  // local date string "YYYY-MM-DD" -> local start of day -> ISO
  if (!localYmd) return null;
  const [y, m, d] = localYmd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return dt.toISOString();
}

function toIsoEndExclusive(localYmd) {
  // local date string "YYYY-MM-DD" -> next day start -> ISO
  if (!localYmd) return null;
  const [y, m, d] = localYmd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString();
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function formatTonnes(n) {
  return (Math.round(num(n) * 1000) / 1000).toFixed(3);
}

function escapeCsvCell(v) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function WasteReturnsPage() {
  const { checking, user, subscriberId } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [regulator, setRegulator] = useState("NRW");

  // Period controls
  const now = useMemo(() => new Date(), []);
  const [mode, setMode] = useState("quarter"); // quarter | custom
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(() => {
    const m = now.getMonth(); // 0..11
    return Math.floor(m / 3) + 1; // 1..4
  });

  const [fromDate, setFromDate] = useState(ymd(startOfQuarter(now.getFullYear(), Math.floor(now.getMonth() / 3) + 1)));
  const [toDate, setToDate] = useState(ymd(new Date())); // inclusive day picker; we convert to exclusive end

  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");

  // compute active range in ISO
  const range = useMemo(() => {
    if (mode === "quarter") {
      const start = startOfQuarter(Number(year), Number(quarter));
      const endEx = endOfQuarterExclusive(Number(year), Number(quarter));
      return {
        label: `Q${quarter} ${year}`,
        startIso: start.toISOString(),
        endIso: endEx.toISOString(),
        startYmd: ymd(start),
        endYmd: ymd(new Date(endEx.getTime() - 1)), // last day of quarter (approx)
      };
    }
    // custom
    const startIso = toIsoStartOfDay(fromDate);
    const endIso = toIsoEndExclusive(toDate);
    return {
      label: `Custom ${fromDate} → ${toDate}`,
      startIso,
      endIso,
      startYmd: fromDate,
      endYmd: toDate,
    };
  }, [mode, year, quarter, fromDate, toDate]);

  const filteredRows = useMemo(() => {
    const q = clampText(search).toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.wtn_number,
        r.vehicle_reg,
        r.outlet_name_snapshot,
        r.ewc_code_snapshot,
        r.ewc_description_snapshot,
        r.quantity_source,
        r.container_type,
        r.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const byEwc = new Map(); // key code -> {code, desc, hazardous, tonnes}
    const byOutlet = new Map(); // key outlet -> {outlet, tonnes}
    let total = 0;

    for (const r of filteredRows) {
      const t = num(r.quantity_tonnes);
      total += t;

      const eKey = String(r.ewc_code_snapshot || "—");
      const eObj = byEwc.get(eKey) || {
        code: r.ewc_code_snapshot || "—",
        description: r.ewc_description_snapshot || "",
        hazardous: !!r.hazardous_snapshot,
        tonnes: 0,
        loads: 0,
      };
      eObj.tonnes += t;
      eObj.loads += 1;
      if (!eObj.description && r.ewc_description_snapshot) eObj.description = r.ewc_description_snapshot;
      byEwc.set(eKey, eObj);

      const oKey = String(r.outlet_name_snapshot || "—");
      const oObj = byOutlet.get(oKey) || { outlet: r.outlet_name_snapshot || "—", tonnes: 0, loads: 0 };
      oObj.tonnes += t;
      oObj.loads += 1;
      byOutlet.set(oKey, oObj);
    }

    const byEwcArr = Array.from(byEwc.values()).sort((a, b) => b.tonnes - a.tonnes);
    const byOutletArr = Array.from(byOutlet.values()).sort((a, b) => b.tonnes - a.tonnes);

    return { total, byEwcArr, byOutletArr };
  }, [filteredRows]);

  async function loadRegulator() {
    if (!subscriberId) return;
    const { data, error } = await supabase
      .from("subscribers")
      .select("regulator_agency")
      .eq("id", subscriberId)
      .maybeSingle();
    if (error) throw error;
    setRegulator(data?.regulator_agency || "NRW");
  }

  async function runQuery() {
    if (!subscriberId) return;
    setBusy(true);
    setErr("");
    setOk("");

    try {
      if (!range.startIso || !range.endIso) {
        throw new Error("Invalid date range.");
      }

      // load regulator (for display + export naming)
      await loadRegulator();

      // Pull everything in range (limit with pagination if needed later)
      const { data, error } = await supabase
        .from("waste_transfers_out")
        .select(
          "id, wtn_number, transfer_datetime, vehicle_reg, quantity_tonnes, quantity_source, container_type, notes, outlet_name_snapshot, ewc_code_snapshot, ewc_description_snapshot, hazardous_snapshot, created_at"
        )
        .eq("subscriber_id", subscriberId)
        .gte("transfer_datetime", range.startIso)
        .lt("transfer_datetime", range.endIso)
        .order("transfer_datetime", { ascending: false });

      if (error) throw error;

      setRows(data || []);
      setOk(`Loaded ${data?.length || 0} transfer(s) for ${range.label}.`);
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to load returns.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    async function boot() {
      if (checking) return;
      if (!user) {
        setLoading(false);
        return;
      }
      if (!subscriberId) {
        setErr("No subscriber found for this user.");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await loadRegulator();
        // auto-run initial query
        await runQuery();
      } catch (e) {
        setErr(e?.message || "Failed to load returns page.");
      } finally {
        setLoading(false);
      }
    }
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId]);

  function exportDetailedCsv() {
    const filename = `waste_transfers_${regulator}_${range.startYmd}_to_${range.endYmd}.csv`;
    const out = [
      [
        "Regulator",
        "Period",
        "WTN Number",
        "Transfer Date/Time (ISO)",
        "Outlet",
        "EWC Code",
        "EWC Description",
        "Hazardous",
        "Quantity Tonnes",
        "Vehicle Reg",
        "Quantity Source",
        "Container Type",
        "Notes",
      ],
    ];

    for (const r of filteredRows) {
      out.push([
        regulator,
        range.label,
        r.wtn_number || "",
        r.transfer_datetime || "",
        r.outlet_name_snapshot || "",
        r.ewc_code_snapshot || "",
        r.ewc_description_snapshot || "",
        r.hazardous_snapshot ? "YES" : "NO",
        formatTonnes(r.quantity_tonnes),
        r.vehicle_reg || "",
        r.quantity_source || "",
        r.container_type || "",
        r.notes || "",
      ]);
    }

    downloadCsv(filename, out);
  }

  function exportSummaryByEwcCsv() {
    // This is the most useful “returns-like” summary for NRW/EA
    // We’ll refine column names/ordering once you show the exact NRW return template you use.
    const filename = `waste_summary_by_ewc_${regulator}_${range.startYmd}_to_${range.endYmd}.csv`;
    const out = [
      ["Regulator", "Period", "EWC Code", "EWC Description", "Hazardous", "Loads", "Total Tonnes"],
    ];

    for (const e of totals.byEwcArr) {
      out.push([
        regulator,
        range.label,
        e.code,
        e.description,
        e.hazardous ? "YES" : "NO",
        String(e.loads),
        formatTonnes(e.tonnes),
      ]);
    }

    downloadCsv(filename, out);
  }

  if (checking || loading) {
    return (
      <main style={centerStyle}>
        <p>Loading waste returns…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Waste returns</h1>
        <p>You must be signed in.</p>
        <Link href="/login" style={linkStyle}>Go to login</Link>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app" style={linkStyle}>← Back to dashboard</Link>
          <h1 style={{ margin: "10px 0 0" }}>Waste returns</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Totals + exports for NRW/EA. (MVP summary by EWC + detailed transfers)
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/waste/out" style={{ ...btnSecondary, textDecoration: "none" }}>
            Waste out
          </Link>
          <Link href="/app/settings/waste" style={{ ...btnSecondary, textDecoration: "none" }}>
            Waste settings
          </Link>
        </div>
      </header>

      {(err || ok) ? (
        <div style={{ marginBottom: 14 }}>
          {err ? <p style={{ color: "red", margin: 0 }}>{err}</p> : null}
          {ok ? <p style={{ color: "green", margin: 0 }}>{ok}</p> : null}
        </div>
      ) : null}

      <section style={cardStyle}>
        <h2 style={h2Style}>Period</h2>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button style={mode === "quarter" ? btnTabActive : btnTab} onClick={() => setMode("quarter")}>
            Quarter
          </button>
          <button style={mode === "custom" ? btnTabActive : btnTab} onClick={() => setMode("custom")}>
            Custom
          </button>
        </div>

        {mode === "quarter" ? (
          <div style={gridStyle}>
            <label style={labelStyle}>
              Year
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Quarter
              <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} style={inputStyle}>
                <option value={1}>Q1 (Jan–Mar)</option>
                <option value={2}>Q2 (Apr–Jun)</option>
                <option value={3}>Q3 (Jul–Sep)</option>
                <option value={4}>Q4 (Oct–Dec)</option>
              </select>
            </label>
          </div>
        ) : (
          <div style={gridStyle}>
            <label style={labelStyle}>
              From (inclusive)
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle} />
            </label>

            <label style={labelStyle}>
              To (inclusive)
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle} />
            </label>
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#333" }}>
            <b>Regulator:</b> {regulator} &nbsp; | &nbsp; <b>Range:</b> {range.label}
          </div>

          <button style={btnPrimaryDark} onClick={runQuery} disabled={busy}>
            {busy ? "Loading…" : "Load"}
          </button>
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={h2Style}>Totals</h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search in loaded transfers…"
              style={{ ...inputStyle, minWidth: 280 }}
            />
            <button style={btnSecondary} onClick={exportSummaryByEwcCsv} disabled={filteredRows.length === 0}>
              Export summary (EWC)
            </button>
            <button style={btnSecondary} onClick={exportDetailedCsv} disabled={filteredRows.length === 0}>
              Export detailed
            </button>
          </div>
        </div>

        <div style={totalsRow}>
          <div>
            <div style={miniLabel}>Transfers</div>
            <div style={bigNum}>{filteredRows.length}</div>
          </div>

          <div>
            <div style={miniLabel}>Total tonnes</div>
            <div style={bigNum}>{formatTonnes(totals.total)}</div>
          </div>

          <div>
            <div style={miniLabel}>Distinct EWC</div>
            <div style={bigNum}>{totals.byEwcArr.length}</div>
          </div>

          <div>
            <div style={miniLabel}>Distinct outlets</div>
            <div style={bigNum}>{totals.byOutletArr.length}</div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
          <div style={subCard}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>By EWC</div>
            {totals.byEwcArr.length === 0 ? (
              <div style={{ fontSize: 13, color: "#666" }}>No data.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {totals.byEwcArr.map((e) => (
                  <div key={e.code} style={rowLine}>
                    <div style={{ fontWeight: 800 }}>
                      {e.code} {e.hazardous ? "(Haz)" : ""}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>{e.description}</div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      <b>{formatTonnes(e.tonnes)}</b> t &nbsp; · &nbsp; {e.loads} load(s)
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={subCard}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>By outlet</div>
            {totals.byOutletArr.length === 0 ? (
              <div style={{ fontSize: 13, color: "#666" }}>No data.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {totals.byOutletArr.map((o) => (
                  <div key={o.outlet} style={rowLine}>
                    <div style={{ fontWeight: 800 }}>{o.outlet}</div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      <b>{formatTonnes(o.tonnes)}</b> t &nbsp; · &nbsp; {o.loads} load(s)
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Loaded transfers</h2>
        <p style={{ marginTop: 0, color: "#666", fontSize: 13 }}>
          This is what the exports are built from. (Search above filters this list too.)
        </p>

        {filteredRows.length === 0 ? (
          <div style={{ fontSize: 13, color: "#666" }}>No transfers in this period.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredRows.slice(0, 200).map((r) => (
              <div key={r.id} style={subCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>
                    {r.wtn_number} — {formatTonnes(r.quantity_tonnes)} t
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {r.transfer_datetime ? new Date(r.transfer_datetime).toLocaleString() : "—"}
                  </div>
                </div>

                <div style={{ marginTop: 6, fontSize: 13, color: "#333", lineHeight: 1.5 }}>
                  <div><b>Outlet:</b> {r.outlet_name_snapshot || "—"}</div>
                  <div><b>EWC:</b> {r.ewc_code_snapshot || "—"} — {r.ewc_description_snapshot || "—"}{r.hazardous_snapshot ? " (Haz)" : ""}</div>
                  <div><b>Vehicle:</b> {r.vehicle_reg || "—"} | <b>Source:</b> {r.quantity_source || "—"} | <b>Container:</b> {r.container_type || "—"}</div>
                  {r.notes ? <div><b>Notes:</b> {r.notes}</div> : null}
                </div>
              </div>
            ))}
            {filteredRows.length > 200 ? (
              <div style={{ fontSize: 12, color: "#666" }}>
                Showing first 200 results. (We can add pagination later.)
              </div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#f7f7f7",
};

const centerStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 16,
};

const linkStyle = {
  textDecoration: "underline",
  color: "#0070f3",
  fontSize: 13,
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const subCard = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
};

const h2Style = { fontSize: 16, margin: "0 0 10px" };

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "#333",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
};

const btnPrimaryDark = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};

const btnSecondary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#f5f5f5",
  color: "#111",
  cursor: "pointer",
  fontSize: 13,
};

const btnTab = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnTabActive = {
  ...btnTab,
  border: "1px solid #111",
  fontWeight: 900,
};

const totalsRow = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 10,
  background: "#fafafa",
  marginTop: 10,
};

const miniLabel = { fontSize: 11, color: "#666", marginBottom: 4 };
const bigNum = { fontSize: 22, fontWeight: 900 };

const rowLine = {
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 10,
  background: "#fff",
};
