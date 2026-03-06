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
          <div style={styles.headerText}>
            {title ? <div style={styles.title}>{title}</div> : null}
            {subtitle ? <div style={styles.subtitle}>{subtitle}</div> : null}
          </div>

          {right ? <div style={styles.right}>{right}</div> : null}
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
    color: "var(--l-ink)",
  },

  header: {
    padding: "14px 16px",
    borderBottom: "1px solid var(--l-border)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    background: "var(--l-surface)",
    color: "var(--l-ink)",
  },

  headerText: {
    minWidth: 220,
    color: "var(--l-ink)",
  },

  title: {
    fontSize: 18,
    fontWeight: 900,
    color: "var(--l-ink)",
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
  },

  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "var(--l-muted)",
    lineHeight: 1.45,
  },

  right: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },

  body: {
    padding: 16,
    color: "var(--l-ink)",
  },
};
