-- Adora Agent readiness audit: READ ONLY. Run in Supabase SQL Editor.
-- Do not include customer rows, messages, secrets, or token values in the result.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('luna_messages','luna_conversation_state','agent_product_codes',
    'products','product_variants','stores')
  AND (
    (table_name='luna_messages' AND column_name IN
      ('channel','page_id','sender_id','event_id','message_text','event_kind',
       'attachment_refs','received_at','handling_status'))
    OR
    (table_name='luna_conversation_state' AND column_name IN
      ('channel','page_id','sender_id','owner_mode','product_code','context_summary'))
    OR
    (table_name='agent_product_codes' AND column_name IN
      ('code','product_id','color_name','is_active'))
    OR
    (table_name='products' AND column_name IN
      ('id','store_id','name','is_active'))
    OR
    (table_name='product_variants' AND column_name IN
      ('product_id','store_id','size','stock_quantity','sale_price','is_active'))
    OR
    (table_name='stores' AND column_name IN ('id','name'))
  )
ORDER BY table_name,column_name;

-- Aggregate only: no identifiers or customer information.
SELECT 'luna_messages' AS resource,
  to_regclass('public.luna_messages') IS NOT NULL AS exists_in_db
UNION ALL SELECT 'luna_conversation_state',
  to_regclass('public.luna_conversation_state') IS NOT NULL
UNION ALL SELECT 'agent_product_codes',
  to_regclass('public.agent_product_codes') IS NOT NULL
UNION ALL SELECT 'luna_storage_health()',
  to_regprocedure('public.luna_storage_health()') IS NOT NULL;

-- Check matching store names WITHOUT emitting UUIDs.
SELECT count(*) FILTER (WHERE lower(name) LIKE '%adora%' OR name LIKE '%أدورا%')
  AS candidate_adora_stores,
  count(*) AS total_stores
FROM public.stores;
