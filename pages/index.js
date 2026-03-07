import Head from "next/head";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <Head>
        <title>SkipLogic • Skip hire software built for operators</title>
      </Head>

      <main style={styles.page}>
        <div style={styles.bgGlowA} aria-hidden="true" />
        <div style={styles.bgGlowB} aria-hidden="true" />

        <header style={styles.header}>
          <Link href="/" style={styles.brandLink}>
            <div style={styles.brandMark}>SL</div>
            <div>
              <div style={styles.brandName}>SkipLogic</div>
              <div style={styles.brandTag}>Operations platform for skip hire</div>
            </div>
          </Link>

          <div style={styles.headerLinks}>
            <Link href="/pricing" style={styles.headerTextLink}>
              Pricing
            </Link>

            <Link href="/login?type=office" style={styles.headerTextLink}>
              Office login
            </Link>

            <Link href="/login?type=driver" style={styles.headerTextLink}>
              Driver sign in
            </Link>

            <Link href="/signup" style={styles.headerButtonLink}>
              <button style={styles.primaryButton}>Start free trial</button>
            </Link>
          </div>
        </header>

        <section style={styles.heroWrap}>
          <div style={styles.heroLeft}>
            <div style={styles.chip}>
              <span style={styles.chipDot} />
              Built for real skip operators
            </div>

            <h1 style={styles.h1}>
              Skip hire software that understands the yard{" "}
              <span style={styles.emoji}>🚛</span>
            </h1>

            <p style={styles.heroText}>
              Book jobs, run the scheduler, manage drivers, track customers,
              handle invoicing and keep compliance under control — all in one
              system designed around the way skip businesses actually work.
            </p>

            <div style={styles.ctaRow}>
              <Link href="/signup" style={styles.headerButtonLink}>
                <button style={styles.heroPrimaryButton}>Start 30-day free trial</button>
              </Link>

              <Link href="/login?type=office" style={styles.headerButtonLink}>
                <button style={styles.heroSecondaryButton}>Office login</button>
              </Link>

              <Link href="/login?type=driver" style={styles.headerButtonLink}>
                <button style={styles.heroGhostButton}>Driver sign in</button>
              </Link>
            </div>

            <div style={styles.smallPrint}>
              30-day free trial • card required • built for independent operators
            </div>
          </div>

          <div style={styles.heroRight}>
            <div style={styles.previewCard}>
              <div style={styles.previewTop}>
                <div>
                  <div style={styles.previewEyebrow}>Today in SkipLogic</div>
                  <div style={styles.previewTitle}>Keep the whole day moving</div>
                </div>
                <div style={styles.previewBadge}>Live ops</div>
              </div>

              <div style={styles.previewList}>
                <div style={styles.previewItem}>
                  <div style={styles.previewIcon}>📅</div>
                  <div>
                    <div style={styles.previewItemTitle}>Bookings & scheduler</div>
                    <div style={styles.previewItemText}>
                      Plan deliveries, collections and exchanges without losing
                      the plot.
                    </div>
                  </div>
                </div>

                <div style={styles.previewItem}>
                  <div style={styles.previewIcon}>👷</div>
                  <div>
                    <div style={styles.previewItemTitle}>Office & drivers</div>
                    <div style={styles.previewItemText}>
                      Give office staff control and drivers a simple workflow in
                      the field.
                    </div>
                  </div>
                </div>

                <div style={styles.previewItem}>
                  <div style={styles.previewIcon}>💷</div>
                  <div>
                    <div style={styles.previewItemTitle}>Pricing & invoicing</div>
                    <div style={styles.previewItemText}>
                      Keep pricing tidy, account customers organised and finance
                      flowing properly.
                    </div>
                  </div>
                </div>

                <div style={styles.previewItem}>
                  <div style={styles.previewIcon}>✅</div>
                  <div>
                    <div style={styles.previewItemTitle}>Compliance</div>
                    <div style={styles.previewItemText}>
                      Stay on top of the jobs, the fleet and the admin that
                      keeps the business safe.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHead}>
            <div style={styles.sectionEyebrow}>What SkipLogic helps with</div>
            <h2 style={styles.h2}>Built around day-to-day skip yard reality</h2>
            <p style={styles.sectionText}>
              The aim is simple: less friction, fewer missed details, clearer
              control.
            </p>
          </div>

          <div style={styles.featureGrid}>
            {[
              {
                title: "Jobs & Scheduler",
                text: "Book work quickly, organise the day and keep collections and deliveries under control.",
                icon: "📍",
              },
              {
                title: "Customers & Pricing",
                text: "Keep customer records clean, handle account customers and apply sensible pricing logic.",
                icon: "📒",
              },
              {
                title: "Driver Workflow",
                text: "Let drivers view runs, update job status and keep the office informed as the day unfolds.",
                icon: "🚚",
              },
              {
                title: "Finance & Compliance",
                text: "Support invoicing, reporting and the practical compliance tasks operators have to stay on top of.",
                icon: "🧾",
              },
            ].map((item) => (
              <div key={item.title} style={styles.featureCard}>
                <div style={styles.featureIcon}>{item.icon}</div>
                <div style={styles.featureTitle}>{item.title}</div>
                <div style={styles.featureText}>{item.text}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHead}>
            <div style={styles.sectionEyebrow}>How it works</div>
            <h2 style={styles.h2}>From sign-up to running jobs</h2>
          </div>

          <div style={styles.howGrid}>
            {[
              {
                step: "01",
                title: "Create your account",
                text: "Start your trial and set up your office workspace.",
              },
              {
                step: "02",
                title: "Add your team",
                text: "Create office users and add drivers from inside the system.",
              },
              {
                step: "03",
                title: "Start booking jobs",
                text: "Build the day, manage customers and keep the scheduler moving.",
              },
              {
                step: "04",
                title: "Run the operation",
                text: "Drivers update work on the go while the office stays in control.",
              },
            ].map((item) => (
              <div key={item.step} style={styles.howCard}>
                <div style={styles.stepBadge}>{item.step}</div>
                <div style={styles.howTitle}>{item.title}</div>
                <div style={styles.howText}>{item.text}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.ctaPanel}>
            <div>
              <div style={styles.sectionEyebrow}>Ready to get started?</div>
              <h2 style={{ ...styles.h2, marginBottom: 8 }}>
                One system for office users and drivers
              </h2>
              <p style={{ ...styles.sectionText, margin: 0 }}>
                Clean sign-in, proper workflows and a platform built for the
                way skip operators actually work.
              </p>
            </div>

            <div style={styles.bottomCtas}>
              <Link href="/signup" style={styles.headerButtonLink}>
                <button style={styles.primaryButtonLarge}>Create account</button>
              </Link>

              <Link href="/login?type=office" style={styles.headerButtonLink}>
                <button style={styles.secondaryButtonLarge}>Office login</button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    background: "#f6fbff",
    color: "#0f172a",
    position: "relative",
    overflow: "hidden",
  },

  bgGlowA: {
    position: "absolute",
    top: -120,
    left: -120,
    width: 420,
    height: 420,
    borderRadius: "50%",
    background: "rgba(58,181,255,0.10)",
    filter: "blur(80px)",
    pointerEvents: "none",
  },

  bgGlowB: {
    position: "absolute",
    top: 80,
    right: -120,
    width: 420,
    height: 420,
    borderRadius: "50%",
    background: "rgba(55,245,155,0.10)",
    filter: "blur(90px)",
    pointerEvents: "none",
  },

  header: {
    position: "relative",
    zIndex: 2,
    maxWidth: 1180,
    margin: "0 auto",
    padding: "22px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },

  brandLink: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    textDecoration: "none",
    color: "#0f172a",
  },

  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 14,
    background: "linear-gradient(135deg, #37f59b, #3ab5ff)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#08111f",
    fontWeight: 900,
    fontSize: 13,
    boxShadow: "0 10px 30px rgba(58,181,255,0.18)",
  },

  brandName: {
    fontWeight: 900,
    fontSize: 18,
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
  },

  brandTag: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },

  headerLinks: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  },

  headerTextLink: {
    color: "#334155",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 700,
  },

  headerButtonLink: {
    textDecoration: "none",
  },

  primaryButton: {
    background: "linear-gradient(135deg, #37f59b, #3ab5ff)",
    color: "#08111f",
    border: "none",
    padding: "11px 16px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 12px 30px rgba(58,181,255,0.16)",
  },

  heroWrap: {
    position: "relative",
    zIndex: 2,
    maxWidth: 1180,
    margin: "10px auto 0",
    padding: "50px 20px 30px",
    display: "grid",
    gridTemplateColumns: "1.2fr 0.9fr",
    gap: 28,
    alignItems: "center",
  },

  heroLeft: {
    minWidth: 0,
  },

  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(58,181,255,0.16)",
    background: "#ffffff",
    fontSize: 12,
    fontWeight: 800,
    color: "#2563eb",
    marginBottom: 18,
    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
  },

  chipDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#37f59b",
    boxShadow: "0 0 12px rgba(55,245,155,0.5)",
  },

  h1: {
    margin: 0,
    fontSize: 56,
    lineHeight: 1.02,
    letterSpacing: "-0.045em",
    fontWeight: 950,
    color: "#0f172a",
    maxWidth: 720,
  },

  emoji: {
    display: "inline-block",
    transform: "translateY(-2px)",
  },

  heroText: {
    marginTop: 18,
    fontSize: 20,
    lineHeight: 1.65,
    color: "#475569",
    maxWidth: 760,
  },

  ctaRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 28,
  },

  heroPrimaryButton: {
    background: "linear-gradient(135deg, #37f59b, #3ab5ff)",
    color: "#08111f",
    border: "none",
    padding: "14px 22px",
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 16px 38px rgba(58,181,255,0.18)",
  },

  heroSecondaryButton: {
    background: "#ffffff",
    color: "#0f172a",
    border: "1px solid #dbe8f4",
    padding: "14px 22px",
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
  },

  heroGhostButton: {
    background: "transparent",
    color: "#2563eb",
    border: "1px solid rgba(58,181,255,0.24)",
    padding: "14px 22px",
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
  },

  smallPrint: {
    marginTop: 14,
    color: "#64748b",
    fontSize: 13,
    fontWeight: 600,
  },

  heroRight: {
    minWidth: 0,
  },

  previewCard: {
    background: "rgba(255,255,255,0.82)",
    border: "1px solid #dbe8f4",
    borderRadius: 24,
    padding: 22,
    boxShadow: "0 20px 50px rgba(15,23,42,0.08)",
    backdropFilter: "blur(12px)",
  },

  previewTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },

  previewEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#64748b",
    fontWeight: 800,
    marginBottom: 6,
  },

  previewTitle: {
    fontWeight: 900,
    fontSize: 22,
    letterSpacing: "-0.03em",
    color: "#0f172a",
  },

  previewBadge: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "rgba(55,245,155,0.14)",
    border: "1px solid rgba(55,245,155,0.24)",
    color: "#0f766e",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  previewList: {
    display: "grid",
    gap: 12,
  },

  previewItem: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 18,
    background: "#f8fbff",
    border: "1px solid #e5eef7",
  },

  previewIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(55,245,155,0.16), rgba(58,181,255,0.16))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    flex: "0 0 auto",
  },

  previewItemTitle: {
    fontWeight: 850,
    fontSize: 15,
    color: "#0f172a",
    marginBottom: 4,
  },

  previewItemText: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "#475569",
  },

  section: {
    position: "relative",
    zIndex: 2,
    maxWidth: 1180,
    margin: "0 auto",
    padding: "34px 20px 28px",
  },

  sectionHead: {
    maxWidth: 760,
    marginBottom: 20,
  },

  sectionEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#2563eb",
    fontWeight: 900,
    marginBottom: 8,
  },

  h2: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.05,
    letterSpacing: "-0.04em",
    fontWeight: 950,
    color: "#0f172a",
  },

  sectionText: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 1.65,
    color: "#475569",
  },

  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  },

  featureCard: {
    background: "#ffffff",
    border: "1px solid #dbe8f4",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 14px 36px rgba(15,23,42,0.05)",
  },

  featureIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, rgba(55,245,155,0.16), rgba(58,181,255,0.16))",
    fontSize: 22,
    marginBottom: 14,
  },

  featureTitle: {
    fontWeight: 900,
    fontSize: 18,
    color: "#0f172a",
    marginBottom: 8,
    letterSpacing: "-0.02em",
  },

  featureText: {
    color: "#475569",
    lineHeight: 1.65,
    fontSize: 14,
  },

  howGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },

  howCard: {
    background: "#ffffff",
    border: "1px solid #dbe8f4",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 14px 36px rgba(15,23,42,0.05)",
  },

  stepBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 42,
    height: 30,
    padding: "0 10px",
    borderRadius: 999,
    background: "rgba(58,181,255,0.10)",
    border: "1px solid rgba(58,181,255,0.18)",
    color: "#2563eb",
    fontWeight: 900,
    fontSize: 12,
    marginBottom: 14,
  },

  howTitle: {
    fontWeight: 900,
    fontSize: 18,
    color: "#0f172a",
    marginBottom: 8,
    letterSpacing: "-0.02em",
  },

  howText: {
    color: "#475569",
    lineHeight: 1.65,
    fontSize: 14,
  },

  ctaPanel: {
    background: "linear-gradient(135deg, rgba(58,181,255,0.08), rgba(55,245,155,0.07))",
    border: "1px solid #dbe8f4",
    borderRadius: 28,
    padding: 26,
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "center",
    flexWrap: "wrap",
    boxShadow: "0 18px 40px rgba(15,23,42,0.06)",
  },

  bottomCtas: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },

  primaryButtonLarge: {
    background: "linear-gradient(135deg, #37f59b, #3ab5ff)",
    color: "#08111f",
    border: "none",
    padding: "14px 22px",
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 900,
    cursor: "pointer",
  },

  secondaryButtonLarge: {
    background: "#ffffff",
    color: "#0f172a",
    border: "1px solid #dbe8f4",
    padding: "14px 22px",
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 900,
    cursor: "pointer",
  },
};
