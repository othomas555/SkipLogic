export default function AppCard({
  title,
  subtitle,
  right,
  children,
  style,
}) {
  return (
    <div style={{ ...styles.card, ...style }}>
      {(title || subtitle || right) && (
        <div style={styles.header}>
          <div>
            {title && <div style={styles.title}>{title}</div>}
            {subtitle && <div style={styles.subtitle}>{subtitle}</div>}
          </div>

          {right && <div>{right}</div>}
        </div>
      )}

      <div style={styles.body}>{children}</div>
    </div>
  );
}

const styles = {
  card: {
    borderRadius: "var(--r-lg)",
    background: "var(--d-panel)",
    border: "1px solid var(--d-border)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
    overflow: "hidden",
  },

  header: {
    padding: "14px 16px",
    borderBottom: "1px solid var(--d-border)",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },

  title: {
    fontSize: 15,
    fontWeight: 900,
    color: "var(--d-ink)",
  },

  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "var(--d-muted)",
  },

  body: {
    padding: 16,
  },
};
