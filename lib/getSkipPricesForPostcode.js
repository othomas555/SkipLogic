// lib/getSkipPricesForPostcode.js
import { supabase } from "./supabaseClient";
import { getSupabaseAdmin } from "./supabaseAdmin";

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function runGetSkipPricesRpc(db, subscriberId, postcode) {
  if (!subscriberId || !postcode) {
    throw new Error("Missing subscriber or postcode");
  }

  const { data, error } = await db.rpc("get_skip_prices_for_postcode", {
    _subscriber_id: subscriberId,
    _raw_postcode: asText(postcode),
  });

  if (error) {
    console.error("RPC get_skip_prices_for_postcode error:", error);
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function getSkipPricesForPostcode(subscriberId, postcode) {
  return runGetSkipPricesRpc(supabase, subscriberId, postcode);
}

export async function getSkipPricesForPostcodeAdmin(subscriberId, postcode) {
  const admin = getSupabaseAdmin();
  return runGetSkipPricesRpc(admin, subscriberId, postcode);
}
