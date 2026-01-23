// lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase environment variables are missing");
}

function makeClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "skiplogic-auth",
    },
  });
}

// Browser singleton + debug marker so we can confirm which code is deployed
if (typeof window !== "undefined") {
  window.__skiplogic_supabase_client_marker = "supabaseClient-singleton-v1";
  if (!window.__skiplogic_supabase) window.__skiplogic_supabase = makeClient();
}

export const supabase = typeof window === "undefined" ? makeClient() : window.__skiplogic_supabase;
