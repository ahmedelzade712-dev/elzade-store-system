# Luna Meta receive-only transport stage

Endpoint (inactive by default): `/api/luna/meta-webhook`

## What it does
- GET: Meta challenge verification only when environment switch is on.
- POST: HMAC-SHA256 verification over **raw** payload bytes using the Meta App Secret (`X-Hub-Signature-256`).
- Rejects unsigned or malformed payloads, limits size to 1 MiB and 100 events per callback.
- For Messenger/Instagram events with a `message.mid` and not flagged as an echo, persists **only** channel, page/account ID and message ID to `luna_event_receipts`.
- Uses database unique key for retries, never stores message text, sender name, phone, raw JSON, attachment files or URLs.
- If database write fails, responds 503 rather than claiming persistence.
- Does **not** send any message, create an ERP order, or update stock.

## Important restrictions
- This is an early **transport-only** phase. It does not yet process the message body or update the conversation-state table; never describe it as a functioning customer assistant.
- The server presently ignores non-message event categories such as reactions, delivery receipts, read receipts and postbacks, and returns 200 for a signed, valid callback. Extend recognition carefully before promising these categories will be processed.
- The existing Supabase `meta-webhook` Edge Function (outside this repo) must be reviewed separately. Do not connect both endpoints to Meta simultaneously.
- The schema's receipt TTL defaults to seven days; `luna_purge_expired` intentionally **does not delete** receipts in `received`, `claimed` or `failed` state. Until a downstream consumer is implemented and verified, **live inbound activation would cause unbounded receipt growth**, so do not enable production Meta subscriptions yet.
- 20 MiB remains a monitoring *target* only, not a database-enforced cap.
- The verification challenge alone does not prove receipt persistence or signature correctness.
- Meta app must subscribe to the correct Facebook Page or Instagram business object and required scopes; exact scopes/permissions must be confirmed in the developer console.
- Use a random, distinct 32+ character verify token and Meta app secret, *not* Supabase JWT credentials. Never send secrets via chat or store in GitHub.

## Only after approved activation
Add on the **server environment** (not `NEXT_PUBLIC_*`):
- `LUNA_META_RECEIVE_ENABLED=true`
- `LUNA_META_VERIFY_TOKEN=<random token at least 24 characters>`
- `LUNA_META_APP_SECRET=<Meta App Secret, at least 24 characters>`

Initially leave `LUNA_META_RECEIVE_ENABLED` unset/false. Validate synthetic signed payloads and state under duplicate retry before changing any Meta webhook configuration. The legacy Supabase Edge Function remains unchanged.

## Rollback
Set `LUNA_META_RECEIVE_ENABLED=false`. Do not delete the two Luna tables or affect the ERP catalog.

## Post-deploy verification
- Confirm route rejects when disabled (503).
- Confirm unsigned request is 401 (when enabled).
- Confirm a test signed event stores exactly one receipt and retry stores no duplicate, without any message sent or user-facing action.
- Confirm Cron runs successfully and measure combined state/receipt size.
