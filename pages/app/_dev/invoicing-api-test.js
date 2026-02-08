// pages/app/_dev/invoicing-api-test.js
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function InvoicingApiTestPage() {
  const { checking, user, subscriberId, errorMsg } = useAuthProfile();

  const [sessionInfo, setSessionInfo] = useState(null);
  const [apiResult, setApiResult] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function getToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    const token = data?.session?.access_token || null;
    if (!token) throw new Error("No access token found in supabase.auth.getSession()");
    return { token, session: data.session };
  }

  async function doGet() {
    setBusy(true);
    setApiError(null);
    setApiResult(null);

    try {
      const { token, session } = await getToken();

      setSessionInfo({
        ok: true,
        hasToken: true,
        userId: session?.user?.id || null,
        expiresAt: session?.expires_at || null,
      });

      const res = await fetch("/api/settings/invoicing", {
        headers: { Authorization: "Bearer " + token },
      });

      const json = await res.json();
      setApiResult({ status: res.status, json });
    } catch (e) {
      setApiError(String(e.message || e));
      setSessionInfo({ ok: false, error: String(e.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function doPostUpdate() {
    setBusy(true);
    setApiError(null);
    setApiResult(null);

    try {
      const { token, session } = await getToken();

      setSessionInfo({
        ok: true,
        hasToken: true,
        userId: session?.user?.id || null,
        expiresAt: session?.expires_at || null,
      });

      // Change these values just for test.
      // We keep them valid and deterministic.
      const payload = {
        skip_hire_sales_account_code: "200",
        permit_sales_account_code: "215",
        card_clearing_account_code: "800",
        use_defaults_when_missing: true,
        sales_categories: [
          { key: "haulage", label: "Haulage", account_code: "201", enabled: true, sort: 10 },
          { key: "grab", label: "Grab", account_code: "202", enabled: true, sort: 20 },
          { key: "extras", label: "Extras", account_code: "203", enabled: true, sort: 30 },
        ],
      };

      const res = await fetch("/api/settings/invoicing", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      setApiResult({ status: res.status, json });
    } catch (e) {
      setApiError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // auto-run GET once on load
    doGet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1 style={{ margin: 0, marginBottom: 12 }}>Invoicing API Test</h1>

      <div style={{ marginBottom: 16, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div><strong>Auth checking:</strong> {String(checking)}</div>
        <div><strong>Auth error:</strong> {errorMsg || "none"}</div>
        <div><strong>User:</strong> {user?.email || user?.id || "none"}</div>
        <div><strong>subscriberId:</strong> {subscriberId || "none"}</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button
          onClick={doGet}
          disabled={busy}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Refresh GET
        </button>

        <button
          onClick={doPostUpdate}
          disabled={busy}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          POST Update (test payload)
        </button>

        {busy ? <div style={{ alignSelf: "center" }}>Working…</div> : null}
      </div>

      <h3 style={{ marginTop: 0 }}>Session</h3>
      <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 10, overflow: "auto" }}>
        {JSON.stringify(sessionInfo, null, 2)}
      </pre>

      <h3>API Result</h3>
      {apiError ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#ffecec", border: "1px solid #ffb3b3" }}>
          <strong>Error:</strong> {apiError}
        </div>
      ) : (
        <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 10, overflow: "auto" }}>
          {JSON.stringify(apiResult, null, 2)}
        </pre>
      )}
    </main>
  );
}
