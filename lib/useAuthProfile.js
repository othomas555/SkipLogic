// lib/useAuthProfile.js
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useRouter } from "next/router";

export function useAuthProfile() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [subscriberId, setSubscriberId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function load() {
      setChecking(true);
      setErrorMsg("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)        // 🔒 locked to your real schema
        .single();

      if (profileError || !profile) {
        console.error(profileError);
        setErrorMsg("Could not load your profile.");
        setChecking(false);
        return;
      }

      setProfile(profile);
      setSubscriberId(profile.subscriber_id || null);
      setChecking(false);
    }

    load();
  }, [router]);

  return { checking, user, profile, subscriberId, errorMsg };
}
