import { getSupabaseAdmin } from "./supabaseAdmin";

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function ymdTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function siteAddress(job) {
  return [
    job?.site_name,
    job?.site_address_line1,
    job?.site_address_line2,
    job?.site_town,
    job?.site_postcode,
  ]
    .map(asText)
    .filter(Boolean)
    .join(", ");
}

function customerName(customer) {
  const person = `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim();
  return customer?.company_name || person || "Customer";
}

function customerAddress(customer) {
  return [
    customer?.billing_address_line1,
    customer?.billing_address_line2,
    customer?.billing_city,
    customer?.billing_region,
    customer?.billing_postcode,
    customer?.billing_country,
  ]
    .map(asText)
    .filter(Boolean)
    .join(", ");
}

function defaultSettings() {
  return {
    wtn_prefix: "WTN",
    company_name: "",
    company_address: "",
    waste_carrier_registration: "",
    environmental_permit_number: "",
    default_sic_code: "",
    default_ewc_code: "17 09 04",
    default_waste_description: "Mixed construction and demolition waste",
    default_container_type: "Skip",
    default_destination_site: "",
    declaration_text:
      "I confirm that the waste transfer described on this note is accurate and that the waste hierarchy has been considered.",
    footer_text: "",
  };
}

async function loadWtnSettings({ supabase, subscriberId }) {
  const { data, error } = await supabase
    .from("wtn_settings")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (error) throw error;
  return { ...defaultSettings(), ...(data || {}) };
}

async function getExistingWtn({ supabase, subscriberId, jobId }) {
  const { data, error } = await supabase
    .from("wtn_records")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function deriveSkipLabel(skipType) {
  if (!skipType) return "";

  return (
    asText(skipType.name) ||
    asText(skipType.label) ||
    asText(skipType.skip_name) ||
    asText(skipType.skip_size) ||
    asText(skipType.size_label) ||
    asText(skipType.description) ||
    ""
  );
}

function deriveQuantityDescription({ skipType }) {
  const skipLabel = deriveSkipLabel(skipType);

  if (skipLabel) return skipLabel;

  const yd =
    skipType?.yards ??
    skipType?.yard_size ??
    skipType?.size_yards ??
    skipType?.skip_yards ??
    null;

  const n = Number(yd);
  if (Number.isFinite(n) && n > 0) {
    return `${n} yard skip`;
  }

  return "One skip load";
}

export async function createWtnForJob({ subscriberId, jobId, transferDate = null }) {
  const supabase = getSupabaseAdmin();

  if (!subscriberId) throw new Error("subscriberId is required");
  if (!jobId) throw new Error("jobId is required");

  const existing = await getExistingWtn({ supabase, subscriberId, jobId });
  if (existing) {
    return {
      ok: true,
      mode: "existing",
      wtn: existing,
    };
  }

  const settings = await loadWtnSettings({ supabase, subscriberId });

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job) throw new Error("Job not found");

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("id", job.customer_id)
    .maybeSingle();

  if (customerErr) throw customerErr;

  let skipType = null;

  if (job.skip_type_id) {
    const { data: st, error: stErr } = await supabase
      .from("skip_types")
      .select("*")
      .eq("subscriber_id", subscriberId)
      .eq("id", job.skip_type_id)
      .maybeSingle();

    if (stErr) {
      console.warn("WTN skip type lookup failed:", stErr.message);
    }

    skipType = st || null;
  }

  const { data: counter, error: counterErr } = await supabase.rpc("next_wtn_counter", {
    _subscriber_id: subscriberId,
  });

  if (counterErr) throw counterErr;

  const number = Number(counter || 1);
  const prefix = asText(settings.wtn_prefix) || "WTN";
  const wtnNumber = `${prefix}-${String(number).padStart(6, "0")}`;

  const collectionAddress = siteAddress(job);
  const quantityDescription = deriveQuantityDescription({ skipType });
  const producerName = customerName(customer);
  const producerAddress = customerAddress(customer) || collectionAddress;
  const permitNumber = asText(settings.environmental_permit_number);

  const payload = {
    subscriber_id: subscriberId,
    job_id: job.id,
    customer_id: job.customer_id || null,

    wtn_number: wtnNumber,
    transfer_date: transferDate || job.collection_actual_date || ymdTodayLocal(),

    customer_name: producerName,
    customer_email: asText(customer?.email),
    waste_producer_name: producerName,
    waste_producer_address: producerAddress,
    collection_address: collectionAddress,

    carrier_name: asText(settings.company_name),
    carrier_address: asText(settings.company_address),
    waste_carrier_registration: asText(settings.waste_carrier_registration),
    environmental_permit: permitNumber,
    environmental_permit_number: permitNumber,

    sic_code: asText(settings.default_sic_code),
    ewc_code: asText(settings.default_ewc_code) || "17 09 04",
    waste_description:
      asText(settings.default_waste_description) || "Mixed construction and demolition waste",
    container_type: asText(settings.default_container_type) || "Skip",
    quantity: quantityDescription,
    quantity_description: quantityDescription,
    destination_site: asText(settings.default_destination_site),

    driver_name: "",
    vehicle_registration: "",

    declaration_text: asText(settings.declaration_text),
    footer_text: asText(settings.footer_text),

    snapshot: {
      job_number: job.job_number || null,
      site_postcode: job.site_postcode || null,
      skip_type_id: job.skip_type_id || null,
      skip_label: deriveSkipLabel(skipType) || null,
      payment_type: job.payment_type || null,
      price_inc_vat: job.price_inc_vat || null,
    },

    metadata: {
      job_number: job.job_number || null,
      site_postcode: job.site_postcode || null,
      skip_type_id: job.skip_type_id || null,
      skip_label: deriveSkipLabel(skipType) || null,
      payment_type: job.payment_type || null,
      price_inc_vat: job.price_inc_vat || null,
    },
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("wtn_records")
    .insert(payload)
    .select("*")
    .single();

  if (insertErr) {
    const again = await getExistingWtn({ supabase, subscriberId, jobId });
    if (again) {
      return {
        ok: true,
        mode: "existing_after_race",
        wtn: again,
      };
    }

    throw insertErr;
  }

  try {
    const pdfBuffer = generateWtnPdfBuffer(inserted);
    const pdfPath = `${subscriberId}/${inserted.wtn_number || inserted.id}.pdf`;

    const { error: bucketErr } = await supabase.storage.createBucket("wtn-pdfs", {
      public: false,
      fileSizeLimit: 1024 * 1024 * 5,
      allowedMimeTypes: ["application/pdf"],
    });

    if (bucketErr && !String(bucketErr.message || "").toLowerCase().includes("already exists")) {
      console.warn("WTN bucket create skipped:", bucketErr.message);
    }

    const { error: uploadErr } = await supabase.storage
      .from("wtn-pdfs")
      .upload(pdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.warn("WTN PDF upload failed:", uploadErr.message);
    } else {
      await supabase
        .from("wtn_records")
        .update({
          pdf_path: pdfPath,
          pdf_url: `/api/wtn/${inserted.id}?format=pdf`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inserted.id)
        .eq("subscriber_id", subscriberId);

      inserted.pdf_path = pdfPath;
      inserted.pdf_url = `/api/wtn/${inserted.id}?format=pdf`;
    }
  } catch (e) {
    console.warn("WTN PDF storage step failed:", e?.message || e);
  }

  return {
    ok: true,
    mode: "created",
    wtn: inserted,
  };
}

export function buildWtnPublicUrl(wtnId) {
  const base = asText(process.env.NEXT_PUBLIC_APP_URL);
  if (!base) return `/api/wtn/${wtnId}`;
  return `${base.replace(/\/$/, "")}/api/wtn/${wtnId}`;
}

export function buildWtnPdfUrl(wtnId) {
  const base = asText(process.env.NEXT_PUBLIC_APP_URL);
  if (!base) return `/api/wtn/${wtnId}?format=pdf`;
  return `${base.replace(/\/$/, "")}/api/wtn/${wtnId}?format=pdf`;
}

function pdfEscapeText(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, "")
    .replace(/\n/g, " ");
}

function sanitisePdfText(s) {
  return String(s == null ? "" : s)
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function wrapText(text, maxChars) {
  const words = sanitisePdfText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function addText(commands, text, x, y, size = 10, font = "F1") {
  commands.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscapeText(sanitisePdfText(text))}) Tj ET`);
}

function addLine(commands, x1, y1, x2, y2) {
  commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
}

function addBox(commands, x, y, w, h) {
  commands.push(`${x} ${y} ${w} ${h} re S`);
}

function value(wtn, ...keys) {
  for (const key of keys) {
    const v = asText(wtn?.[key]);
    if (v) return v;
  }
  return "";
}

function drawField(commands, label, val, x, y, width = 500) {
  addText(commands, label, x, y, 8, "F2");

  const lines = wrapText(val || "-", 80);
  let yy = y - 13;

  for (const line of lines.slice(0, 3)) {
    addText(commands, line, x, yy, 10, "F1");
    yy -= 12;
  }

  addLine(commands, x, yy + 5, x + width, yy + 5);

  return yy - 10;
}

function buildPdfObjects(pageContent) {
  const objects = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>"
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  objects.push(`<< /Length ${Buffer.byteLength(pageContent, "utf8")} >>\nstream\n${pageContent}\nendstream`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export function generateWtnPdfBuffer(wtn) {
  const commands = [];
  commands.push("1 w");

  addText(commands, "Waste Transfer Note", 40, 800, 22, "F2");
  addText(commands, `WTN Number: ${value(wtn, "wtn_number") || "-"}`, 40, 778, 11, "F2");
  addText(commands, `Transfer Date: ${value(wtn, "transfer_date") || "-"}`, 360, 778, 11, "F2");
  addLine(commands, 40, 765, 555, 765);

  let y = 740;

  addText(commands, "Transfer Details", 40, y, 14, "F2");
  y -= 20;
  y = drawField(commands, "Collection address", value(wtn, "collection_address"), 40, y);
  y = drawField(commands, "Destination site", value(wtn, "destination_site"), 40, y);

  y -= 5;
  addText(commands, "Waste Producer / Customer", 40, y, 14, "F2");
  y -= 20;
  y = drawField(commands, "Waste producer", value(wtn, "waste_producer_name", "customer_name"), 40, y);
  y = drawField(
    commands,
    "Producer address",
    value(wtn, "waste_producer_address", "collection_address"),
    40,
    y
  );

  y -= 5;
  addText(commands, "Carrier", 40, y, 14, "F2");
  y -= 20;
  y = drawField(commands, "Carrier name", value(wtn, "carrier_name"), 40, y);
  y = drawField(commands, "Carrier address", value(wtn, "carrier_address"), 40, y);
  y = drawField(
    commands,
    "Waste carrier registration",
    value(wtn, "waste_carrier_registration"),
    40,
    y
  );
  y = drawField(
    commands,
    "Environmental permit / exemption",
    value(wtn, "environmental_permit_number", "environmental_permit"),
    40,
    y
  );

  y -= 5;
  addText(commands, "Waste Description", 40, y, 14, "F2");
  y -= 20;

  const leftX = 40;
  const rightX = 310;

  addText(commands, "EWC code", leftX, y, 8, "F2");
  addText(commands, value(wtn, "ewc_code") || "-", leftX, y - 13, 10, "F1");

  addText(commands, "SIC code", rightX, y, 8, "F2");
  addText(commands, value(wtn, "sic_code") || "-", rightX, y - 13, 10, "F1");

  y -= 36;
  y = drawField(commands, "Waste description", value(wtn, "waste_description"), 40, y);

  addText(commands, "Container type", leftX, y, 8, "F2");
  addText(commands, value(wtn, "container_type") || "-", leftX, y - 13, 10, "F1");

  addText(commands, "Quantity", rightX, y, 8, "F2");
  addText(
    commands,
    value(wtn, "quantity_description", "quantity") || "-",
    rightX,
    y - 13,
    10,
    "F1"
  );

  y -= 45;

  addText(commands, "Transport", 40, y, 14, "F2");
  y -= 20;

  addText(commands, "Driver", leftX, y, 8, "F2");
  addText(commands, value(wtn, "driver_name") || "-", leftX, y - 13, 10, "F1");

  addText(commands, "Vehicle registration", rightX, y, 8, "F2");
  addText(commands, value(wtn, "vehicle_registration") || "-", rightX, y - 13, 10, "F1");

  y -= 45;

  addText(commands, "Declaration", 40, y, 14, "F2");
  y -= 20;

  addBox(commands, 40, y - 70, 515, 78);
  const declarationLines = wrapText(value(wtn, "declaration_text") || "-", 88).slice(0, 5);
  let dy = y - 12;
  for (const line of declarationLines) {
    addText(commands, line, 50, dy, 9, "F1");
    dy -= 11;
  }

  y -= 95;

  addLine(commands, 40, y, 245, y);
  addLine(commands, 310, y, 555, y);
  addText(commands, "Producer / customer signature", 40, y - 12, 8, "F1");
  addText(commands, "Carrier / driver signature", 310, y - 12, 8, "F1");

  const footer = value(wtn, "footer_text");
  if (footer) {
    const footerLines = wrapText(footer, 100).slice(0, 3);
    let fy = 40;
    for (const line of footerLines) {
      addText(commands, line, 40, fy, 8, "F1");
      fy -= 9;
    }
  }

  return buildPdfObjects(commands.join("\n"));
}
