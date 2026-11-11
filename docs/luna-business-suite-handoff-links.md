# Luna employee handoff — verified link format, identity mapping still required

## Tested by Adora owner
Both individually copied Meta Business Suite URLs were opened and confirmed to take a logged-in admin straight to the intended conversation:
- Messenger: `thread_type=FB_MESSAGE`, `selected_item_id=100047811291605`
- Instagram: `thread_type=IG_MESSAGE`, `selected_item_id=340282366841710301244259273136063643085`

Shared Adora Business Suite IDs: business=1700702260897865, asset=589433480926104, mailbox=589433480926104. The long Instagram ID MUST remain a string. These are observed website URLs (not official stable API contracts); permission and availability depend on Meta.

## Implemented
- Pure parser/formatter: `lib/lunaThreadLinks.ts`, only accepts URLs for the known business and the two known channel types.
- Client-only manual test page `/luna-thread-link-check`: paste a copied URL, round-trip it through the parser/formatter, then click and verify. No server writes, no messages sent.
- The new route is **not** a verified automated Graph API mapping; it only correctly builds links from already-proven Business Suite selected-item IDs.

## Critical gate before automated employee handoff
1. Use an isolated real Messenger test conversation and get webhook `sender.id` as a string, then get Graph conversations identifier (using existing Meta credentials and correct permission). Compare with a copied Business Suite URL's `selected_item_id` for that **same** thread. Do not assume these are identical.
2. Repeat with a real Instagram test conversation. Its 39-digit Business Suite value strongly warns against unsafe JS numeric conversion.
3. If webhook IDs differ, build a validated resolver using permitted Meta API calls or a verifiable mapping. If the mapping is unsupported, handoff should fail closed; never link to a random inbox or a different customer.
4. Open links with a separate employee Meta account with delegated access, on mobile and desktop, and ensure permissions work.
5. Only after that, use these links in handoff notifications. Determine how staff should receive the notification and avoid sending PII through public links.

## Keep current receiver unchanged
The pre-existing Supabase Edge Function `meta-webhook` verifies events and returns EVENT_RECEIVED without persisting details; Next.js alternative endpoint remains switched off. Do not enable simultaneous subscriptions or customer replies while the mapping and event processing are unfinished.
