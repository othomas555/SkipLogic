// lib/xeroOAuth.js
import { getSupabaseAdmin } from "./supabaseAdmin";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";

function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function makeVerifier(len = 64) {
  const bytes = Buffer.from(Array.from({ length: len }, () => Math.floor(Math.random() * 256)));
  return base64url(bytes);
}

export async function makeChallenge(verifier) {
  const crypto = await import("crypto");
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return base64url(hash);
}

export function buildAuthorizeUrl({ state, codeChallenge }) {
  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI;

  if (!clientId) throw new Error("Missing XERO_CLIENT_ID");
  if (!redirectUri) throw new Error("Missing XERO_REDIRECT_URI");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: [
      "offline_access",
      "accounting.transactions",
      "accounting.contacts",
      "accounting.settings",
    ].join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken({ code, codeVerifier }) {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Xero env vars (XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_REDIRECT_URI)");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error_description || json?.error || "Xero token exchange failed");
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
    scope: json.scope,
  };
}

export async function refreshAccessToken(refreshToken) {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing XERO_CLIENT_ID or XERO_CLIENT_SECRET");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.error_description || json?.error || "Xero refresh failed");
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
  };
}

export async function fetchConnections(accessToken) {
  const resp = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const json = await resp.json().catch(() => []);
  if (!resp.ok || !Array.isArray(json)) throw new Error("Could not fetch Xero connections");

  // Each item: { id, tenantId, tenantType, createdDateUtc, updatedDateUtc }
  return json;
}

export async function saveXeroConnection({
  subscriberId,
  tenantId, // selected tenant id OR null
  tenants,  // array from /connections OR null
  accessToken,
  refreshToken,
  expiresAtIso,
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("xero_connections")
    .upsert(
      {
        subscriber_id: subscriberId,
        tenant_id: tenantId || null,
        tenants: tenants ? tenants : null,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAtIso,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "subscriber_id" }
    );

  if (error) throw new Error("Failed to store Xero connection");
}

export async function getXeroConnection(subscriberId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("xero_connections")
    .select("subscriber_id, tenant_id, tenants, access_token, refresh_token, expires_at")
    .eq("subscriber_id", subscriberId)
    .maybeSingle();

  if (error) throw new Error("Failed to load Xero connection");
  return data || null;
}

export async function getValidXeroClient(subscriberId) {
  const row = await getXeroConnection(subscriberId);
  if (!row) throw new Error("Xero not connected");

  const expiresAt = new Date(row.expires_at).getTime();
  const now = Date.now();

  // refresh 2 mins early
  if (Number.isFinite(expiresAt) && expiresAt - now > 120_000) {
    if (!row.tenant_id) {
      return { tenantId: null, accessToken: row.access_token, tenants: row.tenants || [] };
    }
    return { tenantId: row.tenant_id, accessToken: row.access_token, tenants: row.tenants || [] };
  }

  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await saveXeroConnection({
    subscriberId,
    tenantId: row.tenant_id || null,
    tenants: row.tenants || null,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || row.refresh_token,
    expiresAtIso: newExpiresAt,
  });

  return { tenantId: row.tenant_id || null, accessToken: refreshed.access_token, tenants: row.tenants || [] };
}
