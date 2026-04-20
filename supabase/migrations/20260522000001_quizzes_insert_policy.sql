-- Rename quizzes_insert_auth → quizzes_insert_own and drop the redundant
-- auth.uid() IS NOT NULL check (auth.uid() = creator_id already implies
-- authentication, since NULL = anything is false in Postgres).
DROP POLICY "quizzes_insert_auth" ON public.quizzes;

CREATE POLICY "quizzes_insert_own" ON public.quizzes
  FOR INSERT WITH CHECK (auth.uid() = creator_id);
