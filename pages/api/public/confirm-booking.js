// pages/api/public/confirm-booking.js

import Stripe from "stripe";
import {earliestDelivery,ukHolidays,londonNow,isValidDeliveryDate} from "../../../lib/publicBookingCalendar";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { createInvoiceForJob } from "../xero/xero_create_invoice";
import { getSkipPricesForPostcodeAdmin } from "../../../lib/getSkipPricesForPostcode";

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function toDateOnly(value) {
  const d = value ? new Date(value) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseCutoffTime(value) {
  const t = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function isAllowedWeekday(date, allowSaturday, allowSunday) {
  const day = date.getDay();
  if (day === 6 && !allowSaturday) return false;
  if (day === 0 && !allowSunday) return false;
  return true;
}

function addCalendarDays(startDate, days) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function addBusinessDays(startDate, days, allowSaturday, allowSunday) {
  let remaining = Number(days || 0);
  const d = new Date(startDate);

  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isAllowedWeekday(d, allowSaturday, allowSunday)) {
      remaining -= 1;
    }
  }

  return d;
}

function moveToNextAllowedDate(date, allowSaturday, allowSunday) {
  const d = new Date(date);
  while (!isAllowedWeekday(d, allowSaturday, allowSunday)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function calculateEarliestBookingDate({
  now = new Date(),
  subscriberNoticeDays = 0,
  subscriberNoticeBusinessDays = true,
  allowSaturday = false,
  allowSunday = false,
  cutoffTime = null,
  permitRequired = false,
  permitDelayBusinessDays = 0,
}) {
  const nowDt = new Date(now);
  let baseDate = toDateOnly(nowDt);

  const cutoff = parseCutoffTime(cutoffTime);
  if (cutoff) {
    const afterCutoff =
      nowDt.getHours() > cutoff.hh ||
      (nowDt.getHours() === cutoff.hh && nowDt.getMinutes() >= cutoff.mm);

    if (afterCutoff) {
      baseDate = addCalendarDays(baseDate, 1);
    }
  }

  let subscriberDate = new Date(baseDate);
  if (subscriberNoticeBusinessDays) {
    subscriberDate = addBusinessDays(
      subscriberDate,
      subscriberNoticeDays,
      allowSaturday,
      allowSunday
    );
  } else {
    subscriberDate = addCalendarDays(subscriberDate, subscriberNoticeDays);
    subscriberDate = moveToNextAllowedDate(
      subscriberDate,
      allowSaturday,
      allowSunday
    );
  }

  let permitDate = new Date(baseDate);
  if (permitRequired) {
    permitDate = addBusinessDays(
      permitDate,
      permitDelayBusinessDays,
      allowSaturday,
      allowSunday
    );
  }

  let earliest = subscriberDate > permitDate ? subscriberDate : permitDate;
  earliest = moveToNextAllowedDate(earliest, allowSaturday, allowSunday);

  return {
    earliestDate: ymd(earliest),
  };
}

async function loadSubscriberBySlug(supabase, slug) {
  const { data, error } = await supabase
    .from("subscribers")
    .select(`
      id,
      company_name,
      public_booking_enabled,
      public_booking_slug,
      public_booking_title,
      public_booking_notice_days,
      public_booking_notice_working_days,
      public_booking_allow_saturday,
      public_booking_allow_sunday,
      public_booking_max_days_ahead,
      public_booking_cutoff_time,
      public_booking_use_permit_lead_times,
      public_booking_holiday_region,
      public_booking_block_bank_holidays
    `)
    .ilike("public_booking_slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to load subscriber");
  if (!data || !data.public_booking_enabled) throw new Error("Booking page not found");
  return data;
}

async function loadPermit(supabase, subscriberId, permitSettingId) {
  if (!permitSettingId) return null;

  const { data, error } = await supabase
    .from("permit_settings")
    .select("id, name, price_no_vat, delay_business_days, validity_days, is_active")
    .eq("subscriber_id", subscriberId)
    .eq("id", permitSettingId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to load permit setting");
  if (!data) throw new Error("Selected permit setting was not found");
  return data;
}

async function buildValidatedQuote({
  supabase,
  slug,
  postcode,
  placementType,
  permitSettingId,
  skipTypeId,
  scheduledDate,
}) {
  const subscriber = await loadSubscriberBySlug(supabase, slug);
  const skipOptions = await getSkipPricesForPostcodeAdmin(subscriber.id, postcode);

  if (!Array.isArray(skipOptions) || !skipOptions.length) {
    throw new Error("We don't serve this postcode or no prices are set.");
  }

  const selectedSkip =
    skipOptions.find((s) => String(s.skip_type_id) === String(skipTypeId || "")) || null;

  if (!selectedSkip) {
    throw new Error("Selected skip type is not valid for this postcode.");
  }

  const permit =
    placementType === "permit"
      ? await loadPermit(supabase, subscriber.id, permitSettingId)
      : null;

  const usePermitLeadTimes = !!subscriber.public_booking_use_permit_lead_times;
  const permitRequired = placementType === "permit" && !!permit && usePermitLeadTimes;

  const {data: periods,error: blackoutError}=await supabase.from("booking_blackouts")
    .select("start_date,end_date").eq("subscriber_id",subscriber.id);
  if(blackoutError)throw blackoutError;
  const holidays=await ukHolidays(subscriber.public_booking_holiday_region||"england-and-wales");
  const clock=londonNow();
  const cutoff=String(subscriber.public_booking_cutoff_time||"");
  const cutoffMinutes=/^\d{2}:\d{2}$/.test(cutoff)?Number(cutoff.slice(0,2))*60+Number(cutoff.slice(3,5)):null;
  const rules={allowSaturday:!!subscriber.public_booking_allow_saturday,allowSunday:!!subscriber.public_booking_allow_sunday,blockBankHolidays:subscriber.public_booking_block_bank_holidays!==false};
  const earliest=earliestDelivery({today:clock.today,afterCutoff:cutoffMinutes!==null&&clock.minutes>=cutoffMinutes,noticeDays:Number(subscriber.public_booking_notice_days||0),workingDays:!!subscriber.public_booking_notice_working_days,permitDays:permitRequired?Number(permit?.delay_business_days||0):0,holidays,periods:periods||[],rules});
  if(!isValidDeliveryDate(scheduledDate,earliest,holidays,periods||[],rules)){
    throw new Error("Delivery date is unavailable. Earliest available date: "+earliest);
  }
  if(subscriber.public_booking_max_days_ahead!=null){
    const limit=new Date(clock.today+"T12:00:00Z");
    limit.setUTCDate(limit.getUTCDate()+Number(subscriber.public_booking_max_days_ahead));
    if(scheduledDate>limit.toISOString().slice(0,10))throw new Error("Delivery date is beyond the advance booking limit.");
  }

  const skipPriceIncVat = clampMoney(selectedSkip.price_inc_vat);
  const permitPriceNoVat = clampMoney(permit?.price_no_vat || 0);
  const totalToCharge = clampMoney(skipPriceIncVat + permitPriceNoVat);

  return {
    subscriber,
    selectedSkip,
    permit,
    pricing: {
      skipPriceIncVat,
      permitPriceNoVat,
      totalToCharge,
    },
  };
}

async function findExistingJobBySession(supabase, subscriberId, sessionId) {
  const token = `[stripe_session:${sessionId}]`;

  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number, xero_invoice_id")
    .eq("subscriber_id", subscriberId)
    .ilike("notes", `%${token}%`)
    .limit(1);

  if (error) throw new Error(error.message || "Failed to check existing booking");
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function ensureInitialDeliveryEvent(supabase, subscriberId, jobId) {
  const { data: events, error: lookupError } = await supabase
    .from("job_events")
    .select("id")
    .eq("subscriber_id", subscriberId)
    .eq("job_id", jobId)
    .eq("event_type", "delivery")
    .eq("notes", "Initial delivery booked")
    .limit(1);
  if (lookupError) throw new Error("Cannot check delivery event: " + lookupError.message);
  if (events?.length) return;
  const { error } = await supabase.rpc("create_job_event", {
    _subscriber_id: subscriberId,
    _job_id: jobId,
    _event_type: "delivery",
    _scheduled_at: null,
    _completed_at: null,
    _notes: "Initial delivery booked",
  });
  if (error) {
    // Concurrent webhook/browser confirmations can both observe no delivery
    // event. The partial unique index allows only one initial delivery.
    // On a uniqueness conflict, verify that the winning request committed.
    if (error.code === "23505") {
      const { data: winner, error: recheckError } = await supabase
        .from("job_events")
        .select("id")
        .eq("subscriber_id", subscriberId)
        .eq("job_id", jobId)
        .eq("event_type", "delivery")
        .eq("notes", "Initial delivery booked")
        .limit(1);
      if (!recheckError && winner?.length) return;
    }
    throw new Error("Cannot create delivery event: " + error.message);
  }
}

async function flagPaidInvoiceFailure(supabase, subscriberId, jobId, error) {
  // Preserve existing manual review reasons (e.g. edited/cancelled invoices).
  const { data: job, error: loadError } = await supabase.from("jobs")
    .select("invoice_action_required,xero_invoice_id")
    .eq("subscriber_id", subscriberId).eq("id", jobId).single();
  if (loadError || !job || job.xero_invoice_id || job.invoice_action_required) return;
  const { error: updateError } = await supabase.from("jobs").update({
    invoice_action_required: true,
    invoice_action_reason: "online_payment_invoice_pending",
    invoice_action_note: "Stripe payment received. Xero invoice needs reconciliation; do not charge customer again. " +
      String(error?.message || error || "Unknown error").slice(0, 300),
  }).eq("subscriber_id", subscriberId).eq("id", jobId).eq("invoice_action_required", false).is("xero_invoice_id", null);
  if (updateError) console.error("Failed to flag paid invoice for review", jobId, updateError.message);
}

async function recoverExistingBooking(supabase, subscriberId, job, res) {
  try { await ensureInitialDeliveryEvent(supabase, subscriberId, job.id); }
  catch(e) { console.error("Paid job delivery event recovery failed",job.id,String(e?.message||e)); return res.status(503).json({ok:false,booking_created:true,job_id:job.id,error:"Paid booking saved; delivery event recovery pending."}); }
  if (job.xero_invoice_id) return res.status(200).json({ok:true,already_confirmed:true,job_id:job.id,job_number:job.job_number,invoice:{ok:true,mode:"already"}});
  try {
    const invoice=await createInvoiceForJob({subscriberId,jobId:job.id});
    return res.status(200).json({ok:true,already_confirmed:true,job_id:job.id,job_number:job.job_number,invoice:{ok:true,...invoice}});
  } catch(e) {
    console.error("Xero invoice retry failed for paid job",job.id,String(e?.message||e));
    await flagPaidInvoiceFailure(supabase, subscriberId, job.id, e);
    return res.status(503).json({ok:false,booking_created:true,job_id:job.id,job_number:job.job_number,error:"Payment received and booking saved. Xero invoice pending; do not pay again."});
  }
}

async function findOrCreateCustomer(supabase, subscriberId, md) {
  const email = asText(md.customer_email).toLowerCase();

  const { data: existing, error: findErr } = await supabase
    .from("customers")
    .select("id")
    .eq("subscriber_id", subscriberId)
    .ilike("email", email)
    .limit(1);

  if (findErr) throw new Error(findErr.message || "Failed to look up customer");

  if (Array.isArray(existing) && existing.length) {
    return existing[0].id;
  }

  const insertPayload = {
    subscriber_id: subscriberId,
    first_name: asText(md.customer_first_name),
    last_name: asText(md.customer_last_name),
    company_name: asText(md.customer_company_name) || null,
    email,
    phone: asText(md.customer_phone),
    address_line1: asText(md.site_address_line1),
    address_line2: asText(md.site_address_line2),
    address_line3: asText(md.site_town),
    postcode: asText(md.postcode),
    is_credit_account: false,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("customers")
    .insert([insertPayload])
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || "Could not create customer");
  }

  return inserted.id;
}

async function sendBookingEmail(req, job, md, totalToCharge) {
  try {
    const baseUrl = getBaseUrl(req);
    await fetch(`${baseUrl}/api/send_booking_email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job,
        customerName: `${asText(md.customer_first_name)} ${asText(md.customer_last_name)}`.trim(),
        customerEmail: asText(md.customer_email),
        jobPrice: String(totalToCharge),
      }),
    });
  } catch (err) {
    console.warn("public confirm send_booking_email failed:", err?.message || err);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ ok: false, error: "STRIPE_SECRET_KEY is missing" });
    }

    const sessionId = asText(req.body?.session_id);
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "session_id is required" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    });

    const supabase = getSupabaseAdmin();
    // A Connect direct charge lives on the operator account, not the platform.
    // Do not trust an arbitrary account ID from the browser.
    const slug = asText(req.body?.slug);
    if (!slug) return res.status(400).json({ok:false,error:"Booking slug is required"});
    const {data:owner,error:ownerError}=await supabase.from("subscribers")
      .select("id,stripe_connect_account_id").ilike("public_booking_slug",slug).single();
    if(ownerError||!owner?.stripe_connect_account_id)return res.status(404).json({ok:false,error:"Payment account not found"});
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    }, {stripeAccount:owner.stripe_connect_account_id});

    if (!session) {
      return res.status(404).json({ ok: false, error: "Checkout session not found" });
    }

    if (session.payment_status !== "paid") {
      return res.status(400).json({ ok: false, error: "Checkout session is not paid" });
    }

    const md = session.metadata || {};
    const metadataSlug = asText(md.booking_slug);
    const postcode = asText(md.postcode);
    const placementType = asText(md.placement_type) || "private";
    const permitSettingId = asText(md.permit_setting_id);
    const skipTypeId = asText(md.skip_type_id);
    const scheduledDate = asText(md.scheduled_date);

    if (slug !== metadataSlug) return res.status(400).json({ok:false,error:"Payment belongs to another booking page"});
    // A paid booking may be retried days later, after cutoffs or prices have changed.
    // Find it before revalidating the now-stale quote; never block invoice recovery.
    const existingPaidJob = await findExistingJobBySession(supabase, owner.id, session.id);
    if (existingPaidJob) {
      return recoverExistingBooking(supabase, owner.id, existingPaidJob, res);
    }
    // Checkout validated the date, postcode, permit and price BEFORE payment.
    // Once paid, honour that immutable snapshot rather than today's prices,
    // cutoff, holiday rules or an operator's later configuration changes.
    let quote;
    let expectedPence;
    if (asText(md.quote_version) === "1") {
      const readPence = (value) => {
        const text = asText(value);
        if (!/^\\d+$/.test(text)) throw new Error("Invalid paid quote snapshot");
        const amount = Number(text);
        if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid paid quote amount");
        return amount;
      };
      const skipPence = readPence(md.skip_price_pence);
      const permitPence = readPence(md.permit_price_pence);
      expectedPence = readPence(md.total_pence);
      if (asText(md.subscriber_id) !== String(owner.id) ||
          skipPence < 50 ||
          skipPence + permitPence !== expectedPence ||
          !skipTypeId || !/^\\d{4}-\\d{2}-\\d{2}$/.test(scheduledDate) ||
          !["private", "permit"].includes(placementType) ||
          (placementType === "private" && (permitSettingId || permitPence !== 0)) ||
          (placementType === "permit" && !permitSettingId)) {
        throw new Error("Invalid paid booking snapshot");
      }
      const delay = Number(asText(md.permit_delay_business_days));
      const validity = Number(asText(md.permit_validity_days));
      if (![delay, validity].every((n) => Number.isSafeInteger(n) && n >= 0)) {
        throw new Error("Invalid paid permit snapshot");
      }
      quote = {
        subscriber: { id: owner.id },
        selectedSkip: { skip_type_id: skipTypeId },
        permit: placementType === "permit"
          ? { id: permitSettingId, delay_business_days: delay, validity_days: validity }
          : null,
        pricing: {
          skipPriceIncVat: skipPence / 100,
          permitPriceNoVat: permitPence / 100,
          totalToCharge: expectedPence / 100,
        },
      };
    } else if (!asText(md.quote_version)) {
      // Compatibility for sessions issued before quote snapshots were added.
      quote = await buildValidatedQuote({
        supabase, slug, postcode, placementType, permitSettingId, skipTypeId, scheduledDate,
      });
      expectedPence = Math.round(quote.pricing.totalToCharge * 100);
    } else {
      throw new Error("Unsupported checkout quote version");
    }
    if (session.currency !== "gbp" || session.amount_total !== expectedPence) {
      return res.status(409).json({ok:false,error:"Payment amount does not match the checkout quote; contact support"});
    }
    const customerId = await findOrCreateCustomer(supabase, quote.subscriber.id, md);

    const { data: allocatedJobNumber, error: allocErr } = await supabase.rpc("alloc_job_number", {
      p_subscriber_id: quote.subscriber.id,
    });

    if (allocErr || !allocatedJobNumber) {
      throw new Error("Could not allocate a job number");
    }

    const sessionToken = `[stripe_session:${session.id}]`;
    const notes = [asText(md.notes), "[online_payment:paid_by_stripe]", sessionToken].filter(Boolean).join("\n");

    const insertPayload = {
      subscriber_id: quote.subscriber.id,
      customer_id: customerId,
      skip_type_id: String(quote.selectedSkip.skip_type_id),

      site_name: asText(md.site_name) || null,
      site_address_line1: asText(md.site_address_line1) || null,
      site_address_line2: asText(md.site_address_line2) || null,
      site_town: asText(md.site_town) || null,
      site_postcode: postcode || null,

      scheduled_date: scheduledDate || null,
      notes: notes || null,

      payment_type: "card",
      price_inc_vat: clampMoney(quote.pricing.skipPriceIncVat),

      placement_type: placementType || "private",
      permit_setting_id: quote.permit?.id || null,
      permit_price_no_vat: quote.permit ? clampMoney(quote.pricing.permitPriceNoVat) : null,
      permit_delay_business_days: quote.permit ? Number(quote.permit.delay_business_days || 0) : null,
      permit_validity_days: quote.permit ? Number(quote.permit.validity_days || 0) : null,
      permit_override: false,
      weekend_override: false,

      job_number: allocatedJobNumber,
    };

    const { data: job, error: insertErr } = await supabase
      .from("jobs")
      .insert([insertPayload])
      .select("*")
      .single();

    if (insertErr || !job) {
      // Unique Stripe session index protects against concurrent browser/webhook requests.
      // The losing request must never create a second invoice.
      if (insertErr?.code === "23505") {
        const alreadyCreated = await findExistingJobBySession(supabase, quote.subscriber.id, session.id);
        if (alreadyCreated) {
          return recoverExistingBooking(supabase, quote.subscriber.id, alreadyCreated, res);
        }
      }
      throw new Error(insertErr?.message || "Could not create job");
    }

    await ensureInitialDeliveryEvent(supabase, quote.subscriber.id, job.id);

    let invoice = null;
    try {
      const inv = await createInvoiceForJob({
        subscriberId: quote.subscriber.id,
        jobId: job.id,
      });
      invoice = { ok: true, ...inv };
    } catch (err) {
      invoice = {
        ok: false,
        error: "Invoice failed",
        details: String(err?.message || err),
      };
    }

    if (!invoice?.ok) {
      console.error("Xero invoice pending for paid job",job.id,invoice?.details||invoice?.error);
      await flagPaidInvoiceFailure(supabase, quote.subscriber.id, job.id, invoice?.details||invoice?.error);
      return res.status(503).json({ok:false,booking_created:true,job_id:job.id,job_number:job.job_number,error:"Payment received and booking saved. Xero invoice pending; do not pay again."});
    }
    await sendBookingEmail(req, job, md, quote.pricing.totalToCharge);

    return res.status(200).json({
      ok: true,
      already_confirmed: false,
      job_id: job.id,
      job_number: job.job_number,
      invoice,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err?.message || "Could not confirm booking"),
    });
  }
}
