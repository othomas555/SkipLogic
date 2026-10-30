import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (active) setReady(Boolean(data?.session));
    }
    check();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setReady(Boolean(session));
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (!ready) throw new Error("Reset link is invalid or expired. Request a new link.");
      if (password.length < 8) throw new Error("Use at least 8 characters.");
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      setMessage("Password updated. You can now sign in.");
      await supabase.auth.signOut();
    } catch (err) { setError(err.message || "Password reset failed"); }
    finally { setBusy(false); }
  }
  return <main style={{maxWidth:440,margin:"70px auto",padding:24,fontFamily:"Arial,sans-serif"}}>
    <h1>Choose a new password</h1>
    {!ready && <p>Checking reset link… If this does not change, request a new link.</p>}
    {ready && !message && <form onSubmit={submit}>
      <label>New password<input type="password" autoComplete="new-password" minLength={8} required
        value={password} onChange={e=>setPassword(e.target.value)}
        style={{display:"block",width:"100%",padding:12,margin:"10px 0 18px",boxSizing:"border-box"}} /></label>
      <button disabled={busy} type="submit" style={{padding:"12px 18px"}}>{busy?"Updating…":"Update password"}</button>
    </form>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" style={{color:"crimson"}}>{error}</p>}
    <p><Link href="/login">Back to sign in</Link> · <Link href="/forgot-password">Request another reset link</Link></p>
  </main>;
}
