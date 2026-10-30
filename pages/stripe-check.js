import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function StripeCheck() {
  const [result, setResult] = useState("Checking Stripe account…");
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) { setResult("Please log in to SkipLogic first, then refresh this page."); return; }
        const response = await fetch("/api/stripe/account-diagnostic", {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        });
        const json = await response.json();
        setResult(JSON.stringify(json, null, 2));
      } catch (error) {
        setResult("Check failed: " + String(error?.message || error));
      }
    })();
  }, []);
  return <main style={{fontFamily:"system-ui",padding:32,maxWidth:700,margin:"auto"}}>
    <h1>Stripe account check</h1>
    <p>This shows which Stripe account this SkipLogic website is using. No secret keys are displayed.</p>
    <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",padding:16,background:"#f4f4f4",borderRadius:8}}>{result}</pre>
  </main>;
}
