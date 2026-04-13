import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const auth = await requireOfficeUser(req, res);
    if (!auth || auth.ok === false) return;

    const id = String(req.query.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "Missing job id" });
    }

    const supabase = getSupabaseAdmin();

    const { data: jobRow, error: jobError } = await supabase
      .from("jobs")
      .select(
        `
          id,
          subscriber_id,
          customer_id,
          scheduled_date,
          collection_date,
          notes,
          created_at,
          job_number,
          skip_type_id,
          site_name,
          site_address_line1,
          site_address_line2,
          site_town,
          site_postcode,
          job_status,
          closed_at,
          payment_type,
          xero_invoice_id,
          xero_invoice_number,
          xero_invoice_status,
          price_inc_vat,
          assigned_driver_id,
          delivery_actual_date,
          collection_actual_date,
          hire_extension_days,
          work_date,
          driver_sort_key,
          driver_run_group,
          swap_parent_job_id,
          delivery_photo_url,
          collection_photo_url,
          swap_full_photo_url,
          swap_empty_photo_url,
          swap_group_id,
          swap_role,
          xero_sync_status,
          xero_last_error,
          xero_synced_at,
          weekend_override,
          placement_type,
          permit_setting_id,
          permit_price_no_vat,
          permit_delay_business_days,
          permit_validity_days,
          permit_override,
          paid_at,
          paid_method,
          paid_reference,
          paid_by_user_id,
          xero_payment_id,
          credit_override_token,
          credit_override_by_user_id,
          credit_override_at,
          credit_override_reason,
          credit_overridden_at,
          site_lat,
          site_lng,
          custom_skip_description,
          cancelled_at,
          cancelled_by,
          cancellation_reason,
          invoice_action_required,
          invoice_action_reason,
          invoice_action_note,
          last_edited_at,
          last_edited_by
        `
      )
      .eq("id", id)
      .eq("subscriber_id", auth.subscriber_id)
      .maybeSingle();

    if (jobError) {
      throw jobError;
    }

    if (!jobRow) {
      return res.status(404).json({ ok: false, error: "Job not found" });
    }

    const customerId = jobRow.customer_id || null;
    const skipTypeId = jobRow.skip_type_id || null;

    let customer = null;
    let skipType = null;

    if (customerId) {
      const { data: customerRow, error: customerError } = await supabase
        .from("customers")
        .select(
          `
            id,
            phone,
            email,
            first_name,
            last_name,
            company_name,
            address_line1,
            address_line2,
            address_line3,
            postcode,
            is_credit_account,
            account_code,
            credit_limit,
            term_hire_exempt,
            term_hire_days_override,
            xero_contact_id,
            billing_address_line1,
            billing_address_line2,
            billing_city,
            billing_region,
            billing_postcode,
            billing_country
          `
        )
        .eq("id", customerId)
        .eq("subscriber_id", auth.subscriber_id)
        .maybeSingle();

      if (customerError) {
        throw customerError;
      }

      customer = customerRow || null;
    }

    if (skipTypeId) {
      const { data: skipTypeRow, error: skipTypeError } = await supabase
        .from("skip_types")
        .select(
          `
            id,
            name,
            quantity_owned
          `
        )
        .eq("id", skipTypeId)
        .eq("subscriber_id", auth.subscriber_id)
        .maybeSingle();

      if (skipTypeError) {
        throw skipTypeError;
      }

      skipType = skipTypeRow || null;
    }

    const { data: skipTypesData, error: skipTypesError } = await supabase
      .from("skip_types")
      .select("id, name, quantity_owned")
      .eq("subscriber_id", auth.subscriber_id)
      .order("name", { ascending: true });

    if (skipTypesError) {
      throw skipTypesError;
    }

    const { data: permitSettingsData, error: permitSettingsError } = await supabase
      .from("permit_settings")
      .select(
        `
          id,
          name,
          price_no_vat,
          delay_business_days,
          validity_days
        `
      )
      .eq("subscriber_id", auth.subscriber_id)
      .order("name", { ascending: true });

    if (permitSettingsError) {
      throw permitSettingsError;
    }

    const job = {
      ...jobRow,

      phone: customer?.phone || null,
      email: customer?.email || null,
      first_name: customer?.first_name || null,
      last_name: customer?.last_name || null,
      company_name: customer?.company_name || null,
      address_line1: customer?.address_line1 || null,
      address_line2: customer?.address_line2 || null,
      address_line3: customer?.address_line3 || null,
      postcode: customer?.postcode || null,
      is_credit_account: customer?.is_credit_account ?? false,
      account_code: customer?.account_code || null,
      credit_limit: customer?.credit_limit ?? null,
      term_hire_exempt: customer?.term_hire_exempt ?? false,
      term_hire_days_override: customer?.term_hire_days_override ?? null,
      xero_contact_id: customer?.xero_contact_id || null,
      billing_address_line1: customer?.billing_address_line1 || null,
      billing_address_line2: customer?.billing_address_line2 || null,
      billing_city: customer?.billing_city || null,
      billing_region: customer?.billing_region || null,
      billing_postcode: customer?.billing_postcode || null,
      billing_country: customer?.billing_country || null,

      name: skipType?.name || null,
      quantity_owned: skipType?.quantity_owned ?? null,
    };

    return res.status(200).json({
      ok: true,
      job,
      lookups: {
        skip_types: asArray(skipTypesData),
        permit_settings: asArray(permitSettingsData),
      },
    });
  } catch (err) {
    console.error("jobs/get error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to load job",
    });
  }
}
