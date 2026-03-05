export default function AppTable({ columns, rows }) {
  return (
    <div style={styles.wrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={styles.th}>
                {c}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={styles.tr}>
              {row.map((cell, j) => (
                <td key={j} style={styles.td}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  wrap: {
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
  },

  th: {
    textAlign: "left",
    fontSize: 12,
    padding: "10px 12px",
    color: "var(--d-muted)",
    borderBottom: "1px solid var(--d-border)",
  },

  td: {
    padding: "12px",
    fontSize: 13,
    color: "var(--d-ink)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },

  tr: {
    transition: "background 0.15s",
  },
};
