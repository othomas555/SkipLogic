// lib/getSkipPricesForPostcode.js
import { supabase } from "./supabaseClient";

export async function getSkipPricesForPostcode(subscriberId, postcode) {
  if (!subscriberId || !postcode) {
    throw new Error("Missing subscriber or postcode");
  }

  const { data, error } = await supabase.rpc(
    "get_skip_prices_for_postcode",
    {
      _subscriber_id: subscriberId,
      _raw_postcode: postcode,
    }
  );

  if (error) {
    console.error("RPC get_skip_prices_for_postcode error:", error);
    throw error;
  }

  // data is an array of { skip_type_id, skip_type_name, price_inc_vat }
  return data || [];
}
