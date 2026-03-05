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
    background: "linear-gradient(135deg,#37f59b,#3ab5ff)",
    color: "#071013",
  },

  secondary: {
    background: "rgba(255,255,255,0.06)",
    color: "var(--d-ink)",
    border: "1px solid var(--d-border)",
  },

  danger: {
    background: "#ef4444",
    color: "#fff",
  },
};
