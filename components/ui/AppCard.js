export default function AppCard({
  title,
  subtitle,
  right,
  children,
  style,
}) {
  return (
    <div className="sl-page-surface" style={{ ...styles.card, ...style }}>
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
    overflow: "hidden",
  },

  header: {
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },

  title: {
    fontSize: 15,
    fontWeight: 900,
  },

  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "var(--text-muted)",
  },

  body: {
    padding: 16,
  },
};
