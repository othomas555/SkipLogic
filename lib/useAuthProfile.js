// lib/useAuthProfile.js
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useRouter } from "next/router";

function isWithinGrace(graceEndsAtIso) {
  if (!graceEndsAtIso) return false;
  const ms = new Date(graceEndsAtIso).getTime();
  if (!Number.isFinite(ms)) return false;
  return Date.now() <= ms;
}

function isAllowedStatus(status) {
  return status === "active" || status === "trialing";
}

export function useAuthProfile() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [subscriberId, setSubscriberId] = useState(null);
  const [subscriber, setSubscriber] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setChecking(true);
      setErrorMsg("");

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (!alive) return;

      if (userError || !userData?.user) {
        router.push("/signin");
        return;
      }

      const u = userData.user;
      setUser(u);

      const { data: prof, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.id)
        .single();

      if (!alive) return;

      if (profileError || !prof) {
        console.error(profileError);
        setErrorMsg("Could not load your profile.");
        setChecking(false);
        return;
      }

      setProfile(prof);
      const sid = prof.subscriber_id || null;
      setSubscriberId(sid);

      if (!sid) {
        setErrorMsg("Your account is missing a subscriber record.");
        setChecking(false);
        return;
      }

      // Fetch subscriber billing state (used for hard-locking the app)
      const { data: sub, error: subErr } = await supabase
        .from("subscribers")
        .select("id, subscription_status, grace_ends_at, locked_at")
        .eq("id", sid)
        .single();

      if (!alive) return;

      if (subErr || !sub) {
        console.error(subErr);
        setErrorMsg("Could not load your subscription status.");
        setChecking(false);
        return;
      }

      setSubscriber(sub);

      // HARD LOCK RULE:
      // - allow if active or trialing
      // - allow if within grace (even if past_due)
      // - otherwise bounce to /subscribe (plan picker + checkout)
      const status = sub.subscription_status || "unknown";
      const locked = !!sub.locked_at;
      const graceOk = isWithinGrace(sub.grace_ends_at);

      const onSubscribePage = router.pathname === "/subscribe";
      const onSignupPage = router.pathname === "/signup";
      const onSigninPage = router.pathname === "/signin";

      if (!onSubscribePage && !onSignupPage && !onSigninPage) {
        if (locked) {
          router.replace("/subscribe");
          return;
        }

        if (!isAllowedStatus(status) && !graceOk) {
          router.replace("/subscribe");
          return;
        }
      }

      setChecking(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, [router]);

  return { checking, user, profile, subscriberId, subscriber, errorMsg };
}
