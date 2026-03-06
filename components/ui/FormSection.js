export default function FormSection({ title, children, style }) {
  return (
    <div className="sl-page-surface" style={{ ...styles.card, ...style }}>
      {title && <div style={styles.title}>{title}</div>}

      <div style={styles.body}>
        {children}
      </div>
    </div>
  );
}

const styles = {
  card: {
    padding: 20,
    marginBottom: 18,
  },

  title: {
    fontSize: 16,
    fontWeight: 900,
    marginBottom: 14,
    color: "var(--text)",
  },

  body: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
};
