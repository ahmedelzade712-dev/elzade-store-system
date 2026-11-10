# Luna v1: minimal persistence setup

## Database migration
Run `supabase/migrations/20261110_luna_minimal_tables.sql` in the production Supabase SQL Editor (once). This creates ONLY:
- `luna_conversation_state`: one bounded row per (Messenger/Instagram, Meta page/account ID, sender ID). Includes agent/human/closed ownership, optional product code, at most 512 Unicode characters / 1024 UTF-8 bytes of summarized context, timestamps and expiration (default 14 days).
- `luna_event_receipts`: one bounded row per stable event ID to deduplicate webhook deliveries. Contains **NO message text or attachment URLs**, only channel, page ID, provider event ID, lifecycle status, and timestamps; default expiration 7 days.
- Two restricted server-only functions: `luna_purge_expired(limit)` for batch cleanup and `luna_storage_health()` for actual combined size.

No images, videos, sound, transcripts, raw Meta payloads, addresses, or phone numbers in either table. RLS is enabled and `anon`/`authenticated` privileges are revoked; service role only. Does not alter ERP products, codes, inventory, orders, Storage objects, or delete historical data.

### Must understand BEFORE enabling Meta receiving
- **Cleaning is not scheduled by the migration.** The cleanup function only deletes when called; expiry timestamps by themselves do not remove rows. Connect a daily `pg_cron` schedule or authenticated backend scheduler only after confirming the runtime's available scheduler/credentials. Verify scheduler success separately.
- **20 MiB is a monitoring target, not a hard storage cap**. The webhook/backend MUST check the health function regularly, warn at 15 MiB and stop *non-essential* writes or hand off safely if 20 MiB is reached. Protect idempotency records.
- Because message bodies are not durably stored, transient failures before processing may require Meta delivery retries or human intervention. The system must not acknowledge a message as processed before safe acceptance, and must distinguish accepted receipt from actually sent response. Treat network-unknown send outcomes as uncertain and require human review, not blind retries.
- Expiry default durations are not a guarantee of deletion until the scheduler is operational.
- Sender IDs are pseudonymous identifiers but still personal data; restrict access and retention.

### Do not use old Meta rows
`meta_messages`, `meta_conversations`, `meta_attachments` were intentionally deleted earlier. Never recreate these old bulk stores.

### Validation
At the end of the migration the SELECT returns four true flags, 0 conversations, 0 receipts and small total bytes. Copy results back before wiring webhooks.

### After migration
Implement a server-only handler using event deduplication, bounded state update, safe provider verification, and receive-only mode. Review the existing Supabase Edge Function source before enabling production messaging. Later add scheduled cleanup and prove it runs, plus inbound tests under retries and concurrency.
