// pages/api/jobs/status.js
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function asText(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function displayCustomer(c) {
  const company = asText(c?.company_name);
  const first = asText(c?.first_name);
  const last = asText(c?.last_name);
  const person = `${first} ${last}`.trim();

  if (company && person) return `${company} – ${person}`;
  if (company) return company;
  if (person) return person;
  return "Customer";
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

function renderSubject(templateSubject, job, customer) {
  return asText(templateSubject)
    .replaceAll("{{job_number}}", asText(job?.job_number))
    .replaceAll("{{customer_name}}", displayCustomer(customer))
    .replaceAll("{{delivery_date}}", asText(job?.delivery_actual_date || todayYmd()))
    .replaceAll("{{collection_date}}", asText(job?.collection_actual_date || todayYmd()))
    .replaceAll("{{site_address}}", siteAddress(job));
}

async function emailAlreadyQueuedOrSent(supabase, subscriberId, jobId, templateKey) {
  const { data, error } = await supabase
    .from("email_outbox")
    .select("id")
    .eq("subscriber_id", subscriberId)
    .eq("job_id", jobId)
    .eq("template_key", templateKey)
    .in("status", ["queued", "sent"])
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function queueEmailIfRequired({
  supabase,
  subscriberId,
  job,
  customer,
  templateKey,
  allowOnce = true,
}) {
  const toEmail = asText(customer?.email);
  if (!toEmail) {
    return {
      queued: false,
      template_key: templateKey,
      reason: "Customer has no email address.",
    };
  }

  if (allowOnce) {
    const already = await emailAlreadyQueuedOrSent(
      supabase,
      subscriberId,
      job.id,
      templateKey
    );

    if (already) {
      return {
        queued: false,
        template_key: templateKey,
        reason: "Email already queued or sent.",
      };
    }
  }

  const { data: template, error: templateError } = await supabase
    .from("email_templates")
    .select("template_key, enabled, subject")
    .eq("subscriber_id", subscriberId)
    .eq("template_key", templateKey)
    .maybeSingle();

  if (templateError) throw templateError;

  if (!template || template.enabled === false) {
    return {
      queued: false,
      template_key: templateKey,
      reason: "Template missing or disabled.",
    };
  }

  const subjectSnapshot = renderSubject(template.subject, job, customer);

  const { error: insertError } = await supabase.from("email_outbox").insert({
    subscriber_id: subscriberId,
    job_id: job.id,
    customer_id: job.customer_id,
    template_key: templateKey,
    to_email: toEmail,
    subject_snapshot: subjectSnapshot,
    status: "queued",
    provider: "resend",
  });

  if (insertError) throw insertError;

  return {
    queued: true,
    template_key: templateKey,
    to_email: toEmail,
    subject_snapshot: subjectSnapshot,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
@@ -30,7 +156,19 @@

    const { data: job, error: loadError } = await supabase
      .from("jobs")
      .select("id, subscriber_id, job_status, delivery_actual_date, collection_actual_date")
      .select(
        `
        *,
        customers:customer_id (
          id,
          first_name,
          last_name,
          company_name,
          phone,
          email
        )
      `
      )
      .eq("id", job_id)
      .eq("subscriber_id", subscriberId)
      .single();
@@ -46,7 +184,9 @@
      });
    }

    const customer = job.customers || {};
    const patch = {};
    const emailActions = [];

    if (action === "mark_delivered") {
      patch.job_status = "delivered";
@@ -90,20 +230,96 @@
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    if (updateError) throw updateError;

    const emailJob = {
      ...job,
      ...updatedJob,
    };

    if (action === "mark_delivered") {
      emailActions.push(
        await queueEmailIfRequired({
          supabase,
          subscriberId,
          job: emailJob,
          customer,
          templateKey: "delivered_confirmation",
          allowOnce: true,
        })
      );
    }

    if (action === "mark_collected") {
      emailActions.push(
        await queueEmailIfRequired({
          supabase,
          subscriberId,
          job: emailJob,
          customer,
          templateKey: "collected_confirmation",
          allowOnce: true,
        })
      );
    }

    if (action === "undo_delivered") {
      const deliveryEmailWasSentOrQueued =
        await emailAlreadyQueuedOrSent(
          supabase,
          subscriberId,
          job.id,
          "delivered_confirmation"
        );

      if (deliveryEmailWasSentOrQueued) {
        emailActions.push(
          await queueEmailIfRequired({
            supabase,
            subscriberId,
            job: emailJob,
            customer,
            templateKey: "delivery_marked_in_error",
            allowOnce: true,
          })
        );
      }
    }

    if (action === "undo_collected") {
      const collectionEmailWasSentOrQueued =
        await emailAlreadyQueuedOrSent(
          supabase,
          subscriberId,
          job.id,
          "collected_confirmation"
        );

      if (collectionEmailWasSentOrQueued) {
        emailActions.push(
          await queueEmailIfRequired({
            supabase,
            subscriberId,
            job: emailJob,
            customer,
            templateKey: "collection_marked_in_error",
            allowOnce: true,
          })
        );
      }
    }

    return res.status(200).json({
      ok: true,
      job: updatedJob,
      message: "Job status updated. No emails were sent.",
      email_actions: emailActions,
      message: "Job status updated.",
    });
  } catch (err) {
    console.error("jobs/status error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Status update failed",
    });
  }
}
