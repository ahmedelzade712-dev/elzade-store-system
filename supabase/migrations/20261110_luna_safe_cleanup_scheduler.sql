-- Luna phase 1b: safe automated retention, without deleting pending Meta events.
-- Existing Luna tables from 20261110_luna_minimal_tables.sql must exist.
-- Changes only the Luna purge procedure and (if pg_cron is installed) one named job.
-- No ERP or Storage objects are altered. Run once in Supabase SQL Editor.
BEGIN;

CREATE OR REPLACE FUNCTION public.luna_purge_expired(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_receipts integer := 0;
  v_states integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'INVALID_PURGE_LIMIT';
  END IF;

  -- NEVER discard a received, claimed or failed event automatically.
  -- These statuses may need replay/reconciliation before any deletion.
  WITH expired AS (
    SELECT channel,page_id,event_id
    FROM public.luna_event_receipts
    WHERE expires_at < now()
      AND event_status IN ('sent','handed_off')
    ORDER BY expires_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.luna_event_receipts e
    USING expired x
    WHERE e.channel=x.channel AND e.page_id=x.page_id AND e.event_id=x.event_id
    RETURNING 1
  )
  SELECT count(*) INTO v_receipts FROM deleted;

  -- An expired state does not delete an ERP order, customer profile or message.
  WITH expired AS (
    SELECT channel,page_id,sender_id
    FROM public.luna_conversation_state
    WHERE expires_at < now()
    ORDER BY expires_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.luna_conversation_state s
    USING expired x
    WHERE s.channel=x.channel AND s.page_id=x.page_id AND s.sender_id=x.sender_id
    RETURNING 1
  )
  SELECT count(*) INTO v_states FROM deleted;

  RETURN jsonb_build_object('deleted_receipts',v_receipts,'deleted_states',v_states);
END;
$$;

REVOKE ALL ON FUNCTION public.luna_purge_expired(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luna_purge_expired(integer) TO service_role;

-- Do not create extensions or modify database-wide settings implicitly.
-- If pg_cron exists, install/update this named hourly cleanup idempotently.
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule(
      'luna-expired-data-hourly',
      '17 * * * *',
      'SELECT public.luna_purge_expired(2000);'
    );
    RAISE NOTICE 'Luna hourly cleanup scheduled';
  ELSE
    RAISE NOTICE 'pg_cron not installed; cleanup was updated but is NOT scheduled';
  END IF;
END;
$$;

COMMIT;

-- Expected: both functions ready; pg_cron_installed and job_present true
-- ONLY when the pg_cron extension is installed and job registration succeeded.
SELECT
  to_regprocedure('public.luna_purge_expired(integer)') IS NOT NULL AS safe_cleanup_ready,
  to_regprocedure('public.luna_storage_health()') IS NOT NULL AS storage_monitor_ready,
  to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL AS pg_cron_installed,
  public.luna_storage_health() AS size_report;

-- When pg_cron is installed, inspect the job separately (read-only):
-- SELECT jobid, jobname, schedule, command, active
-- FROM cron.job WHERE jobname='luna-expired-data-hourly';
