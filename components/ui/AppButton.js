export default function AppButton({
  children,
  variant = "primary",
  onClick,
  type = "button",
  style,
}) {
  const variantStyle =
    variant === "secondary"
      ? styles.secondary
      : variant === "danger"
      ? styles.danger
      : styles.primary;

  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        ...styles.base,
        ...variantStyle,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

const styles = {
  base: {
    padding: "10px 14px",
    borderRadius: "var(--r-md)",
    fontWeight: 900,
    fontSize: 13,
    border: "none",
    cursor: "pointer",
    letterSpacing: "-0.01em",
  },

  primary: {
    color: "#071013",
    background:
      "linear-gradient(135deg, var(--brand-mint), rgba(58,181,255,0.9))",
  },

  secondary: {
    color: "var(--text)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
  },

  danger: {
    background: "var(--brand-red)",
    color: "#fff",
  },
};
