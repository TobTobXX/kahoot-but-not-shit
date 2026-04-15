-- Tighten the session guard added in 20260429000000:
-- use state = 'active' instead of state != 'finished'.
-- 'waiting' sessions are excluded because no client reads questions during
-- the lobby phase, and an abandoned waiting session would otherwise keep
-- a private quiz's content exposed until the hourly cron cleanup.

DROP POLICY IF EXISTS questions_select_visible ON questions;
CREATE POLICY questions_select_visible ON questions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.quizzes
    WHERE id = quiz_id AND (
      is_public = true
      OR creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.sessions
        WHERE quiz_id = quizzes.id AND state = 'active'
      )
    )
  )
);

DROP POLICY IF EXISTS answers_select_visible ON answers;
CREATE POLICY answers_select_visible ON answers FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.questions q
    JOIN public.quizzes quz ON quz.id = q.quiz_id
    WHERE q.id = question_id AND (
      quz.is_public = true
      OR quz.creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.sessions
        WHERE quiz_id = quz.id AND state = 'active'
      )
    )
  )
);
