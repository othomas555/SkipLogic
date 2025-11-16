import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

export default function SkipTypesPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState(null);
  const [subscriberId, setSubscriberId] = useState(null);

  const [skipTypes, setSkipTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // New skip type form
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");

  const [saving, setSaving] = useState(false);

  // --------- Load auth + subscriber + skip types ----------
  useEffect(() => {
    async function loadData() {
      setChecking(true);
      setLoading(true);
      setErrorMsg("");

      // 1) Get current user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        // Not signed in -> back to login
        router.push("/login");
        return;
      }
      setUserEmail(user.email);

      // 2) Get profile (to find subscriber_id)
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        console.error(profileError);
        setErrorMsg("Could not load your profile.");
        setChecking(false);
        setLoading(false);
        return;
      }

      const subId = profile.subscriber_id;
      setSubscriberId(subId);

      // 3) Load skip types for this subscriber
      const { data: types, error: typesError } = await supabase
        .from("skip_types")
        .select("*")
        .eq("subscriber_id", subId)
        .order("name", { ascending: true });

      if (typesError) {
        console.error(typesError);
        setErrorMsg("Could not load skip types.");
      } else {
        setSkipTypes(types || []);
      }

      setChecking(false);
      setLoading(false);
    }

    loadData();
  }, [router]);

  // --------- Handlers ----------

  async function handleCreateSkipType(e) {
    e.preventDefault();
    if (!subscriberId) return;
    if (!newName.trim()) {
      setErrorMsg("Name is required.");
      return;
    }

    const qty = parseInt(newQuantity, 10) || 0;

    setSaving(true);
    setErrorMsg("");

    const { data, error } = await supabase
      .from("skip_types")
      .insert({
        subscriber_id: subscriberId,
        name: newName.trim(),
        quantity_owned: qty,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      setErrorMsg("Could not save skip type.");
    } else {
      setSkipTypes((prev) => [...prev, data].sort((a, b) =>
        a.name.localeCompare(b.name)
      ));
      setNewName("");
      setNewQuantity("");
    }

    setSaving(false);
  }

  function startEditing(skipType) {
    setEditingId(skipType.id);
    setEditName(skipType.name);
    setEditQuantity(skipType.quantity_owned?.toString() ?? "");
  }

  function cancelEditing() {
    setEditingId(null);
    setEditName("");
    setEditQuantity("");
  }

  async function handleUpdateSkipType(e) {
    e.preventDefault();
    if (!editingId || !subscriberId) return;

    if (!editName.trim()) {
      setErrorMsg("Name is required.");
      return;
    }

    const qty = parseInt(editQuantity, 10) || 0;

    setSaving(true);
    setErrorMsg("");

    const { data, error } = await supabase
      .from("skip_types")
      .update({
        name: editName.trim(),
        quantity_owned: qty,
      })
      .eq("id", editingId)
      .eq("subscriber_id", subscriberId)
      .select()
      .single();

    if (error) {
      console.error(error);
      setErrorMsg("Could not update skip type.");
    } else {
      setSkipTypes((prev) =>
        prev
          .map((st) => (st.id === editingId ? data : st))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      cancelEditing();
    }

    setSaving(false);
  }

  async function handleDeleteSkipType(id) {
    if (!subscriberId) return;
    const confirmDelete = window.confirm(
      "Delete this skip type? This cannot be undone."
    );
    if (!confirmDelete) return;

    setSaving(true);
    setErrorMsg("");

    const { error } = await supabase
      .from("skip_types")
      .delete()
      .eq("id", id)
      .eq("subscriber_id", subscriberId);

    if (error) {
      console.error(error);
      setErrorMsg("Could not delete skip type.");
    } else {
      setSkipTypes((prev) => prev.filter((st) => st.id !== id));
    }

    setSaving(false);
  }

  // --------- Render ----------

  if (checking) {
    return <p>Checking sign-in…</p>;
  }

  return (
    <main style={{ padding: "1.5rem", maxWidth: "800px", margin: "0 auto" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>Skip Types</h1>
        {userEmail && (
          <p style={{ fontSize: "0.875rem", color: "#555" }}>
            Signed in as {userEmail}
          </p>
        )}
        <button
          type="button"
          onClick={() => router.push("/app")}
          style={{
            marginTop: "0.5rem",
            fontSize: "0.875rem",
            textDecoration: "underline",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          ← Back to dashboard
        </button>
      </header>

      {errorMsg && (
        <p style={{ color: "red", marginBottom: "1rem" }}>{errorMsg}</p>
      )}

      {/* List of skip types */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontWeight: "600", marginBottom: "0.5rem" }}>
          Existing skip types
        </h2>
        {loading ? (
          <p>Loading skip types…</p>
        ) : skipTypes.length === 0 ? (
          <p>No skip types found yet.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "0.5rem",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "0.5rem",
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "0.5rem",
                    width: "150px",
                  }}
                >
                  Quantity owned
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ddd",
                    padding: "0.5rem",
                    width: "180px",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {skipTypes.map((st) => {
                const isEditing = editingId === st.id;
                return (
                  <tr key={st.id}>
                    <td
                      style={{
                        borderBottom: "1px solid #eee",
                        padding: "0.5rem",
                      }}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ width: "100%" }}
                        />
                      ) : (
                        st.name
                      )}
                    </td>
                    <td
                      style={{
                        borderBottom: "1px solid #eee",
                        padding: "0.5rem",
                      }}
                    >
                      {isEditing ? (
                        <input
                          type="number"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          style={{ width: "100px" }}
                        />
                      ) : (
                        st.quantity_owned
                      )}
                    </td>
                    <td
                      style={{
                        borderBottom: "1px solid #eee",
                        padding: "0.5rem",
                      }}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={handleUpdateSkipType}
                          style={{ display: "inline-flex", gap: "0.5rem" }}
                        >
                          <button type="submit" disabled={saving}>
                            {saving ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditing(st)}
                            disabled={saving}
                            style={{ marginRight: "0.5rem" }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSkipType(st.id)}
                            disabled={saving}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Add new skip type */}
      <section>
        <h2 style={{ fontWeight: "600", marginBottom: "0.5rem" }}>
          Add new skip type
        </h2>
        <form
          onSubmit={handleCreateSkipType}
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <label>
            Name:
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
            />
          </label>
          <label>
            Quantity owned:
            <input
              type="number"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              style={{ display: "block", width: "100px", marginTop: "0.25rem" }}
              min="0"
            />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </section>
    </main>
  );
}
