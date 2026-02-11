// pages/app/import/bookings.js
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

function moneyGBP(n) {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(x);
}

function clean(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bskip\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- NEW: skip size aliasing for import ---
function aliasSkipSizeForMatching(raw) {
  const s = clean(raw);
  if (!s) return "";

  // Extract a number if present (e.g. "12yd enclosed", "8 yd", etc.)
  const m = s.match(/(\d{1,2})\s*(yd|yard|yards)?/);
  const n = m ? Number(m[1]) : null;

  // Known sizing mapping to your existing 4/5 skip types
  // Adjust if your business labels differ.
  if (Number.isFinite(n)) {
    if (n >= 12) return "maxi";
    if (n >= 8) return "builders";
    if (n >= 6) return "midi";
    return "mini";
  }

  // Weird text that isn't a size (e.g. "amt roofing")
  // Default to builders, but we’ll preserve original text in notes during import.
  if (s.includes("roofing")) return "builders";

  return s;
}

function parseDateToISODate(value) {
  const s = String(value || "").trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function parseMoney(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n;
}

// Robust-ish CSV parser that supports quoted fields with commas/newlines.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\r") continue;

    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  rows.push(row);

  while (rows.length && rows[rows.length - 1].every((c) => String(c || "").trim() === "")) rows.pop();
  return rows;
}

function normalizeHeaders(headers) {
  const list = headers.map((h) => String(h || "").trim());
  const normMap = {};
  for (const h of list) normMap[clean(h)] = h;
  return { list, normMap };
}

function getCell(obj, headerNormMap, desiredHeaderNames) {
  for (const name of desiredHeaderNames) {
    const key = headerNormMap[clean(name)];
    if (key && Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  }
  return "";
}

function makeUniqueCustomerKey(row) {
  const email = clean(row.customer_email);
  const phone = clean(row.customer_phone);
  const company = clean(row.company_name);
  const first = clean(row.customer_first_name);
  const last = clean(row.customer_last_name);

  if (email) return `email:${email}`;
  if (phone && company) return `phone_company:${phone}|${company}`;
  if (phone) return `phone:${phone}`;
  if (company) return `company:${company}`;
  return `name:${first}|${last}|${company}|${phone}|${email}`;
}

function deriveJobStatus(row) {
  const collectionStatus = clean(row.collection_status);
  const deliveryStatus = clean(row.delivery_status);

  if (collectionStatus === "collected") return "collected";
  if (deliveryStatus === "delivered") return "delivered";
  return "booked";
}

function isLikelyUrl(s) {
  const t = String(s || "").trim();
  return /^https?:\/\/\S+/i.test(t);
}

export default function ImportBookingsPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [skipTypesLoading, setSkipTypesLoading] = useState(true);
  const [skipTypes, setSkipTypes] = useState([]);
  const [skipTypesErr, setSkipTypesErr] = useState("");

  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [parseErr, setParseErr] = useState("");

  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]); // array of {__raw, __mapped}
  const [previewCount, setPreviewCount] = useState(20);

  const [importBusy, setImportBusy] = useState(false);
  const [importOk, setImportOk] = useState("");
  const [importErr, setImportErr] = useState("");
  const [importResult, setImportResult] = useState(null);

  async function loadSkipTypes() {
    if (checking) return;
    if (!user || !subscriberId) return;

    setSkipTypesLoading(true);
    setSkipTypesErr("");

    const { data, error } = await supabase
      .from("skip_types")
      .select("id, name")
      .or(`subscriber_id.eq.${subscriberId},subscriber_id.is.null`)
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      setSkipTypesErr(`Could not load skip types: ${error.message}`);
      setSkipTypes([]);
      setSkipTypesLoading(false);
      return;
    }

    setSkipTypes(data || []);
    setSkipTypesLoading(false);
  }

  useEffect(() => {
    loadSkipTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, user, subscriberId]);

  const skipTypeIndex = useMemo(() => {
    return (skipTypes || []).map((st) => {
      const nm = String(st.name || "").trim();
      return { id: st.id, name: nm, key: clean(nm) };
    });
  }, [skipTypes]);

  function matchSkipTypeIdFromSize(skipSizeRaw) {
    const aliased = aliasSkipSizeForMatching(skipSizeRaw);
    const ss = clean(aliased);
    if (!ss) return { id: "", match: "", method: "", aliased: "" };

    const exact = skipTypeIndex.find((x) => x.key === ss);
    if (exact) return { id: exact.id, match: exact.name, method: "exact", aliased };

    const contains = skipTypeIndex.find((x) => x.key.includes(ss) || ss.includes(x.key));
    if (contains) return { id: contains.id, match: contains.name, method: "contains", aliased };

    return { id: "", match: "", method: "", aliased };
  }

  function resetParsed() {
    setParseErr("");
    setHeaders([]);
    setRows([]);
    setImportOk("");
    setImportErr("");
    setImportResult(null);
  }

  async function handleFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;

    setFileName(f.name);
    resetParsed();

    const text = await f.text();
    setRawText(text);

    try {
      const grid = parseCSV(text);
      if (!grid.length) throw new Error("CSV appears empty.");

      const headerRow = grid[0].map((x) => String(x || "").trim());
      const { list: headerList, normMap } = normalizeHeaders(headerRow);

      const out = [];
      for (let i = 1; i < grid.length; i++) {
        const arr = grid[i];
        if (!arr || arr.every((c) => String(c || "").trim() === "")) continue;

        const obj = {};
        for (let c = 0; c < headerList.length; c++) {
          obj[headerList[c]] = arr[c] != null ? String(arr[c]) : "";
        }

        const mapped = {
          job_no: getCell(obj, normMap, ["Job No", "Job Number", "job_number"]),
          booking_date: getCell(obj, normMap, ["Booking Date", "Created At", "created_at"]),
          customer_first_name: getCell(obj, normMap, ["Customer First Name", "First Name", "customer_first_name"]),
          customer_last_name: getCell(obj, normMap, ["Customer Last Name", "Last Name", "customer_last_name"]),
          company_name: getCell(obj, normMap, ["Company Name", "Company", "company_name"]),
          customer_email: getCell(obj, normMap, ["Customer Email", "Email", "customer_email"]),
          customer_phone: getCell(obj, normMap, ["Customer Phone", "Phone", "customer_phone"]),
          address: getCell(obj, normMap, ["Address", "Site Address", "site_address_line1"]),
          postcode: getCell(obj, normMap, ["Postcode", "Site Postcode", "site_postcode"]),
          skip_size: getCell(obj, normMap, ["Skip Size", "Skip", "skip_size"]),
          booking_type: getCell(obj, normMap, ["Booking Type", "Payment Type", "booking_type"]),
          placement: getCell(obj, normMap, ["Placement", "Placement Type", "placement"]),
          delivery_date: getCell(obj, normMap, ["Delivery Date", "scheduled_date", "Delivery"]),
          delivery_status: getCell(obj, normMap, ["Delivery Status", "job_status", "delivery_status"]),
          on_hire_start: getCell(obj, normMap, ["On-Hire Start", "Delivery Actual Date", "delivery_actual_date"]),
          staff_collection_date: getCell(obj, normMap, ["Staff Collection Date", "Collection Date", "collection_date"]),
          collection_status: getCell(obj, normMap, ["Collection Status", "collection_status"]),
          on_hire_end: getCell(obj, normMap, ["On-Hire End", "Collection Actual Date", "collection_actual_date"]),
          base_skip_price_inc_vat: getCell(obj, normMap, [
            "Base Skip Price (inc VAT)",
            "Skip Price",
            "price_inc_vat",
            "Price (inc VAT)",
          ]),
          notes: getCell(obj, normMap, ["Notes", "notes"]),
          notes_1: getCell(obj, normMap, ["Notes 1", "notes_1"]),
          wtn_pdf_link: getCell(obj, normMap, ["WTN PDF Link", "wtn_pdf_link"]),
        };

        out.push({ __raw: obj, __mapped: mapped });
      }

      setHeaders(headerList);
      setRows(out);
      setParseErr("");
    } catch (err) {
      console.error(err);
      setParseErr(String(err?.message || err));
    }
  }

  const analysis = useMemo(() => {
    if (!rows.length) {
      return {
        totalRows: 0,
        customerCount: 0,
        jobCount: 0,
        invalidRows: [],
        unknownSkipSizes: [],
        previewRows: [],
      };
    }

    const invalid = [];
    const unknownSkips = new Map();
    const custKeys = new Map();
    const preview = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].__mapped;

      const jobNo = String(r.job_no || "").trim();
      const deliveryDate = parseDateToISODate(r.delivery_date);
      const postcode = String(r.postcode || "").trim();
      const address = String(r.address || "").trim();
      const skipSize = String(r.skip_size || "").trim();

      const skipMatch = matchSkipTypeIdFromSize(skipSize);
      const basePrice = parseMoney(r.base_skip_price_inc_vat);

      const customerKey = makeUniqueCustomerKey(r);
      if (!custKeys.has(customerKey)) custKeys.set(customerKey, true);

      const errs = [];
      if (!jobNo) errs.push("Missing Job No");
      if (!skipSize) errs.push("Missing Skip Size");
      if (skipSize && !skipMatch.id) unknownSkips.set(clean(skipSize) || skipSize, (unknownSkips.get(clean(skipSize) || skipSize) || 0) + 1);
      if (!deliveryDate) errs.push("Missing/invalid Delivery Date");
      if (!postcode) errs.push("Missing Postcode");
      if (!address) errs.push("Missing Address");

      if (r.base_skip_price_inc_vat && basePrice == null) errs.push("Price present but not parseable");

      if (errs.length) invalid.push({ rowIndex: i + 2, jobNo: jobNo || "—", errors: errs });

      if (preview.length < previewCount) {
        const displaySkip = skipMatch.aliased && clean(skipSize) !== clean(skipMatch.aliased) ? `${skipSize} → ${skipMatch.aliased}` : skipSize;

        preview.push({
          rowIndex: i + 2,
          jobNo,
          deliveryDate,
          status: deriveJobStatus(r),
          skipSize: displaySkip,
          skipTypeMatch: skipMatch.id ? `${skipMatch.match} (${skipMatch.method})` : "—",
          postcode,
          address,
          price: basePrice,
          customer: `${(r.company_name || "").trim()}${
            r.customer_first_name || r.customer_last_name
              ? ` – ${(r.customer_first_name || "").trim()} ${(r.customer_last_name || "").trim()}`
              : ""
          }`,
          wtn: isLikelyUrl(r.wtn_pdf_link) ? "Yes" : "",
        });
      }
    }

    return {
      totalRows: rows.length,
      customerCount: custKeys.size,
      jobCount: rows.length,
      invalidRows: invalid,
      unknownSkipSizes: Array.from(unknownSkips.entries())
        .map(([k, count]) => ({ skipSize: k, count }))
        .sort((a, b) => b.count - a.count),
      previewRows: preview,
    };
  }, [rows, previewCount, skipTypeIndex]);

  const canProceed = useMemo(() => {
    if (!rows.length) return false;
    if (skipTypesLoading) return false;
    if (skipTypesErr) return false;
    if (!rawText.trim()) return false;
    if (analysis.unknownSkipSizes.length) return false;
    if (analysis.invalidRows.length) return false;
    return true;
  }, [rows.length, skipTypesLoading, skipTypesErr, rawText, analysis.unknownSkipSizes.length, analysis.invalidRows.length]);

  async function doImport() {
    setImportOk("");
    setImportErr("");
    setImportResult(null);
    setImportBusy(true);

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw new Error(sessionErr.message || "Could not read session");
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("No auth session token found. Try signing out and back in.");

      const res = await fetch("/api/import/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ csv_text: rawText, file_name: fileName || null }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        console.error("Import failed:", res.status, json);
        throw new Error(json?.error || `Import failed (HTTP ${res.status})`);
      }

      setImportResult(json);
      setImportOk("Import completed successfully.");
    } catch (e) {
      setImportErr(String(e?.message || e));
    } finally {
      setImportBusy(false);
    }
  }

  if (checking) {
    return (
      <main style={centerStyle}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={pageStyle}>
        <h1>Import bookings</h1>
        <p>You must be signed in.</p>
        <button style={btnSecondary} onClick={() => router.push("/login")}>
          Go to login
        </button>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <Link href="/app" style={linkStyle}>
            ← Back to dashboard
          </Link>
          <h1 style={{ margin: "10px 0 0" }}>Import bookings</h1>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 13 }}>
            Upload your historical CSV and preview what will be imported.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnSecondary} onClick={() => router.push("/app/settings")}>
            Settings
          </button>
        </div>
      </header>

      {(authError || skipTypesErr || parseErr) && (
        <section style={{ ...cardStyle, borderColor: "#ffd1d1", background: "#fff5f5" }}>
          <p style={{ color: "#8a1f1f", margin: 0, fontWeight: 800 }}>{authError || skipTypesErr || parseErr}</p>
        </section>
      )}

      {(importOk || importErr) && (
        <section
          style={{
            ...cardStyle,
            borderColor: importErr ? "#ffd1d1" : "#c7f9cc",
            background: importErr ? "#fff5f5" : "#f0fff4",
          }}
        >
          {importOk ? <p style={{ margin: 0, color: "#0f5132", fontWeight: 900 }}>{importOk}</p> : null}
          {importErr ? <p style={{ margin: 0, color: "#8a1f1f", fontWeight: 900 }}>{importErr}</p> : null}
          {importResult ? <pre style={preStyle}>{JSON.stringify(importResult, null, 2)}</pre> : null}
        </section>
      )}

      <section style={cardStyle}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 13, fontWeight: 800 }}>
            CSV file:
            <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "block", marginTop: 6 }} />
          </label>

          <div style={{ fontSize: 12, color: "#666" }}>
            {fileName ? (
              <>
                Loaded: <b>{fileName}</b>
              </>
            ) : (
              "No file selected"
            )}
          </div>

          <div style={{ fontSize: 12, color: "#666" }}>
            Skip types: {skipTypesLoading ? <b>Loading…</b> : <b>{skipTypes.length}</b>} found
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#666" }}>
              Preview rows:
              <input
                type="number"
                min={5}
                max={200}
                value={previewCount}
                onChange={(e) => setPreviewCount(Math.max(5, Math.min(200, Number(e.target.value) || 20)))}
                style={{ ...inputStyle, width: 90, marginLeft: 8 }}
              />
            </label>

            <button style={canProceed ? btnPrimary : btnDisabled} onClick={doImport} disabled={!canProceed || importBusy}>
              {importBusy ? "Importing…" : "Import CSV"}
            </button>
          </div>
        </div>

        {rows.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
            Parsed <b>{analysis.totalRows}</b> rows, <b>{headers.length}</b> columns. Ready:{" "}
            {canProceed ? <b style={{ color: "#0f5132" }}>YES</b> : <b style={{ color: "#8a1f1f" }}>NO</b>}
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <>
          <section style={cardStyle}>
            <h2 style={h2Style}>Summary</h2>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={statCard}>
                <div style={statLabel}>Rows</div>
                <div style={statValue}>{analysis.totalRows}</div>
              </div>

              <div style={statCard}>
                <div style={statLabel}>Unique customers (estimated)</div>
                <div style={statValue}>{analysis.customerCount}</div>
              </div>

              <div style={statCard}>
                <div style={statLabel}>Jobs</div>
                <div style={statValue}>{analysis.jobCount}</div>
              </div>

              <div style={{ ...statCard, borderColor: analysis.invalidRows.length ? "#ffd1d1" : "#eee" }}>
                <div style={statLabel}>Invalid rows</div>
                <div style={{ ...statValue, color: analysis.invalidRows.length ? "#8a1f1f" : "#111" }}>
                  {analysis.invalidRows.length}
                </div>
              </div>

              <div style={{ ...statCard, borderColor: analysis.unknownSkipSizes.length ? "#ffe7b5" : "#eee" }}>
                <div style={statLabel}>Unknown skip sizes</div>
                <div style={{ ...statValue, color: analysis.unknownSkipSizes.length ? "#7a5a00" : "#111" }}>
                  {analysis.unknownSkipSizes.length}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
              Import aliases enabled: <b>8yd → Builders</b>, <b>12yd → Maxi</b>, small sizes fall back to Midi/Mini.
              Non-size text (eg “roofing”) defaults to Builders but is preserved in notes.
            </div>
          </section>

          {analysis.unknownSkipSizes.length > 0 && (
            <section style={{ ...cardStyle, borderColor: "#ffe7b5", background: "#fffaf0" }}>
              <h2 style={h2Style}>Unknown skip sizes (still blocked)</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Skip size (cleaned)</th>
                      <th style={thStyle}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.unknownSkipSizes.slice(0, 50).map((x) => (
                      <tr key={x.skipSize}>
                        <td style={tdStyle}>{x.skipSize}</td>
                        <td style={tdStyle}>{x.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section style={cardStyle}>
            <h2 style={h2Style}>Preview (first {previewCount} rows)</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>CSV row</th>
                    <th style={thStyle}>Job No</th>
                    <th style={thStyle}>Delivery date</th>
                    <th style={thStyle}>Derived status</th>
                    <th style={thStyle}>Skip size</th>
                    <th style={thStyle}>Skip type match</th>
                    <th style={thStyle}>Postcode</th>
                    <th style={thStyle}>Address</th>
                    <th style={thStyle}>Price (base inc VAT)</th>
                    <th style={thStyle}>Customer</th>
                    <th style={thStyle}>WTN?</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.previewRows.map((r) => (
                    <tr key={`${r.rowIndex}-${r.jobNo}`}>
                      <td style={tdStyle}>{r.rowIndex}</td>
                      <td style={tdStyle}>{r.jobNo || "—"}</td>
                      <td style={tdStyle}>{r.deliveryDate || "—"}</td>
                      <td style={tdStyle}>{r.status || "—"}</td>
                      <td style={tdStyle}>{r.skipSize || "—"}</td>
                      <td style={tdStyle}>{r.skipTypeMatch}</td>
                      <td style={tdStyle}>{r.postcode || "—"}</td>
                      <td style={tdStyle}>{r.address || "—"}</td>
                      <td style={tdStyle}>{r.price == null ? "—" : moneyGBP(r.price)}</td>
                      <td style={tdStyle}>{r.customer || "—"}</td>
                      <td style={tdStyle}>{r.wtn ? "Yes" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
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

const linkStyle = { textDecoration: "underline", color: "#0070f3", fontSize: 13 };

const cardStyle = {
  background: "#fff",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
};

const h2Style = { margin: "0 0 10px", fontSize: 14 };

const thStyle = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: "10px 8px",
  fontSize: 12,
  fontWeight: 700,
  color: "#333",
};

const tdStyle = {
  borderBottom: "1px solid #eee",
  padding: "10px 8px",
  fontSize: 12,
  color: "#111",
  verticalAlign: "top",
};

const inputStyle = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid #ccc",
  fontSize: 13,
  background: "#fff",
};

const btnPrimary = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #0070f3",
  background: "#0070f3",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnDisabled = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#eee",
  color: "#777",
  cursor: "not-allowed",
  fontSize: 13,
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

const statCard = {
  minWidth: 160,
  flex: "0 0 auto",
  border: "1px solid #eee",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
};

const statLabel = { fontSize: 12, color: "#666" };
const statValue = { fontSize: 22, fontWeight: 900, marginTop: 6 };

const preStyle = {
  marginTop: 10,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 12,
  background: "#fff",
  border: "1px solid #ddd",
  padding: 10,
  borderRadius: 10,
  color: "#111",
};
