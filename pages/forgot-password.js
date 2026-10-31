import { useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const redirectTo = window.location.origin + "/reset-password";
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (authError) throw authError;
      setMessage("If an account exists for this email, a password reset link will arrive shortly. Check spam too.");
    } catch (err) { setError(err.message || "Could not request password reset"); }
    finally { setBusy(false); }
  }
  return <main style={{maxWidth:440,margin:"70px auto",padding:24,fontFamily:"Arial,sans-serif"}}>
    <h1>Reset your SkipLogic password</h1>
    <p>Enter the email address you registered with.</p>
    <form onSubmit={submit}>
      <label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}
        style={{display:"block",width:"100%",padding:12,margin:"10px 0 18px",boxSizing:"border-box"}} /></label>
      <button disabled={busy} type="submit" style={{padding:"12px 18px"}}>{busy?"Sending…":"Send reset link"}</button>
    </form>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" style={{color:"crimson"}}>{error}</p>}
    <p><Link href="/login">Back to sign in</Link></p>
  </main>;
}
