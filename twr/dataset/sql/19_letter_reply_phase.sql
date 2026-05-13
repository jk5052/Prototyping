-- ============================================================
-- The White Room — receive-first letter flow
--   Reorders the endgame back to "receive a stranger's letter,
--   write a small reply to it, then compose your own letter for
--   the future pool":
--     sealing(3)
--       → letter        (receive matched, display only)
--       → letter-reply  (private reply to the received letter)
--       → letter-compose (write your own + share?)
--       → card
--
--   Column meanings on letter_exchanges (clarified):
--     reply_text       = private response to the received letter.
--                        NEVER inserted into seed_letters.
--                        Lives only on this row.
--     composed_letter  = the player's own letter, eligible for
--                        sharing into seed_letters when
--                        share_choice = true.
--
--   Matching keys on blank_fill_responses.answer_embedding /
--   primary_defense (v1 RPC from 12_letter_match_rpc.sql), so
--   /api/letter can run immediately after sealing, before any
--   composed_letter exists.
--
-- Run AFTER 18_compose_letter.sql in Supabase SQL Editor.
-- ============================================================

-- (1) letter_exchanges — add reply_at timestamp ---------------
alter table public.letter_exchanges
  add column if not exists reply_at timestamptz;

-- reply_text already exists (10_endgame_schema.sql). No-op if so.
alter table public.letter_exchanges
  add column if not exists reply_text text;

-- (2) v1 RPCs reused as-is for the receive-first match --------
--   public.match_letter_for_session(p_session_id uuid)
--   public.match_letter_for_session_any(p_session_id uuid)
--   defined in 12_letter_match_rpc.sql — no changes here.
--
--   v2 RPCs from 18_compose_letter.sql remain installed but are
--   no longer called by /api/letter. They are kept available for
--   future variants (e.g. re-matching based on composed letter).

-- (3) verification ---------------------------------------------
--   select column_name, data_type from information_schema.columns
--    where table_name = 'letter_exchanges'
--      and column_name in ('reply_text','reply_at');
--   select proname from pg_proc
--    where proname in ('match_letter_for_session',
--                      'match_letter_for_session_any');
