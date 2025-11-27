// pages/xero-connect.js
//
// Tiny helper page to get a Xero access_token + tenantId using your browser.
// You visit /xero-connect, click "Connect to Xero", log in,
// and it will show you the access_token and tenantId on screen.
//
// IMPORTANT: Only you should ever visit this page. Don't link it publicly.

import { useEffect, useState } from "react";

const XERO_CLIENT_ID = process.env.NEXT_PUBLIC_XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.NEXT_PUBLIC_XERO_CLIENT_SECRET;

// Make sure this matches exactly what you set in the Xero app redirect URL.
const REDIRECT_URI =
  typeof window !== "undefined"
    ? `${window.location.origin}/xero-connect`
    : "";

const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";

export default function XeroConnectPage() {
  const [code, setCode] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [rawResponse, setRawResponse] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Read ?code=... from URL after redirect
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const authCode = params.get("code");
    if (authCode) {
      setCode(authCode);
    }
  }, []);

  async function startXeroLogin() {
    setErrorMsg("");

    if (!XERO_CLIENT_ID) {
      setErrorMsg("Missing NEXT_PUBLIC_XERO_CLIENT_ID env var.");
      return;
    }

    // Basic scopes: openid profile email + accounting
    const scope = encodeURIComponent(
      "openid profile email accounting.transactions accounting.settings"
    );

    const authorizeUrl = `${XERO_AUTHORIZE_URL}?response_type=code&client_id=${encodeURIComponent(
      XERO_CLIENT_ID
    )}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&scope=${scope}&state=skiplogic-test`;

    window.location.href = authorizeUrl;
  }

  async function exchangeCodeForTokens() {
  if (!code) {
    setErrorMsg("No ?code= in URL. Start Xero login first.");
    return;
  }

  try {
    setErrorMsg("");

    const res = await fetch("/api/xero_token_exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        redirectUri: REDIRECT_URI,
      }),
    });

    const json = await res.json();
    setRawResponse(json);

    if (!res.ok) {
      console.error("Token exchange failed via API:", json);
      setErrorMsg(
        `Token exchange failed: ${
          json.error || res.statusText
        }. Check raw response below.`
      );
      return;
    }

    setAccessToken(json.access_token || null);
    setRefreshToken(json.refresh_token || null);

    if (Array.isArray(json.tenants) && json.tenants.length > 0) {
      setTenantId(json.tenants[0].tenantId || json.tenants[0].id || null);
    } else {
      setTenantId(null);
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    setErrorMsg(`Unexpected error: ${String(err)}`);
  }
}


      // Xero returns tenants in a separate call usually, but some toolkits
      // include tenants here. If not present, we’ll instruct you to call /connections in Postman next.
      if (Array.isArray(json.tenants) && json.tenants.length > 0) {
        setTenantId(json.tenants[0].tenantId || json.tenants[0].id || null);
      } else {
        // In many cases, you need to call /connections with the access token
        // We just note that here for now.
        setTenantId(null);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setErrorMsg(`Unexpected error: ${String(err)}`);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Xero Connect Helper</h1>

      <p style={{ marginBottom: 16 }}>
        This page is only for you (the owner) to get a Xero{" "}
        <code>access_token</code> and <code>tenantId</code>. Do not share this
        link publicly.
      </p>

      {errorMsg && (
        <p style={{ color: "red", marginBottom: 16 }}>{errorMsg}</p>
      )}

      <section
        style={{
          marginBottom: 24,
          padding: 16,
          borderRadius: 8,
          border: "1px solid #ddd",
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Step 1: Start Xero login</h2>
        <p style={{ marginBottom: 8 }}>
          Click this to go to Xero, choose your organisation, and approve access.
        </p>
        <button
          type="button"
          onClick={startXeroLogin}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            backgroundColor: "#0070f3",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Connect to Xero
        </button>
      </section>

      <section
        style={{
          marginBottom: 24,
          padding: 16,
          borderRadius: 8,
          border: "1px solid #ddd",
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>
          Step 2: Exchange code for tokens
        </h2>
        <p style={{ marginBottom: 8 }}>
          After Xero redirects back here, you&apos;ll see <code>?code=...</code>{" "}
          in the URL. Then click this:
        </p>
        <button
          type="button"
          onClick={exchangeCodeForTokens}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            backgroundColor: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Exchange code for tokens
        </button>
        {code && (
          <p style={{ marginTop: 8, fontSize: 12 }}>
            Detected code: <code>{code}</code>
          </p>
        )}
      </section>

      <section
        style={{
          marginBottom: 24,
          padding: 16,
          borderRadius: 8,
          border: "1px solid #ddd",
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Results</h2>
        {accessToken && (
          <div style={{ marginBottom: 12 }}>
            <strong>Access Token:</strong>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                background: "#f4f4f4",
                padding: 8,
              }}
            >
              {accessToken}
            </pre>
          </div>
        )}
        {refreshToken && (
          <div style={{ marginBottom: 12 }}>
            <strong>Refresh Token:</strong>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                background: "#f4f4f4",
                padding: 8,
              }}
            >
              {refreshToken}
            </pre>
          </div>
        )}
        {tenantId && (
          <div style={{ marginBottom: 12 }}>
            <strong>Tenant ID (organisation):</strong>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                background: "#f4f4f4",
                padding: 8,
              }}
            >
              {tenantId}
            </pre>
          </div>
        )}

        {rawResponse && (
          <details>
            <summary>Raw token response</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                background: "#f4f4f4",
                padding: 8,
              }}
            >
              {JSON.stringify(rawResponse, null, 2)}
            </pre>
          </details>
        )}
      </section>
    </main>
  );
}
