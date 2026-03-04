// pages/signup.js
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import styles from "../styles/signup.module.css";

function Toast({ open, kind = "info", title, message, onClose }) {
  if (!open) return null;

  const klass =
    kind === "error"
      ? styles.toastError
      : kind === "success"
      ? styles.toastSuccess
      : styles.toastInfo;

  return (
    <div className={`${styles.toast} ${klass}`} role="status" aria-live="polite">
      <div className={styles.toastHeader}>
        <div className={styles.toastTitle}>{title}</div>
        <button className={styles.toastClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className={styles.toastMsg}>{message}</div>
    </div>
  );
}

function isEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function SignupPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState({
    open: false,
    kind: "info",
    title: "",
    message: "",
  });

  function showToast(kind, title, message) {
    setToast({ open: true, kind, title, message });
  }

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
      // Create auth user
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

      // Many setups send a confirmation email; if yours auto-signs in, you can route immediately.
      // We'll be friendly either way:
      showToast(
        "success",
        "Check your email",
        "We’ve sent a confirmation link. Once verified, you can sign in and start your trial."
      );

      // If session exists (email confirmation disabled), route into app
      if (data?.session) {
        router.push("/app");
      }
    } catch (err) {
      const msg =
        err?.message ||
        "Something went wrong creating your account. Please try again.";
      showToast("error", "Signup failed", msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Close toast when route changes
    const handle = () => setToast((t) => ({ ...t, open: false }));
    router.events?.on("routeChangeStart", handle);
    return () => router.events?.off("routeChangeStart", handle);
  }, [router.events]);

  return (
    <>
      <Head>
        <title>Sign up • SkipLogic</title>
        <meta
          name="description"
          content="Create your SkipLogic account and start your trial."
        />
      </Head>

      <div className={styles.page}>
        <div className={styles.bg} aria-hidden="true" />
        <div className={styles.shell}>
          <header className={styles.header}>
            <Link href="/" className={styles.brand} aria-label="SkipLogic home">
              <span className={styles.brandMark}>
                <Image
                  src="/brand/logo.svg"
                  alt="SkipLogic"
                  width={140}
                  height={32}
                  priority
                />
              </span>
            </Link>

            <div className={styles.headerRight}>
              <span className={styles.headerHint}>Already have an account?</span>
              <Link className={styles.headerLink} href="/login">
                Sign in
              </Link>
            </div>
          </header>

          <main className={styles.main}>
            <section className={styles.left}>
              <div className={styles.hero}>
                <h1 className={styles.h1}>Run your skip business like a system.</h1>
                <p className={styles.p}>
                  Bookings, scheduling, drivers, compliance and billing — in one place.
                </p>

                <ul className={styles.bullets}>
                  <li>
                    <span className={styles.bulletDot} />
                    Card up front + trial-ready subscriptions
                  </li>
                  <li>
                    <span className={styles.bulletDot} />
                    Multi-tenant setup for growing operators
                  </li>
                  <li>
                    <span className={styles.bulletDot} />
                    Add-ons like Xero, vehicle checks, monitoring
                  </li>
                </ul>

                <div className={styles.previewCard}>
                  <div className={styles.previewTop}>
                    <div className={styles.previewTitle}>What you’ll get</div>
                    <div className={styles.previewPill}>New</div>
                  </div>

                  <div className={styles.previewBody}>
                    <div className={styles.previewRow}>
                      <div className={styles.previewIcon}>📅</div>
                      <div>
                        <div className={styles.previewLabel}>Scheduler</div>
                        <div className={styles.previewSub}>
                          Plan deliveries/collections with real timings
                        </div>
                      </div>
                    </div>

                    <div className={styles.previewRow}>
                      <div className={styles.previewIcon}>🚚</div>
                      <div>
                        <div className={styles.previewLabel}>Driver tools</div>
                        <div className={styles.previewSub}>
                          Runs, checks, and customer updates
                        </div>
                      </div>
                    </div>

                    <div className={styles.previewRow}>
                      <div className={styles.previewIcon}>💷</div>
                      <div>
                        <div className={styles.previewLabel}>Billing</div>
                        <div className={styles.previewSub}>
                          Stripe plans + optional Xero integration
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Optional: add your screenshot */}
                  {/* <div className={styles.screenshotWrap}>
                    <Image
                      src="/brand/screenshot-dashboard.png"
                      alt="SkipLogic dashboard screenshot"
                      width={980}
                      height={560}
                    />
                  </div> */}
                </div>

                <div className={styles.trustRow}>
                  <div className={styles.trustItem}>🔒 Secure sign-in</div>
                  <div className={styles.trustItem}>🇬🇧 Built in the UK</div>
                  <div className={styles.trustItem}>⚡ Fast setup</div>
                </div>
              </div>
            </section>

            <section className={styles.right}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardEyebrow}>Start your trial</div>
                  <h2 className={styles.h2}>Create your account</h2>
                  <p className={styles.cardSub}>
                    Takes about 60 seconds. You can set your plan after sign up.
                  </p>
                </div>

                <form onSubmit={onSubmit} className={styles.form}>
                  <label className={styles.label}>
                    Company name
                    <input
                      className={styles.input}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Cox Skips"
                      autoComplete="organization"
                    />
                  </label>

                  <label className={styles.label}>
                    Your name
                    <input
                      className={styles.input}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Owain Thomas"
                      autoComplete="name"
                    />
                  </label>

                  <label className={styles.label}>
                    Email
                    <input
                      className={styles.input}
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
                      className={styles.input}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      type="password"
                    />
                  </label>

                  <button
                    type="submit"
                    className={styles.button}
                    disabled={!canSubmit || loading}
                  >
                    {loading ? "Creating account…" : "Create account"}
                  </button>

                  <p className={styles.terms}>
                    By continuing you agree to the{" "}
                    <Link href="/terms" className={styles.inlineLink}>
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className={styles.inlineLink}>
                      Privacy Policy
                    </Link>
                    .
                  </p>

                  <div className={styles.helpRow}>
                    <span className={styles.helpText}>Need help?</span>
                    <a className={styles.inlineLink} href="mailto:support@skip-logic.app">
                      Email support
                    </a>
                  </div>
                </form>
              </div>

              <div className={styles.smallPrint}>
                <span className={styles.smallDot} />
                No phone calls. No nonsense. Cancel anytime.
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
