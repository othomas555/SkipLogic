// pages/app/postcodes-served.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import { useAuthProfile } from "../../lib/useAuthProfile";

// Helper: normalize pattern input the same way DB logic expects
function normalizePatternInput(pattern) {
  if (!pattern) return "";
  let p = pattern.toUpperCase().replace(/\s+/g, "");
  // Strip trailing * characters
  p = p.replace(/\*+$/, "");
  return p;
}

export default function PostcodesServedPage() {
  const router = useRouter();
  const { checking, user, subscriberId, errorMsg: authError } = useAuthProfile();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [skipTypes, setSkipTypes] = useState([]);
  const [zones, setZones] = useState([]);

  const [newPattern, setNewPattern] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [savingZone, setSavingZone] = useState(false);
  const [savingCell, setSavingCell] = useState(false);

  // Debug
  console.log("PostcodesServedPage render", {
    checking,
    userEmail: user?.email,
    subscriberId,
  });

  useEffect(() => {
    if (checking) return; // still checking auth

    if (!user || !subscriberId) {
      setLoading(false);
      return;
    }

    async function loadData() {
      setLoading(true);
      setErrorMsg("");

      try {
        // 1) Load skip types
        const { data: skipTypesData, error: stError } = await supabase
          .from("skip_types")
          .select("id, name")
          .eq("subscriber_id", subscriberId)
          .order("name", { ascending: true });

        if (stError) {
          console.error("Error loading skip types:", stError);
          throw new Error("Could not load skip types");
        }

        // 2) Load postcode zones + their prices
        // Assumes default FK relation name "postcode_zone_prices"
        const { data: zonesData, error: zError } = await supabase
          .from("postcode_zones")
          .select(
            `
            id,
            pattern_input,
            normalized_prefix,
            label,
            active,
            postcode_zone_prices (
              id,
              skip_type_id,
              price_inc_vat
            )
          `
          )
          .eq("subscriber_id", subscriberId)
          .order("pattern_input", { ascending: true });

        if (zError) {
          console.error("Error loading postcode zones:", zError);
          throw new Error("Could not load postcode zones");
        }

        const zonesWithPrices = (zonesData || []).map((z) => {
          const pricesBySkipType = {};
          (z.postcode_zone_prices || []).forEach((p) => {
            pricesBySkipType[p.skip_type_id] = p.price_inc_vat;
          });
          return {
            id: z.id,
            pattern_input: z.pattern_input,
            normalized_prefix: z.normalized_prefix,
            label: z.label,
            active: z.active,
            pricesBySkipType,
          };
        });

        setSkipTypes(skipTypesData || []);
        setZones(zonesWithPrices);
      } catch (err) {
        console.error("Error in loadData:", err);
        setErrorMsg(err.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [checking, user, subscriberId]);

  if (checking) {
    return <div style={{ padding: "20px" }}>Checking login…</div>;
  }

  if (!user || !subscriberId) {
    return (
      <div style={{ padding: "20px" }}>
        <p>You must be signed in to view this page.</p>
        <button onClick={() => router.push("/login")}>Go to login</button>
      </div>
    );
  }

  if (authError) {
    return (
      <div style={{ padding: "20px" }}>
        <p>Error: {authError}</p>
      </div>
    );
  }

  async function handleAddZone(e) {
    e.preventDefault();
    setErrorMsg("");

    const pattern = (newPattern || "").trim();
    if (!pattern) {
      setErrorMsg("Please enter a postcode pattern, e.g. CF36 or CF31 1*");
      return;
    }

    const normalized_prefix = normalizePatternInput(pattern);
    if (!normalized_prefix) {
      setErrorMsg("Pattern could not be normalised. Check the format.");
      return;
    }

    setSavingZone(true);
    try {
      const { data, error } = await supabase
        .from("postcode_zones")
        .insert({
          subscriber_id: subscriberId,
          pattern_input: pattern,
          normalized_prefix,
          label: newLabel || null,
        })
        .select(
          `
          id,
          pattern_input,
          normalized_prefix,
          label,
          active
        `
        )
        .single();

      if (error) {
        console.error("Error inserting postcode zone:", error);
        throw new Error(error.message || "Could not add postcode area");
      }

      setZones((prev) => [
        ...prev,
        {
          id: data.id,
          pattern_input: data.pattern_input,
          normalized_prefix: data.normalized_prefix,
          label: data.label,
          active: data.active,
          pricesBySkipType: {},
        },
      ]);

      setNewPattern("");
      setNewLabel("");
    } catch (err) {
      console.error("handleAddZone error:", err);
      setErrorMsg(err.message || "Failed to add postcode area");
    } finally {
      setSavingZone(false);
    }
  }

  async function handlePriceBlur(zoneId, skipTypeId, value) {
    setErrorMsg("");

    const trimmed = String(value ?? "").trim();

    if (trimmed === "") {
      // For now, don't allow blank (deleting) via UI.
      // Just don't save anything.
      return;
    }

    const numeric = parseFloat(trimmed);
    if (Number.isNaN(numeric) || numeric < 0) {
      setErrorMsg("Price must be a non-negative number");
      return;
    }

    setSavingCell(true);
    try {
      const { error } = await supabase
        .from("postcode_zone_prices")
        .upsert(
          {
            subscriber_id: subscriberId,
            postcode_zone_id: zoneId,
            skip_type_id: skipTypeId,
            price_inc_vat: numeric,
          },
          {
            onConflict: "subscriber_id,postcode_zone_id,skip_type_id",
          }
        );

      if (error) {
        console.error("Error saving price:", error);
        throw new Error(error.message || "Could not save price");
      }

      // Update local state
      setZones((prev) =>
        prev.map((z) => {
          if (z.id !== zoneId) return z;
          return {
            ...z,
            pricesBySkipType: {
              ...z.pricesBySkipType,
              [skipTypeId]: numeric,
            },
          };
        })
      );
    } catch (err) {
      console.error("handlePriceBlur error:", err);
      setErrorMsg(err.message || "Failed to save price");
    } finally {
      setSavingCell(false);
    }
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "20px" }}>
      <h1>Postcodes Served</h1>
      <p>
        Signed in as <strong>{user.email}</strong>
      </p>
      <p>
        Configure which postcode areas you serve and the price per skip type.
        Most specific pattern wins (e.g. CF32 7A* overrides CF32 7* which
        overrides CF32).
      </p>

      <button
        style={{ marginBottom: "10px" }}
        onClick={() => router.push("/app")}
      >
        &larr; Back to dashboard
      </button>

      {errorMsg && (
        <div
          style={{
            margin: "10px 0",
            padding: "10px",
            borderRadius: "4px",
            backgroundColor: "#ffe5e5",
            color: "#900",
          }}
        >
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div>Loading postcode areas…</div>
      ) : (
        <>
          {/* Add postcode area form */}
          <div
            style={{
              margin: "20px 0",
              padding: "15px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              backgroundColor: "#f9f9f9",
            }}
          >
            <h2>Add postcode area</h2>
            <form onSubmit={handleAddZone}>
              <div style={{ marginBottom: "8px" }}>
                <label>
                  Postcode pattern (e.g. CF36, CF31 1*, CF32 7A*):{" "}
                  <input
                    type="text"
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    style={{ width: "250px" }}
                    placeholder="CF31 1*"
                  />
                </label>
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label>
                  Label (optional, e.g. Porthcawl):{" "}
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    style={{ width: "250px" }}
                    placeholder="Bridgend North"
                  />
                </label>
              </div>
              <button type="submit" disabled={savingZone}>
                {savingZone ? "Saving…" : "Add postcode area"}
              </button>
            </form>
          </div>

          {/* Pricing grid */}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                minWidth: "600px",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      borderBottom: "1px solid #ccc",
                      padding: "8px",
                      textAlign: "left",
                      position: "sticky",
                      left: 0,
                      backgroundColor: "#f0f0f0",
                      zIndex: 2,
                    }}
                  >
                    Pattern
                  </th>
                  <th
                    style={{
                      borderBottom: "1px solid #ccc",
                      padding: "8px",
                      textAlign: "left",
                    }}
                  >
                    Label
                  </th>
                  {skipTypes.map((st) => (
                    <th
                      key={st.id}
                      style={{
                        borderBottom: "1px solid #ccc",
                        padding: "8px",
                        textAlign: "right",
                      }}
                    >
                      {st.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2 + skipTypes.length}
                      style={{ padding: "10px" }}
                    >
                      No postcode areas defined yet.
                    </td>
                  </tr>
                ) : (
                  zones.map((z) => (
                    <tr key={z.id}>
                      <td
                        style={{
                          borderBottom: "1px solid #eee",
                          padding: "8px",
                          position: "sticky",
                          left: 0,
                          backgroundColor: "#fff",
                          zIndex: 1,
                        }}
                      >
                        <strong>{z.pattern_input}</strong>
                      </td>
                      <td
                        style={{
                          borderBottom: "1px solid #eee",
                          padding: "8px",
                        }}
                      >
                        {z.label || ""}
                      </td>
                      {skipTypes.map((st) => {
                        const currentPrice = z.pricesBySkipType[st.id] ?? "";
                        return (
                          <td
                            key={st.id}
                            style={{
                              borderBottom: "1px solid #eee",
                              padding: "4px 6px",
                              textAlign: "right",
                            }}
                          >
                            <input
                              type="number"
                              step="0.01"
                              style={{ width: "90px", textAlign: "right" }}
                              defaultValue={currentPrice}
                              onBlur={(e) =>
                                handlePriceBlur(
                                  z.id,
                                  st.id,
                                  e.target.value
                                )
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {savingCell && (
            <div style={{ marginTop: "8px", fontSize: "0.9em" }}>
              Saving price…
            </div>
          )}
        </>
      )}
    </div>
  );
}
