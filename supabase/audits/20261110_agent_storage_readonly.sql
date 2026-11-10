-- READ-ONLY: Adora Agent storage baseline. No tables created or data changed.
-- Run in the existing Elzade Supabase SQL Editor BEFORE installing any Agent schema.
-- "Database size" includes tables, indexes, TOAST and internal PostgreSQL overhead.
-- Free-plan quota and Storage bucket limits are separate; check both in Supabase Usage.
WITH tbl AS (
  SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    pg_total_relation_size(c.oid)::bigint AS bytes_total,
    pg_relation_size(c.oid)::bigint AS bytes_table,
    pg_indexes_size(c.oid)::bigint AS bytes_indexes,
    pg_total_relation_size(c.oid)::bigint
      - pg_relation_size(c.oid)::bigint
      - pg_indexes_size(c.oid)::bigint AS bytes_toast_other,
    c.reltuples::bigint AS estimated_rows
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname IN ('public','auth','storage')
), summary AS (
  SELECT schema_name,
    sum(bytes_total) AS bytes_total,
    sum(bytes_table) AS bytes_table,
    sum(bytes_indexes) AS bytes_indexes,
    sum(bytes_toast_other) AS bytes_toast_other,
    sum(estimated_rows) AS estimated_rows
  FROM tbl GROUP BY schema_name
)
SELECT 'DATABASE_TOTAL' AS category,
  pg_size_pretty(pg_database_size(current_database())) AS size,
  pg_database_size(current_database()) AS bytes,
  null::text AS schema_name,
  null::text AS table_name,
  null::bigint AS estimated_rows,
  null::bigint AS table_bytes,
  null::bigint AS index_bytes
UNION ALL
SELECT 'SCHEMA_TOTAL',
  pg_size_pretty(bytes_total), bytes_total, schema_name, null,
  estimated_rows,bytes_table,bytes_indexes
FROM summary
UNION ALL
SELECT 'TABLE_DETAIL',
  pg_size_pretty(bytes_total), bytes_total, schema_name,table_name,
  estimated_rows,bytes_table,bytes_indexes
FROM tbl
ORDER BY bytes DESC,category,schema_name,table_name;

-- Current count of stored files (metadata only; does not fetch/duplicate attachments).
-- Existing buckets are not touched.
SELECT bucket_id, count(*) AS object_count,
       coalesce(sum((metadata->>'size')::bigint),0) AS declared_file_bytes
FROM storage.objects
GROUP BY bucket_id ORDER BY declared_file_bytes DESC;

-- Current Agent table names, if any; inspect before a migration can be approved.
SELECT table_schema,table_name
FROM information_schema.tables
WHERE table_schema='public'
AND (table_name LIKE 'agent_%' OR table_name LIKE 'luna_%')
ORDER BY table_name;
