import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useEffect,useState } from "react";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/auth.module.css";

export default function ResetPassword(){
 const [ready,setReady]=useState(false),[password,setPassword]=useState(""),[confirm,setConfirm]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{
   let mounted=true;
   supabase.auth.getSession().then(({data})=>{if(mounted)setReady(Boolean(data?.session));});
   const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{if(mounted)setReady(Boolean(session));});
   return ()=>{mounted=false;listener.subscription.unsubscribe();};
 },[]);
 async function submit(e){
   e.preventDefault();setBusy(true);setError("");
   try {
     if(!ready)throw new Error("This link has expired. Request another reset email.");
     if(password.length<8)throw new Error("Password must contain at least 8 characters.");
     if(password!==confirm)throw new Error("Passwords do not match.");
     const {error:err}=await supabase.auth.updateUser({password});if(err)throw err;
     await supabase.auth.signOut();setReady(false);setMessage("Your password has been changed. You can now sign in.");
   }catch(err){setError(err.message||"Unable to reset password");}
   finally{setBusy(false);}
 }
 return <><Head><title>New password • SkipLogic</title></Head>
 <div className={styles.page}><div className={styles.bg}/><div className={styles.grid}/>
 <div className={styles.shell}><header className={styles.header}>
 <Link href="/" className={styles.brand}><Image src="/brand/icon.svg" alt="SkipLogic" width={34} height={34}/>
 <span className={styles.brandText}><span className={styles.brandName}>SkipLogic</span><span className={styles.brandTag}>Operations platform for skip hire</span></span></Link>
 <Link href="/login" className={styles.headerPill}>Sign in</Link></header>
 <main style={{maxWidth:480,margin:"55px auto"}}><div className={styles.card}>
 <div className={styles.cardHeader}><div className={styles.eyebrow}>Account recovery</div><h1 className={styles.h2}>Choose a new password</h1>
 <p className={styles.sub}>Secure your SkipLogic account with a new password.</p></div>
 <div className={styles.form}>
 {message?<p role="status">{message}</p>:ready?
 <form onSubmit={submit} style={{display:"grid",gap:14}}>
 <label className={styles.label}>New password<input className="sl-input" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label className={styles.label}>Confirm password<input className="sl-input" type="password" minLength={8} required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
 <button className="sl-btn sl-btnPrimary" type="submit" disabled={busy}>{busy?"Saving…":"Save new password"}</button></form>
 :<p>Checking your reset link. If it has expired, request a new one below.</p>}
 {error&&<p role="alert" style={{color:"#b42318"}}>{error}</p>}
 <div className={styles.helpRow}><Link href="/login" className="sl-link">Back to sign in</Link><span>•</span><Link href="/forgot-password" className="sl-link">Request new link</Link></div>
 </div></div></main></div></div></>;
}