import { useAuthProfile } from "../../lib/useAuthProfile";

export default function SettingsPage() {
  const { checking, user, subscriberId } = useAuthProfile();

  if (checking) return <p>Loading…</p>;

  const handleConnect = () => {
    window.location.href = `/api/xero/connect`;
  };

  return (
    <main style={{ padding: 20 }}>
      <h1>Settings</h1>
      <p>Signed in as: {user?.email}</p>

      <h2 style={{ marginTop: 40 }}>Xero Integration</h2>

      <button
        onClick={handleConnect}
        style={{
          padding: "10px 18px",
          background: "#0070f3",
          color: "#fff",
          borderRadius: 6,
          border: "none",
          cursor: "pointer",
        }}
      >
        Connect Xero
      </button>

      <p style={{ marginTop: 10 }}>
        This will redirect you to Xero to authorise SkipLogic.
      </p>
    </main>
  );
}
