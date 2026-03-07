import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/auth.module.css";

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

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, kind: "ok", title: "", message: "" });

  const loginType = useMemo(() => {
    const raw = router.query?.type;
    return raw === "driver" ? "driver" : "office";
  }, [router.query]);

  const isDriver = loginType === "driver";

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      router.push("/app");
    } catch (err) {
      setToast({
        open: true,
        kind: "error",
        title: "Login failed",
        message: err?.message || "Please check your details and try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>{isDriver ? "Driver sign in • SkipLogic" : "Office sign in • SkipLogic"}</title>
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
              {isDriver ? (
                <>
                  <span className={styles.headerHint}>Office user?</span>
                  <Link className={styles.headerPill} href="/login?type=office">
                    Office login
                  </Link>
                </>
              ) : (
                <>
                  <span className={styles.headerHint}>New here?</span>
                  <Link className={styles.headerPill} href="/signup">
                    Create account
                  </Link>
                </>
              )}
            </div>
          </header>

          <main className={styles.main}>
            <section className={styles.left}>
              <span className="sl-chip">
                <span className="sl-chipDot" />
                {isDriver ? "Driver access" : "Secure sign-in"}
              </span>

              <h1 className={styles.h1}>{isDriver ? "Driver sign in." : "Welcome back."}</h1>

              <p className={styles.p}>
                {isDriver
                  ? "Sign in to view your runs, update job status and keep the office informed."
                  : "Sign in to manage jobs, scheduling, drivers, billing and compliance."}
              </p>

              <div className={styles.featurePanel}>
                <div className={styles.featureTop}>
                  <div className={styles.featureTitle}>{isDriver ? "For drivers" : "Quick tips"}</div>
                  <span className="sl-chip">
                    <span className="sl-chipDot" />
                    Ops-first
                  </span>
                </div>

                <div className={styles.featureBody}>
                  <div className={styles.row}>
                    <div className={styles.iconBox}>{isDriver ? "🚚" : "⚡"}</div>
                    <div>
                      <div className={styles.rowTitle}>{isDriver ? "Daily runs" : "Fast navigation"}</div>
                      <div className={styles.rowSub}>
                        {isDriver
                          ? "Check your assigned jobs and work through the day clearly."
                          : "Use the left sidebar inside the app."}
                      </div>
                    </div>
                  </div>

                  <div className={styles.row}>
                    <div className={styles.iconBox}>{isDriver ? "📍" : "🔔"}</div>
                    <div>
                      <div className={styles.rowTitle}>{isDriver ? "Status updates" : "Notifications"}</div>
                      <div className={styles.rowSub}>
                        {isDriver
                          ? "Keep collections, deliveries and timing updates moving."
                          : "Timing messages and alerts keep you ahead."}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.smallPrint}>
                <span className={styles.dot} />
                {isDriver
                  ? "Your office must set your account up before you can sign in."
                  : "If you’ve just signed up, check your email to confirm first."}
              </div>
            </section>

            <section className={styles.right}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.eyebrow}>{isDriver ? "Driver sign in" : "Office sign in"}</div>
                  <h2 className={styles.h2}>{isDriver ? "Access your driver account" : "Access your workspace"}</h2>
                  <p className={styles.sub}>
                    {isDriver
                      ? "Use the email and password the office created for you."
                      : "Use the email and password you registered with."}
                  </p>
                </div>

                <form className={styles.form} onSubmit={onSubmit}>
                  <label className={styles.label}>
                    Email
                    <input
                      className="sl-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={isDriver ? "driver@company.co.uk" : "you@company.co.uk"}
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
                      placeholder="Your password"
                      autoComplete="current-password"
                      type="password"
                    />
                  </label>

                  <button className="sl-btn sl-btnPrimary" type="submit" disabled={loading}>
                    {loading ? "Signing in…" : isDriver ? "Sign in as driver" : "Sign in"}
                  </button>

                  <div className={styles.helpRow}>
                    {isDriver ? (
                      <>
                        <Link href="/login?type=office" className="sl-link">
                          Office login
                        </Link>
                        <span>•</span>
                        <Link href="/forgot-password" className="sl-link">
                          Forgot password
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link href="/signup" className="sl-link">
                          Create an account
                        </Link>
                        <span>•</span>
                        <Link href="/forgot-password" className="sl-link">
                          Forgot password
                        </Link>
                      </>
                    )}
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
