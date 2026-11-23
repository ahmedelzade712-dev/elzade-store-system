-- Find the PSID of the SECONDARY Facebook account used for Luna testing.
-- FIRST: send the exact text "LUNA TEST 7354" from that account to Adora Messenger.
-- READ ONLY. It does not modify customer messages, ERP orders or agent state.
-- Replace the test phrase if you sent a different one.
SELECT sender_id AS test_psid, received_at
FROM public.luna_messages
WHERE channel='messenger'
  AND page_id='589433480926104'
  AND message_text='LUNA TEST 7354'
  AND received_at>now()-interval '3 days'
ORDER BY received_at DESC
LIMIT 5;
