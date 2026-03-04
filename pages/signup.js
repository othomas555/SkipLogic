// pages/signup.js
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/auth.module.css";

function isEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function Toast({ open, kind, title, message, onClose }) {
  if (!open) return null;
  const klass = kind === "error" ? styles.toastErr : styles.toastOk;

  return (
    <div className={`${styles.toast} ${klass}`} role="status" aria-live="polite">
      <div className={styles.toastHead}>
        <div className={styles.toastTitle}>{title}</div>
        <button className={styles.toastClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className={styles.toastMsg}>{message}</div>
    </div>
  );
}

export default function Signup() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, kind: "ok", title: "", message: "" });

  const canSubmit = useMemo(() => {
    if (!companyName.trim()) return false;
    if (!fullName.trim()) return false;
    if (!isEmail(email)) return false;
    if ((password || "").length < 8) return false;
    return true;
  }, [companyName, fullName, email, password]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            company_name: companyName.trim(),
          },
        },
      });

      if (error) throw error;

      // If confirmation email is required
      setToast({
        open: true,
        kind: "ok",
        title: "Account created",
        message:
          "Check your email for the confirmation link. Once verified, sign in and start your trial.",
      });

      // If your Supabase project auto-signs in on signup, session exists:
      if (data?.session) router.push("/app");
    } catch (err) {
      setToast({
        open: true,
        kind: "error",
        title: "Signup failed",
        message: err?.message || "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Sign up • SkipLogic</title>
        <meta name="description" content="Create your SkipLogic account and start your trial." />
      </Head>

      <div className={styles.page}>
        <div className={styles.bg} aria-hidden="true" />
        <div className={styles.grid} aria-hidden="true" />

        <div className={styles.shell}>
          <header className={styles.header}>
            <Link href="/" className={styles.brand} aria-label="SkipLogic home">
              <Image src="/brand/icon.svg" alt="SkipLogic" width={34} height={34} />
              <span className={styles.brandText}>
                <span className={styles.brandName}>SkipLogic</span>
                <span className={styles.brandTag}>Operations platform for skip hire</span>
              </span>
            </Link>

            <div className={styles.headerRight}>
              <span className={styles.headerHint}>Already have an account?</span>
              <Link className={styles.headerPill} href="/login">
                Sign in
              </Link>
            </div>
          </header>

          <main className={styles.main}>
            <section className={styles.left}>
              <span className="sl-chip">
                <span className="sl-chipDot" />
                Hybrid UI • light auth, dark app
              </span>

              <h1 className={styles.h1}>Setup in minutes. Run the yard on rails.</h1>
              <p className={styles.p}>
                SkipLogic keeps bookings, scheduling, drivers, compliance and billing aligned —
                without you living in spreadsheets.
              </p>

              <div className={styles.featurePanel}>
                <div className={styles.featureTop}>
                  <div className={styles.featureTitle}>What you’ll get</div>
                  <span className="sl-chip">
                    <span className="sl-chipDot" />
                    Trial-ready
                  </span>
                </div>

                <div className={styles.featureBody}>
                  <div className={styles.row}>
                    <div className={styles.iconBox}>📅</div>
                    <div>
                      <div className={styles.rowTitle}>Scheduler</div>
                      <div className={styles.rowSub}>Plan delivery/collections with clearer runs.</div>
                    </div>
                  </div>

                  <div className={styles.row}>
                    <div className={styles.iconBox}>🚚</div>
                    <div>
                      <div className={styles.rowTitle}>Driver tools</div>
                      <div className={styles.rowSub}>Runs, checks, and customer timing messages.</div>
                    </div>
                  </div>

                  <div className={styles.row}>
                    <div className={styles.iconBox}>💷</div>
                    <div>
                      <div className={styles.rowTitle}>Billing & add-ons</div>
                      <div className={styles.rowSub}>
                        Stripe tiers plus extras like Xero, vehicle monitoring, compliance.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.smallPrint}>
                <span className={styles.dot} />
                UK-built. Fast setup. Cancel anytime.
              </div>
            </section>

            <section className={styles.right}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.eyebrow}>Start your trial</div>
                  <h2 className={styles.h2}>Create your account</h2>
                  <p className={styles.sub}>You can choose Light/Pro and add-ons after sign up.</p>
                </div>

                <form className={styles.form} onSubmit={onSubmit}>
                  <label className={styles.label}>
                    Company name
                    <input
                      className="sl-input"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Cox Skips"
                      autoComplete="organization"
                    />
                  </label>

                  <label className={styles.label}>
                    Your name
                    <input
                      className="sl-input"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Owain Thomas"
                      autoComplete="name"
                    />
                  </label>

                  <label className={styles.label}>
                    Email
                    <input
                      className="sl-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.co.uk"
                      autoComplete="email"
                      inputMode="email"
                    />
                  </label>

                  <label className={styles.label}>
                    Password
                    <input
                      className="sl-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      type="password"
                    />
                  </label>

                  <button className="sl-btn sl-btnPrimary" type="submit" disabled={!canSubmit || loading}>
                    {loading ? "Creating account…" : "Create account"}
                  </button>

                  <div className={styles.helpRow}>
                    <span>By continuing you agree to the</span>
                    <Link href="/terms" className="sl-link">Terms</Link>
                    <span>and</span>
                    <Link href="/privacy" className="sl-link">Privacy</Link>.
                  </div>
                </form>
              </div>
            </section>
          </main>
        </div>

        <Toast
          open={toast.open}
          kind={toast.kind}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        />
      </div>
    </>
  );
}
