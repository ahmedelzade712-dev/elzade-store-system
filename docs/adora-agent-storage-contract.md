# Adora Agent — storage-first intake architecture (planning gate)

## Current verified repository boundary
- Elzade ERP is Next.js on Vercel with Supabase Postgres; product catalog and order APIs are core ERP infrastructure.
- New Agent conversation tables **have not been created** by this change.
- The historic Agent experiment routes were removed. Current `app/api/agent/` routes implement the new product catalog, not conversation ingestion.
- Existing external Supabase Edge Function `meta-webhook` must be **inspected directly before modifications**. It is not versioned in this GitHub repository. Do not assume it currently stores, processes, or subscribes to messages.
- Do not enable Meta webhooks/automatic replies during the storage-baseline phase.

## Hard requirements
- Text-only *minimal* Postgres persistence; never save image/video/audio data or base64.
- Do not duplicate product name, price, stock or image files; retain a product code reference only.
- Never persist Meta signed payloads, full message histories, detailed AI traces, or attachment URLs indefinitely.
- A state record should retain only channel, opaque user ID, lifecycle/ownership, current catalog code, timestamps and a small bounded context summary.
- Inbound idempotency ledger must use a stable provider message/event ID, with unique constraints, delivery status and expiry. Only short-lived text needed for safe processing may be stored, with strict length and expiry.
- Handle Meta retries, concurrent deliveries, failed processing, handoff to a human, and resume semantics without replying twice.
- All database writes by backend service-role only; no browser writes for conversation or event tables. RLS and grants required.
- No service-role or Meta secrets in client code, logs or report files.
- Maintain strict separation from products, variants, orders and financial data.
- SQL migration must be reversible for *Agent-owned* objects only; never delete ERP objects or customer records.
- Automatic expiry and measurable hard budget are mandatory. Default planning ceiling for Agent-owned Postgres tables **plus their indexes**: 20 MiB, warning at 15 MiB, block nonessential transient persistence before reaching ceiling. These are targets, **not a guarantee or Supabase billing limit**.
- Any exceeded budget should fail safe (handoff/manual; no loss of orders/ERP data), and must not silently disable idempotency.

## Sequence: no schema writes before baseline
1. Run `supabase/audits/20261110_agent_storage_readonly.sql` in the *actual* production Supabase SQL Editor and retain only the numeric summary. The audit is read-only.
2. Review reported DB total, per-schema and per-table index overhead, Storage objects and any existing `agent_%`/`luna_%` tables. Note existing free-plan usage shows additional categories beyond database table sizes.
3. Agree on a schema with **two small tables** (conversation state and transient inbox/outbox delivery ledger), bounded columns, TTL, lookup indexes and explicit quota monitoring. Do not store image URLs/payloads. Use a stable composite channel+provider identity, not name/phone.
4. Verify existing Meta Edge Function and its subscribed channel scopes; update to persist minimal event identity and metadata **only after** the migration is installed. Ensure acknowledgement follows durable acceptance and retries stay idempotent.
5. Test synthetic signed payloads locally/preview; never send live customer replies during ingest tests. Test duplicate events, replay, ordering, read/write permissions, cleanup retention and sizes.
6. Activate channel message receipt only after tests; keep automatic replies off until the brain, catalog and handoff/ordering stages pass their own tests.

## Retention architecture to validate against Meta retry semantics
- No permanent transcript archive.
- Conversation: keep only the latest bounded structured state while active; expire an abandoned state after a defined idle period, except where human intervention or an order requires continued access. Link an existing ERP order ID rather than copying full order.
- Event ledger: retain minimal idempotency identity/status through a retry-safe window; purge completed entries automatically after the policy-defined TTL, and handle unsettled entries separately to avoid losing a message.
- For photos, fetch/inspect an external attachment in volatile memory only where provider permissions and expiry permit. Persist derived *code* only if confidence is sufficient.
- Verify Supabase PostgreSQL storage impact with `pg_total_relation_size` after rollout; vacuum behavior means reclaimed space may not immediately lower the plan's reported allocation.

**Do not apply a schema, set up pg_cron, or enable Meta subscriptions based solely on this document.** The schema depends on the actual audit output and existing webhook behavior.
