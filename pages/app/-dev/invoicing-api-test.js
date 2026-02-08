// pages/app/_dev/invoicing-api-test.js
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function InvoicingApiTestPage() {
  const { checking, user, subscriberId, errorMsg } = useAuthProfile();

  const [sessionInfo, setSessionInfo] = useState(null);
  const [apiResult, setApiResult] = useState(null);
  const [apiError, setApiError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setApiError(null);
      setApiResult(null);

      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;

      if (error) {
        setSessionInfo({ ok: false, error: error.message });
        return;
      }

      const token = data?.session?.access_token || null;

      setSessionInfo({
        ok: true,
        hasToken: !!token,
        userId: data?.session?.user?.id || null,
        expiresAt: data?.session?.expires_at || null,
      });

      if (!token) {
        setApiError("No access token found in supabase.auth.getSession()");
        return;
      }

      const res = await fetch("/api/settings/invoicing", {
        headers: { Authorization: "Bearer " + token },
      });

      const json = await res.json();
      if (cancelled) return;

      setApiResult({ status: res.status, json });
    }

    run();

    return () => {
      cancelled = true;
    };
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
