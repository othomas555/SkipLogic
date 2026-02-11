// pages/api/import/bookings.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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

function aliasSkipSizeForMatching(raw) {
  const s = clean(raw);
  if (!s) return "";

  const m = s.match(/(\d{1,2})\s*(yd|yard|yards)?/);
  const n = m ? Number(m[1]) : null;

  if (Number.isFinite(n)) {
    if (n >= 12) return "maxi";
    if (n >= 8) return "builders";
    if (n >= 6) return "midi";
    return "mini";
  }

  if (s.includes("roofing")) return "builders";

  return s;
}

function parseMoney(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n;
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

function parseDateTimeToISO(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}t/i.test(s)) {
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const hh = m[4] != null ? Number(m[4]) : 0;
    const min = m[5] != null ? Number(m[5]) : 0;
    const ss = m[6] != null ? Number(m[6]) : 0;
    const dt = new Date(yyyy, mm - 1, dd, hh, min, ss);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  const d = parseDateToISODate(s);
  if (d) {
    const dt = new Date(d + "T00:00:00");
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

// ✅ NEW: detect weekend from YYYY-MM-DD (UTC-safe)
function isWeekendISODate(isoDate) {
  const s = String(isoDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const dt = new Date(s + "T00:00:00Z");
  const day = dt.getUTCDay(); // 0 Sun ... 6 Sat
  return day === 0 || day === 6;
}

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

function makeUniqueCustomerKey(r) {
  const email = clean(r.customer_email);
  const phone = clean(r.customer_phone);
  const company = clean(r.company_name);
  const first = clean(r.customer_first_name);
  const last = clean(r.customer_last_name);

  if (email) return `email:${email}`;
  if (phone && company) return `phone_company:${phone}|${company}`;
  if (phone) return `phone:${phone}`;
  if (company) return `company:${company}`;
  return `name:${first}|${last}|${company}|${phone}|${email}`;
}

function deriveJobStatus(r) {
  const collectionStatus = clean(r.collection_status);
  const deliveryStatus = clean(r.delivery_status);

  if (collectionStatus === "collected") return "collected";
  if (deliveryStatus === "delivered") return "delivered";
  return "booked";
}

// never null
function derivePlacementType(value) {
  const s = clean(value);

  if (
    s.includes("road") ||
    s.includes("public") ||
    s.includes("highway") ||
    s.includes("pavement") ||
    s.includes("kerb") ||
    s.includes("council")
  ) {
    return "road";
  }

  return "private";
}

function derivePaymentType(value) {
  const s = clean(value);
  if (!s) return null;
  if (s.includes("invoice") || s.includes("account")) return "account";
  if (s.includes("card")) return "card";
  if (s.includes("cash") || s.includes("cod")) return "cash";
  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const auth = await requireOfficeUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const subscriberId = String(auth.subscriber_id || "");
    assert(subscriberId, "No subscriber in auth context");

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const csvText = typeof body.csv_text === "string" ? body.csv_text : "";
    const fileName = typeof body.file_name === "string" ? body.file_name : "";

    if (!csvText.trim()) return res.status(400).json({ ok: false, error: "csv_text is required" });

    const grid = parseCSV(csvText);
    if (!grid.length) return res.status(400).json({ ok: false, error: "CSV appears empty" });

    const headerRow = grid[0].map((x) => String(x || "").trim());
    const { list: headerList, normMap } = normalizeHeaders(headerRow);

    const supabase = getSupabaseAdmin();

    const { data: skipTypes, error: stErr } = await supabase
      .from("skip_types")
      .select("id, name, subscriber_id")
      .or(`subscriber_id.eq.${subscriberId},subscriber_id.is.null`)
      .order("name", { ascending: true });

    if (stErr) {
      console.error("import bookings load skip_types error:", stErr);
      return res.status(500).json({ ok: false, error: "Failed to load skip_types", details: stErr.message });
    }

    const skipIndex = (skipTypes || []).map((st) => ({
      id: st.id,
      name: String(st.name || "").trim(),
      key: clean(st.name),
    }));

    function matchSkipTypeId(skipSizeRaw) {
      const aliased = aliasSkipSizeForMatching(skipSizeRaw);
      const ss = clean(aliased);
      if (!ss) return { id: "", match: "", method: "", aliased };
      const exact = skipIndex.find((x) => x.key === ss);
      if (exact) return { id: exact.id, match: exact.name, method: "exact", aliased };
      const contains = skipIndex.find((x) => x.key.includes(ss) || ss.includes(x.key));
      if (contains) return { id: contains.id, match: contains.name, method: "contains", aliased };
      return { id: "", match: "", method: "", aliased };
    }

    const mappedRows = [];
    for (let i = 1; i < grid.length; i++) {
      const arr = grid[i];
      if (!arr || arr.every((c) => String(c || "").trim() === "")) continue;

      const obj = {};
      for (let c = 0; c < headerList.length; c++) obj[headerList[c]] = arr[c] != null ? String(arr[c]) : "";

      const r = {
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
      };

      mappedRows.push({ rowIndex: i + 1, r });
    }

    const invalid = [];
    const unknownSkips = new Map();
    const distinctCustomerKeys = new Map();

    for (const x of mappedRows) {
      const r = x.r;
      const errs = [];
      const jobNo = String(r.job_no || "").trim();
      const address = String(r.address || "").trim();
      const postcode = String(r.postcode || "").trim();
      const deliveryDate = parseDateToISODate(r.delivery_date);
      const skipSize = String(r.skip_size || "").trim();

      if (!jobNo) errs.push("Missing Job No");
      if (!address) errs.push("Missing Address");
      if (!postcode) errs.push("Missing Postcode");
      if (!deliveryDate) errs.push("Missing/invalid Delivery Date");
      if (!skipSize) errs.push("Missing Skip Size");

      const match = matchSkipTypeId(skipSize);
      if (skipSize && !match.id) unknownSkips.set(clean(skipSize) || skipSize, (unknownSkips.get(clean(skipSize) || skipSize) || 0) + 1);

      if (errs.length) invalid.push({ csv_row: x.rowIndex + 1, job_no: jobNo || "—", errors: errs });

      const ck = makeUniqueCustomerKey(r);
      if (!distinctCustomerKeys.has(ck)) distinctCustomerKeys.set(ck, r);
    }

    if (unknownSkips.size) {
      return res.status(400).json({
        ok: false,
        error: "Unknown skip sizes found (import blocked)",
        details: Array.from(unknownSkips.entries()).map(([skip_size, count]) => ({ skip_size, count })),
      });
    }

    if (invalid.length) {
      return res.status(400).json({
        ok: false,
        error: "Invalid rows found (import blocked)",
        details: invalid.slice(0, 50),
      });
    }

    const { data: existingCustomers, error: custErr } = await supabase
      .from("customers")
      .select("id, subscriber_id, first_name, last_name, company_name, email, phone")
      .eq("subscriber_id", subscriberId);

    if (custErr) {
      console.error("import bookings load customers error:", custErr);
      return res.status(500).json({ ok: false, error: "Failed to load existing customers", details: custErr.message });
    }

    const customerByKey = new Map();
    for (const c of existingCustomers || []) {
      const key = makeUniqueCustomerKey({
        customer_email: c.email,
        customer_phone: c.phone,
        company_name: c.company_name,
        customer_first_name: c.first_name,
        customer_last_name: c.last_name,
      });
      if (!customerByKey.has(key)) customerByKey.set(key, c);
    }

    const { data: existingJobs, error: jobsErr } = await supabase
      .from("jobs")
      .select("id, job_number")
      .eq("subscriber_id", subscriberId);

    if (jobsErr) {
      console.error("import bookings load jobs error:", jobsErr);
      return res.status(500).json({ ok: false, error: "Failed to load existing jobs", details: jobsErr.message });
    }

    const existingJobNumbers = new Set((existingJobs || []).map((j) => String(j.job_number || "").trim()).filter(Boolean));

    const customersToInsert = [];
    for (const [ck, r] of distinctCustomerKeys.entries()) {
      if (customerByKey.has(ck)) continue;

      customersToInsert.push({
        subscriber_id: subscriberId,
        first_name: String(r.customer_first_name || "").trim() || null,
        last_name: String(r.customer_last_name || "").trim() || null,
        company_name: String(r.company_name || "").trim() || null,
        email: String(r.customer_email || "").trim() || null,
        phone: String(r.customer_phone || "").trim() || null,
      });
    }

    let customersInserted = 0;
    if (customersToInsert.length) {
      const { data: inserted, error: insErr } = await supabase
        .from("customers")
        .insert(customersToInsert)
        .select("id, first_name, last_name, company_name, email, phone");

      if (insErr) {
        console.error("import bookings insert customers error:", insErr);
        return res.status(500).json({ ok: false, error: "Failed to insert customers", details: insErr.message });
      }

      customersInserted = inserted?.length || 0;
      for (const c of inserted || []) {
        const key = makeUniqueCustomerKey({
          customer_email: c.email,
          customer_phone: c.phone,
          company_name: c.company_name,
          customer_first_name: c.first_name,
          customer_last_name: c.last_name,
        });
        if (!customerByKey.has(key)) customerByKey.set(key, c);
      }
    }

    const jobsToInsert = [];
    let jobsSkipped = 0;

    for (const x of mappedRows) {
      const r = x.r;
      const jobNo = String(r.job_no || "").trim();
      if (!jobNo) continue;

      if (existingJobNumbers.has(jobNo)) {
        jobsSkipped++;
        continue;
      }

      const custKey = makeUniqueCustomerKey(r);
      const cust = customerByKey.get(custKey);
      if (!cust?.id) {
        return res.status(500).json({ ok: false, error: "Customer mapping failed", details: { job_no: jobNo, cust_key: custKey } });
      }

      const deliveryDate = parseDateToISODate(r.delivery_date);
      const deliveryActual = parseDateToISODate(r.on_hire_start);
      const collectionSched = parseDateToISODate(r.staff_collection_date);
      const collectionActual = parseDateToISODate(r.on_hire_end);

      const originalSkip = String(r.skip_size || "").trim();
      const skipMatch = matchSkipTypeId(originalSkip);
      const price = parseMoney(r.base_skip_price_inc_vat);

      const notesParts = [];
      const n0 = String(r.notes || "").trim();
      const n1 = String(r.notes_1 || "").trim();
      if (n0) notesParts.push(n0);
      if (n1) notesParts.push(n1);

      const aliased = String(skipMatch.aliased || "").trim();
      if (originalSkip && aliased && clean(originalSkip) !== clean(aliased)) {
        notesParts.push(`Original skip size: ${originalSkip}`);
      }

      notesParts.push("Imported from Google Sheet");
      const notes = notesParts.filter(Boolean).join("\n");

      const createdAtISO = parseDateTimeToISO(r.booking_date);

      jobsToInsert.push({
        subscriber_id: subscriberId,
        customer_id: cust.id,
        job_number: jobNo,

        site_address_line1: String(r.address || "").trim() || null,
        site_postcode: String(r.postcode || "").trim() || null,

        scheduled_date: deliveryDate || null,
        delivery_actual_date: deliveryActual || null,
        collection_date: collectionSched || null,
        collection_actual_date: collectionActual || null,

        skip_type_id: skipMatch.id || null,
        placement_type: derivePlacementType(r.placement),

        // ✅ FIX for constraint: allow weekend dates by setting weekend_override
        weekend_override: isWeekendISODate(deliveryDate),

        price_inc_vat: price,
        job_status: deriveJobStatus(r),
        payment_type: derivePaymentType(r.booking_type),

        notes,
        created_at: createdAtISO,
      });

      existingJobNumbers.add(jobNo);
    }

    const CHUNK = 500;
    let jobsInserted = 0;

    for (let i = 0; i < jobsToInsert.length; i += CHUNK) {
      const chunk = jobsToInsert.slice(i, i + CHUNK);
      const { data: insJobs, error: insJobsErr } = await supabase.from("jobs").insert(chunk).select("id");
      if (insJobsErr) {
        console.error("import bookings insert jobs error:", insJobsErr);
        return res.status(500).json({ ok: false, error: "Failed to insert jobs", details: insJobsErr.message });
      }
      jobsInserted += insJobs?.length || chunk.length;
    }

    return res.status(200).json({
      ok: true,
      file_name: fileName || null,
      subscriber_id: subscriberId,
      summary: {
        csv_rows: mappedRows.length,
        unique_customers_detected: distinctCustomerKeys.size,
        customers_inserted: customersInserted,
        jobs_attempted: jobsToInsert.length,
        jobs_inserted: jobsInserted,
        jobs_skipped_existing: jobsSkipped,
      },
    });
  } catch (err) {
    console.error("import bookings error:", err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected error",
      details: String(err?.message || err),
    });
  }
}
