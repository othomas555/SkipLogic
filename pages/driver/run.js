import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

function todayYMDLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addrLine(job) {
  const xs = [job?.site_address_line1, job?.site_address_line2, job?.site_town].filter(Boolean);
  return xs.join(", ");
}

function niceTypeLabel(item) {
  if (item?.type === "yard_break") return "Return to yard";
  if (item?.type === "driver_break") return "Driver break";
  if (item?.type === "job") return "Job";
  return "Run item";
}

function IconTruck() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvg} aria-hidden="true">
      <path
        d="M3 7h11v8H3zM14 10h3l3 3v2h-6zM7 18a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm10 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvgSm} aria-hidden="true">
      <path
        d="M20 11a8 8 0 1 1-2.34-5.66M20 4v6h-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvgSm} aria-hidden="true">
      <path
        d="M3 11.5 12 4l9 7.5M5 10v10h14V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvgSm} aria-hidden="true">
      <path
        d="M15 16l4-4-4-4M19 12H9M12 19H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DriverRunPage() {
  const router = useRouter();
  const runDate = useMemo(() => todayYMDLocal(), []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [signedIn, setSignedIn] = useState(true);
  const [driver, setDriver] = useState(null);
  const [run, setRun] = useState(null);
  const [jobsById, setJobsById] = useState({});

  const items = useMemo(() => {
    const raw = run?.items;
    return Array.isArray(raw) ? raw : [];
  }, [run]);

  const totalJobs = useMemo(() => items.filter((x) => x?.type === "job").length, [items]);
  const yardReturns = useMemo(() => items.filter((x) => x?.type === "yard_break").length, [items]);

  async function loadRun({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/driver/run?date=${encodeURIComponent(runDate)}`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401 || data?.signed_in === false) {
        setSignedIn(false);
        setDriver(null);
        setRun(null);
        setJobsById({});
        return;
      }

      setSignedIn(true);

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Could not load run.");
      }

      setDriver(data?.driver || null);
      setRun(data?.run || null);
      setJobsById(data?.jobs || {});
    } catch (e) {
      console.error(e);
      setErrorMsg(e?.message || String(e));
      setDriver(null);
      setRun(null);
      setJobsById({});
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadRun({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runDate]);

  useEffect(() => {
    const t = setInterval(() => loadRun({ silent: true }), 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runDate]);

  async function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    await loadRun({ silent: true });
    setRefreshing(false);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await fetch("/api/driver/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // ignore
    } finally {
      router.push("/login?type=driver");
    }
  }

  if (!signedIn) {
    return (
      <main style={styles.page}>
        <div style={styles.centerCard}>
          <div style={styles.signOutBadge}>Driver sign-in required</div>
          <h1 style={styles.centerTitle}>You are not signed in.</h1>
          <p style={styles.centerText}>Please sign in again to view today’s work.</p>
          <Link href="/login?type=driver" style={styles.primaryLink}>
            Go to driver login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />

      <div style={styles.shell}>
        <section style={styles.hero}>
          <div style={styles.heroTopRow}>
            <div style={styles.brandWrap}>
              <div style={styles.brandBadge}>
                <IconTruck />
              </div>
              <div>
                <div style={styles.brandTitle}>Today’s work</div>
                <div style={styles.brandSub}>{runDate}</div>
              </div>
            </div>

            <div style={styles.actionRow}>
              <button onClick={refreshNow} style={styles.secondaryBtn} disabled={refreshing || loading}>
                <IconRefresh />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>

              <Link href="/driver/menu" style={styles.secondaryLinkBtn}>
                <IconHome />
                Menu
              </Link>

              <button onClick={logout} style={styles.secondaryBtn} disabled={loggingOut}>
                <IconLogout />
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          </div>

          <div style={styles.heroGrid}>
            <div style={styles.heroPanelMain}>
              <div style={styles.eyebrow}>Assigned driver</div>
              <div style={styles.driverName}>{driver?.name || "Loading driver…"}</div>
              <div style={styles.driverSub}>
                {driver?.email ? driver.email : "Your run is shown in the exact order set by the office."}
              </div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.statLabel}>Jobs</div>
              <div style={styles.statValue}>{totalJobs}</div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.statLabel}>Yard returns</div>
              <div style={styles.statValue}>{yardReturns}</div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.statLabel}>Run items</div>
              <div style={styles.statValue}>{items.length}</div>
            </div>
          </div>
        </section>

        {errorMsg ? <div style={styles.errBox}>{errorMsg}</div> : null}

        {loading ? (
          <div style={styles.infoCard}>Loading today’s run…</div>
        ) : !driver ? (
          <div style={styles.infoCard}>This login is not linked to an active driver.</div>
        ) : !run ? (
          <div style={styles.infoCard}>No run assigned for today.</div>
        ) : items.length === 0 ? (
          <div style={styles.infoCard}>Run is empty.</div>
        ) : (
          <section style={styles.listWrap}>
            {items.map((it, idx) => {
              const key = `${run.id}:${idx}`;

              if (!it || typeof it !== "object") {
                return (
                  <div key={key} style={styles.itemCard}>
                    <div style={styles.itemTop}>
                      <div style={styles.itemBadgeMuted}>Run item</div>
                      <div style={styles.itemIndex}>#{idx + 1}</div>
                    </div>
                    <div style={styles.itemTitle}>Invalid run item</div>
                  </div>
                );
              }

              if (it.type === "yard_break") {
                return (
                  <div key={key} style={styles.specialCard}>
                    <div style={styles.itemTop}>
                      <div style={styles.itemBadgeBlue}>Yard return</div>
                      <div style={styles.itemIndex}>#{idx + 1}</div>
                    </div>
                    <div style={styles.itemTitle}>Return to yard / tip return</div>
                    <div style={styles.itemSub}>
                      This appears in the run exactly where the office placed it.
                    </div>
                  </div>
                );
              }

              if (it.type === "driver_break") {
                return (
                  <div key={key} style={styles.specialCardAlt}>
                    <div style={styles.itemTop}>
                      <div style={styles.itemBadgeAmber}>Break</div>
                      <div style={styles.itemIndex}>#{idx + 1}</div>
                    </div>
                    <div style={styles.itemTitle}>Driver break</div>
                    <div style={styles.itemSub}>Scheduled pause in the run.</div>
                  </div>
                );
              }

              if (it.type === "job") {
                const job = it.job_id ? jobsById[it.job_id] : null;
                const notes = String(job?.notes || "").trim();

                return (
                  <div key={key} style={styles.itemCard}>
                    <div style={styles.itemTop}>
                      <div style={styles.itemBadgeGreen}>{niceTypeLabel(it)}</div>
                      <div style={styles.itemIndex}>#{idx + 1}</div>
                    </div>

                    <div style={styles.jobNumber}>{job?.job_number || "—"}</div>
                    <div style={styles.siteName}>{job?.site_name || "—"}</div>
                    <div style={styles.address}>{addrLine(job) || "No address provided"}</div>

                    <div style={styles.metaGrid}>
                      <div style={styles.metaBox}>
                        <div style={styles.metaLabel}>Postcode</div>
                        <div style={styles.metaValue}>{job?.site_postcode || "—"}</div>
                      </div>

                      <div style={styles.metaBox}>
                        <div style={styles.metaLabel}>Status</div>
                        <div style={styles.metaValue}>{job?.job_status || "—"}</div>
                      </div>

                      <div style={styles.metaBox}>
                        <div style={styles.metaLabel}>Payment</div>
                        <div style={styles.metaValue}>{job?.payment_type || "—"}</div>
                      </div>

                      <div style={styles.metaBox}>
                        <div style={styles.metaLabel}>Skip</div>
                        <div style={styles.metaValue}>{job?.skip_type_name || "—"}</div>
                      </div>
                    </div>

                    {notes ? (
                      <details style={styles.notesWrap}>
                        <summary style={styles.notesSummary}>Notes</summary>
                        <div style={styles.notesBody}>{notes}</div>
                      </details>
                    ) : null}
                  </div>
                );
              }

              return (
                <div key={key} style={styles.itemCard}>
                  <div style={styles.itemTop}>
                    <div style={styles.itemBadgeMuted}>Unknown</div>
                    <div style={styles.itemIndex}>#{idx + 1}</div>
                  </div>
                  <div style={styles.itemTitle}>Unknown item type</div>
                  <div style={styles.itemSub}>{String(it.type)}</div>
                </div>
              );
            })}
          </section>
        )}

        <div style={styles.footerNote}>
          Run order is shown exactly as stored in <code>driver_runs.items</code>.
        </div>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
    padding: 18,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    background:
      "radial-gradient(circle at top left, rgba(43,108,255,0.16), transparent 28%), linear-gradient(180deg, #081224 0%, #0e172a 45%, #eef3fb 45%, #f5f8fc 100%)",
  },
  bgGlowA: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 320,
    height: 320,
    borderRadius: "50%",
    background: "rgba(66, 153, 225, 0.20)",
    filter: "blur(60px)",
    pointerEvents: "none",
  },
  bgGlowB: {
    position: "absolute",
    bottom: 80,
    left: -120,
    width: 280,
    height: 280,
    borderRadius: "50%",
    background: "rgba(59, 130, 246, 0.14)",
    filter: "blur(60px)",
    pointerEvents: "none",
  },
  shell: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 980,
    margin: "0 auto",
  },
  hero: {
    background: "linear-gradient(135deg, rgba(9,18,39,0.96), rgba(15,23,42,0.92))",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 26,
    padding: 22,
    boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
    marginBottom: 18,
  },
  heroTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  brandBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #2563eb, #60a5fa)",
    color: "#fff",
    boxShadow: "0 10px 24px rgba(37,99,235,0.28)",
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: "-0.02em",
  },
  brandSub: {
    marginTop: 2,
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    padding: "11px 14px",
    borderRadius: 14,
    fontWeight: 700,
    cursor: "pointer",
    backdropFilter: "blur(4px)",
  },
  secondaryLinkBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    padding: "11px 14px",
    borderRadius: 14,
    fontWeight: 700,
    textDecoration: "none",
    backdropFilter: "blur(4px)",
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.3fr) repeat(3, minmax(120px, 1fr))",
    gap: 12,
    alignItems: "stretch",
  },
  heroPanelMain: {
    borderRadius: 20,
    padding: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  eyebrow: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#93c5fd",
    fontWeight: 700,
    marginBottom: 10,
  },
  driverName: {
    fontSize: 28,
    fontWeight: 900,
    lineHeight: 1.1,
    letterSpacing: "-0.03em",
  },
  driverSub: {
    marginTop: 8,
    fontSize: 14,
    color: "rgba(255,255,255,0.76)",
    lineHeight: 1.45,
  },
  statCard: {
    borderRadius: 20,
    padding: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))",
    border: "1px solid rgba(255,255,255,0.1)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  statLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.68)",
    fontWeight: 700,
  },
  statValue: {
    marginTop: 10,
    fontSize: 30,
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  errBox: {
    background: "#fff1f2",
    color: "#881337",
    padding: 14,
    borderRadius: 18,
    border: "1px solid #fecdd3",
    marginBottom: 14,
    whiteSpace: "pre-wrap",
    boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
  },
  infoCard: {
    background: "linear-gradient(180deg, #ffffff, #f8fbff)",
    borderRadius: 22,
    padding: 18,
    border: "1px solid rgba(15,23,42,0.08)",
    boxShadow: "0 14px 36px rgba(15,23,42,0.08)",
    color: "#0f172a",
  },
  listWrap: {
    display: "grid",
    gap: 14,
  },
  itemCard: {
    background: "linear-gradient(180deg, #ffffff, #f8fbff)",
    borderRadius: 22,
    padding: 18,
    border: "1px solid rgba(15,23,42,0.08)",
    boxShadow: "0 14px 36px rgba(15,23,42,0.08)",
  },
  specialCard: {
    background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
    borderRadius: 22,
    padding: 18,
    border: "1px solid rgba(37,99,235,0.18)",
    boxShadow: "0 14px 36px rgba(15,23,42,0.08)",
  },
  specialCardAlt: {
    background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
    borderRadius: 22,
    padding: 18,
    border: "1px solid rgba(245,158,11,0.2)",
    boxShadow: "0 14px 36px rgba(15,23,42,0.08)",
  },
  itemTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  itemBadgeGreen: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: 999,
    background: "#ecfdf5",
    color: "#047857",
    fontWeight: 800,
    fontSize: 12,
  },
  itemBadgeBlue: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: 999,
    background: "#dbeafe",
    color: "#1d4ed8",
    fontWeight: 800,
    fontSize: 12,
  },
  itemBadgeAmber: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: 999,
    background: "#fef3c7",
    color: "#b45309",
    fontWeight: 800,
    fontSize: 12,
  },
  itemBadgeMuted: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: 999,
    background: "#e2e8f0",
    color: "#475569",
    fontWeight: 800,
    fontSize: 12,
  },
  itemIndex: {
    fontSize: 12,
    fontWeight: 800,
    color: "#64748b",
  },
  itemTitle: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: "-0.03em",
    color: "#0f172a",
  },
  itemSub: {
    marginTop: 6,
    fontSize: 14,
    color: "#475569",
    lineHeight: 1.45,
  },
  jobNumber: {
    fontSize: 13,
    fontWeight: 800,
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  siteName: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1.1,
    letterSpacing: "-0.03em",
    color: "#0f172a",
  },
  address: {
    marginTop: 8,
    fontSize: 15,
    color: "#475569",
    lineHeight: 1.45,
  },
  metaGrid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  metaBox: {
    borderRadius: 16,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    padding: 12,
  },
  metaLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  metaValue: {
    marginTop: 6,
    fontSize: 15,
    color: "#0f172a",
    fontWeight: 700,
  },
  notesWrap: {
    marginTop: 14,
  },
  notesSummary: {
    cursor: "pointer",
    fontWeight: 800,
    color: "#0f172a",
  },
  notesBody: {
    marginTop: 8,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    padding: 12,
    borderRadius: 16,
    whiteSpace: "pre-wrap",
    color: "#334155",
    lineHeight: 1.5,
  },
  footerNote: {
    marginTop: 16,
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    paddingBottom: 22,
  },
  centerCard: {
    width: "100%",
    maxWidth: 520,
    margin: "80px auto 0",
    background: "#fff",
    borderRadius: 24,
    padding: 24,
    border: "1px solid rgba(15,23,42,0.08)",
    boxShadow: "0 24px 60px rgba(15,23,42,0.12)",
    textAlign: "center",
  },
  signOutBadge: {
    display: "inline-flex",
    padding: "8px 12px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    fontWeight: 800,
    fontSize: 12,
    marginBottom: 12,
  },
  centerTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: "-0.03em",
    color: "#0f172a",
  },
  centerText: {
    margin: "10px 0 18px 0",
    color: "#475569",
    fontSize: 15,
    lineHeight: 1.5,
  },
  primaryLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 14,
    background: "linear-gradient(135deg, #2563eb, #60a5fa)",
    color: "#fff",
    fontWeight: 800,
  },
  iconSvg: {
    width: 22,
    height: 22,
    display: "block",
  },
  iconSvgSm: {
    width: 18,
    height: 18,
    display: "block",
  },
};
