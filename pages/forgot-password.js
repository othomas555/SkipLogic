import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/auth.module.css";

export default function ForgotPassword() {
  const [email,setEmail]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  async function submit(e) {
    e.preventDefault();setBusy(true);setMessage("");setError("");
    try {
      const {error:err}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:"https://skip-logic.app/reset-password"});
      if(err) throw err;
      setMessage("If an account exists for this email, you'll receive a reset link shortly. Check your spam folder too.");
    } catch(err) {setError(err.message||"Unable to send reset email");}
    finally {setBusy(false);}
  }
  return <><Head><title>Forgot password • SkipLogic</title></Head>
    <div className={styles.page}><div className={styles.bg}/><div className={styles.grid}/>
    <div className={styles.shell}><header className={styles.header}>
      <Link href="/" className={styles.brand}><Image src="/brand/icon.svg" alt="SkipLogic" width={34} height={34}/>
      <span className={styles.brandText}><span className={styles.brandName}>SkipLogic</span><span className={styles.brandTag}>Operations platform for skip hire</span></span></Link>
      <Link href="/login" className={styles.headerPill}>Sign in</Link></header>
      <main style={{maxWidth:480,margin:"55px auto"}}><div className={styles.card}>
      <div className={styles.cardHeader}><div className={styles.eyebrow}>Account recovery</div>
      <h1 className={styles.h2}>Reset your password</h1>
      <p className={styles.sub}>Enter the email address you registered with. We'll send you a secure link.</p></div>
      <form className={styles.form} onSubmit={submit}><label className={styles.label}>Email address
      <input className="sl-input" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <button className="sl-btn sl-btnPrimary" disabled={busy} type="submit">{busy?"Sending…":"Send reset link"}</button>
      {message&&<p role="status">{message}</p>}{error&&<p role="alert" style={{color:"#b42318"}}>{error}</p>}
      <div className={styles.helpRow}><Link href="/login" className="sl-link">Back to sign in</Link></div></form></div></main>
    </div></div></>;
}