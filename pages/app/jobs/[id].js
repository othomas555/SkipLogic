// pages/app/jobs/[id].js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuthProfile } from "../../../lib/useAuthProfile";

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const { checking, user, subscriberId } = useAuthProfile();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function loadJob() {
    if (!id || !subscriberId) return;

    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        job_status,
        scheduled_date,
        delivery_actual_date,
        collection_date,
        collection_actual_date,
        site_name,
        site_postcode
      `)
      .eq("id", id)
      .eq("subscriber_id", subscriberId)
      .single();

    if (error) {
      setErrorMsg("Could not load job.");
      setLoading(false);
      return;
    }

    setJob(data);
    setLoading(false);
  }

  useEffect(() => {
    if (!checking && user) loadJob();
  }, [checking, user, id]);

  async function runAction(eventType) {
    setActing(eventType);
    setErrorMsg("");
    setSuccessMsg("");

    const { error } = await supabase.rpc("create_job_event", {
      _job_id: job.id,
      _subscriber_id: subscriberId,
      _event_type: eventType,
    });

    setActing("");

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccessMsg(`Updated: ${eventType.replace(/_/g, " ")}`);
    loadJob();
  }

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <Link href="/app/jobs">← Back to Jobs</Link>

      <h1>Job {job.job_number}</h1>

      {(errorMsg || successMsg) && (
        <p style={{ color: errorMsg ? "red" : "green" }}>
          {errorMsg || successMsg}
        </p>
      )}

      <h3>Status: {job.job_status}</h3>

      <h3>Dates</h3>
      <ul>
        <li>Planned delivery: {job.scheduled_date || "—"}</li>
        <li>Actual delivery: {job.delivery_actual_date || "—"}</li>
        <li>Planned collection: {job.collection_date || "—"}</li>
        <li>Actual collection: {job.collection_actual_date || "—"}</li>
      </ul>

      <h3>Actions</h3>
      {job.job_status === "on_hire" && (
        <button disabled={acting} onClick={() => runAction("undo_delivered")}>
          Undo Delivered
        </button>
      )}

      {job.job_status === "collected" && (
        <button disabled={acting} onClick={() => runAction("undo_collected")}>
          Undo Collected
        </button>
      )}
    </main>
  );
}
