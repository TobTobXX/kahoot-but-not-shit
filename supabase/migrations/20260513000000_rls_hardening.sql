-- RLS hardening pass.
--
-- 1. Column-level revoke: hide secret columns from all client roles.
--    sessions.host_secret and players.secret are only ever read inside
--    SECURITY DEFINER RPCs; exposing them via the open SELECT policies
--    would let any client hijack host controls or submit answers as
--    another player.
--
-- 2. session_question_answers: replace the catch-all "Allow all" policy
--    (which permitted direct client writes) with a single SELECT-only
--    policy. All writes go through the assign_answer_slots() SECURITY
--    DEFINER function called by start_game / open_next_question.


-- ---------------------------------------------------------------------------
-- 1. Column-level revoke for secret columns
-- ---------------------------------------------------------------------------

REVOKE SELECT (host_secret) ON public.sessions FROM anon, authenticated;
REVOKE SELECT (secret)      ON public.players  FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. session_question_answers: SELECT only
-- ---------------------------------------------------------------------------

DROP POLICY "Allow all on session_question_answers" ON public.session_question_answers;
DROP POLICY session_question_answers_read            ON public.session_question_answers;

CREATE POLICY session_question_answers_select ON public.session_question_answers
  FOR SELECT USING (true);
