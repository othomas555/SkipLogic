import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

function ymdTodayLocal() {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function humanDate(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function getDriverLabelById(drivers, driverId) {
  if (!driverId) return "All drivers";
  const match = (drivers || []).find((d) => d.id === driverId);
  return match?.name || driverId;
}

function cleanText(value) {
  return String(value || "").trim();
}

export default function PrintDaySheetPage() {
  const today = useMemo(() => ymdTodayLocal(), []);
  const [date, setDate] = useState(today);
  const [driverId, setDriverId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState({ rows: [], total: 0, drivers: [] });

  async function loadData(nextDate = date, nextDriverId = driverId) {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message || "Failed to get session");
      }

      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("You are not signed in");
      }

      const qs = new URLSearchParams({ date: nextDate });
      if (nextDriverId) qs.set("driver_id", nextDriverId);

      const res = await fetch(`/api/app/print/day-sheet?${qs.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load day sheet");
      }

      setData({
        rows: Array.isArray(json.rows) ? json.rows : [],
        total: Number(json.total || 0),
        drivers: Array.isArray(json.drivers) ? json.drivers : [],
        date: json.date || nextDate,
        driver_id: json.driver_id || "",
      });
    } catch (err) {
      setError(err?.message || "Failed to load day sheet");
      setData({ rows: [], total: 0, drivers: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(today, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  return (
    <div style={styles.page} data-print-page="day-sheet">
      <div className="no-print" style={styles.noPrint}>
        <div style={styles.toolbar}>
          <div style={styles.leftControls}>
            <label style={styles.label}>
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={styles.input}
              />
            </label>

            <label style={styles.label}>
              <span>Driver</span>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                style={styles.input}
              >
                <option value="">All drivers</option>
                {(data.drivers || []).map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={() => loadData(date, driverId)}
              style={styles.button}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load"}
            </button>

            <button
              onClick={() => window.print()}
              style={styles.buttonPrimary}
              disabled={loading}
            >
              Print
            </button>
          </div>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}
      </div>

      <div style={styles.sheet} className="print-sheet">
        <div style={styles.header}>
          <div>
            <div style={styles.company}>Day Sheet</div>
            <div style={styles.meta}>Date: {humanDate(data.date || date)}</div>
            <div style={styles.meta}>
              Driver: {getDriverLabelById(data.drivers, data.driver_id || driverId)}
            </div>
          </div>

          <div style={styles.summaryBox}>
            <div style={styles.summaryLabel}>Total jobs</div>
            <div style={styles.summaryValue}>{data.total || 0}</div>
          </div>
        </div>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.thSmall}>#</th>
              <th style={styles.th}>Job no.</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Customer</th>
              <th style={styles.th}>Phone</th>
              <th style={styles.th}>Address</th>
              <th style={styles.th}>Skip</th>
              <th style={styles.th}>Notes</th>
              <th style={styles.th}>Permit</th>
              <th style={styles.th}>Placement</th>
              <th style={styles.th}>Driver</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data.rows || []).length === 0 ? (
              <tr>
                <td colSpan={12} style={styles.empty}>
                  No jobs found for this date
                </td>
              </tr>
            ) : (
              data.rows.map((row) => {
                const notes = cleanText(row.notes);
                const phone = cleanText(row.customer_phone || row.phone);

                return (
                  <tr key={row.id}>
                    <td style={styles.tdCenter}>{row.run_order}</td>
                    <td style={styles.td}>{row.job_number}</td>
                    <td style={styles.td}>{row.job_type}</td>
                    <td style={styles.td}>{row.customer_name}</td>
                    <td style={styles.td}>{phone || "—"}</td>
                    <td style={styles.td}>{row.address}</td>
                    <td style={styles.td}>{row.skip_name}</td>
                    <td style={styles.td}>{notes || ""}</td>
                    <td style={styles.tdCenter}>{row.permit}</td>
                    <td style={styles.tdCenter}>{row.placement}</td>
                    <td style={styles.td}>{row.driver_name}</td>
                    <td style={styles.td}>{row.status}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div style={styles.footerNote}>Printed from SkipLogic</div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }

          html,
          body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          body * {
            visibility: hidden;
          }

          [data-print-page='day-sheet'],
          [data-print-page='day-sheet'] * {
            visibility: visible;
          }

          aside,
          nav,
          header,
          .no-print,
          button {
            display: none !important;
          }

          [data-print-page='day-sheet'] {
            position: static !important;
            display: block !important;
            width: 100% !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            box-shadow: none !important;
          }

          .print-sheet {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
          }

          table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto;
          }

          thead {
            display: table-header-group;
          }

          tr,
          td,
          th {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          th,
          td {
            padding: 6px !important;
            font-size: 11px !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    padding: 20,
    background: "#f5f7fb",
    minHeight: "100vh",
    color: "#111827",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  noPrint: {
    marginBottom: 16,
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "end",
    gap: 12,
    flexWrap: "wrap",
  },
  leftControls: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "end",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
  },
  input: {
    height: 40,
    minWidth: 180,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
  },
  button: {
    height: 40,
    padding: "0 16px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  buttonPrimary: {
    height: 40,
    padding: "0 16px",
    borderRadius: 10,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  error: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    background: "#fee2e2",
    color: "#991b1b",
    fontWeight: 600,
  },
  sheet: {
    background: "#fff",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 16,
  },
  company: {
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1.1,
  },
  meta: {
    marginTop: 6,
    fontSize: 14,
    color: "#4b5563",
  },
  summaryBox: {
    minWidth: 140,
    border: "1px solid #d1d5db",
    borderRadius: 12,
    padding: 12,
    textAlign: "center",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 800,
    marginTop: 4,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  },
  th: {
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    textAlign: "left",
    padding: 8,
    fontWeight: 800,
  },
  thSmall: {
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    textAlign: "center",
    padding: 8,
    width: 40,
    fontWeight: 800,
  },
  td: {
    border: "1px solid #e5e7eb",
    padding: 8,
    verticalAlign: "top",
  },
  tdCenter: {
    border: "1px solid #e5e7eb",
    padding: 8,
    verticalAlign: "top",
    textAlign: "center",
  },
  empty: {
    padding: 30,
    textAlign: "center",
    color: "#6b7280",
    border: "1px solid #e5e7eb",
  },
  footerNote: {
    marginTop: 12,
    fontSize: 12,
    color: "#6b7280",
  },
};
