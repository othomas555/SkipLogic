import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export default function CollectionPage() {
  const router = useRouter();
  const { token } = router.query;

  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;

    fetch("/api/term-hire/book-collection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setStatus("success");
          setMessage(`Collection booked for ${data.collection_date}`);
        } else {
          setStatus("error");
          setMessage(data.error || "Something went wrong");
        }
      });
  }, [token]);

  return (
    <div style={{ padding: 40 }}>
      <h1>Skip Collection</h1>

      {status === "loading" && <p>Booking collection…</p>}

      {status === "success" && (
        <>
          <p>{message}</p>
          <p>Your skip will be collected shortly.</p>
        </>
      )}

      {status === "error" && (
        <>
          <p style={{ color: "red" }}>{message}</p>
          <p>Please contact the office.</p>
        </>
      )}
    </div>
  );
}
