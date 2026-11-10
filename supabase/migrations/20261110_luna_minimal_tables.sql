-- Luna conversation persistence v1
-- Scope: TWO tiny Agent-owned tables only. Does not touch existing Elzade ERP tables,
-- product codes, storage.objects, image buckets, orders or inventory.
-- Nothing is stored from image/video/audio attachments or full Meta payloads.
-- Apply once through the linked Supabase SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS public.luna_conversation_state (
  channel text NOT NULL CHECK (channel IN ('messenger','instagram')),
  page_id text NOT NULL CHECK (char_length(page_id) BETWEEN 1 AND 128),
  sender_id text NOT NULL CHECK (char_length(sender_id) BETWEEN 1 AND 128),
  owner_mode text NOT NULL DEFAULT 'luna'
    CHECK (owner_mode IN ('luna','human','closed')),
  product_code text CHECK (product_code IS NULL OR char_length(product_code) BETWEEN 1 AND 32),
  -- Bounded factual context only: never a transcript, contact address or phone number.
  context_summary text NOT NULL DEFAULT ''
    CHECK (char_length(context_summary) <= 512 AND octet_length(context_summary) <= 1024),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  PRIMARY KEY (channel,page_id,sender_id),
  CONSTRAINT luna_state_expiry_valid CHECK (expires_at >= updated_at)
);

CREATE INDEX IF NOT EXISTS luna_state_expires_idx
  ON public.luna_conversation_state (expires_at);

CREATE TABLE IF NOT EXISTS public.luna_event_receipts (
  channel text NOT NULL CHECK (channel IN ('messenger','instagram')),
  page_id text NOT NULL CHECK (char_length(page_id) BETWEEN 1 AND 128),
  event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 190),
  -- A receipt, NOT the message: no text, raw JSON, image, URL, or customer details.
  event_status text NOT NULL DEFAULT 'received'
    CHECK (event_status IN ('received','claimed','sent','failed','handed_off')),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  PRIMARY KEY (channel,page_id,event_id),
  CONSTRAINT luna_receipt_expiry_valid CHECK (expires_at >= received_at),
  CONSTRAINT luna_receipt_updated_valid CHECK (updated_at >= received_at)
);

CREATE INDEX IF NOT EXISTS luna_receipts_expires_idx
  ON public.luna_event_receipts (expires_at);

-- For later webhook processing: one insert per stable Meta event ID.
-- ON CONFLICT DO NOTHING + claim transition must be atomic in the server-side handler.
-- For outbound responses, claim BEFORE contacting Meta; uncertain sends must be handed to
-- a human, not automatically retried, to avoid accidental duplicate replies.

-- Closed/expired conversations and old receipts are intentionally disposable.
-- Caller must schedule this function (e.g. pg_cron, separate migration).
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
  -- Tiny bounded batches to limit duration and lock pressure.
  WITH expired AS (
    SELECT channel,page_id,event_id
    FROM public.luna_event_receipts
    WHERE expires_at < now()
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

-- Minimal monitoring without exposing individual customer IDs or event IDs.
CREATE OR REPLACE FUNCTION public.luna_storage_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'state_rows', (SELECT count(*) FROM public.luna_conversation_state),
    'receipt_rows', (SELECT count(*) FROM public.luna_event_receipts),
    'state_total_bytes', pg_total_relation_size('public.luna_conversation_state'::regclass),
    'receipt_total_bytes', pg_total_relation_size('public.luna_event_receipts'::regclass),
    'combined_total_bytes',
      pg_total_relation_size('public.luna_conversation_state'::regclass)
      + pg_total_relation_size('public.luna_event_receipts'::regclass),
    'target_bytes', 20 * 1024 * 1024,
    'warning_bytes', 15 * 1024 * 1024,
    'expired_receipts', (SELECT count(*) FROM public.luna_event_receipts WHERE expires_at < now()),
    'expired_states', (SELECT count(*) FROM public.luna_conversation_state WHERE expires_at < now())
  );
$$;

-- No browser/anonymous user access; future webhook uses backend service_role only.
ALTER TABLE public.luna_conversation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luna_event_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.luna_conversation_state, public.luna_event_receipts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.luna_conversation_state, public.luna_event_receipts TO service_role;

REVOKE ALL ON FUNCTION public.luna_purge_expired(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.luna_storage_health()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luna_purge_expired(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.luna_storage_health() TO service_role;

COMMIT;

-- Result should be 2 tables and two monitoring/cleanup functions; no rows added.
SELECT
  to_regclass('public.luna_conversation_state') IS NOT NULL AS conversation_table_ready,
  to_regclass('public.luna_event_receipts') IS NOT NULL AS receipt_table_ready,
  to_regprocedure('public.luna_purge_expired(integer)') IS NOT NULL AS cleanup_ready,
  to_regprocedure('public.luna_storage_health()') IS NOT NULL AS monitoring_ready,
  (SELECT count(*) FROM public.luna_conversation_state) AS conversations,
  (SELECT count(*) FROM public.luna_event_receipts) AS receipts,
  public.luna_storage_health() AS size_report;
