-- Replace all "allow all" policies with user-scoped policies for v0.9
-- Sessions, players, player_answers remain fully open (anonymous play)

-- quizzes: anyone can read public; authenticated creators manage their own
drop policy if exists "allow all" on quizzes;
create policy "quizzes_select_public"    on quizzes for select using (is_public = true);
create policy "quizzes_select_own"      on quizzes for select using (auth.uid() = creator_id);
create policy "quizzes_insert_auth"    on quizzes for insert with check (auth.uid() is not null and auth.uid() = creator_id);
create policy "quizzes_update_own"      on quizzes for update using (auth.uid() = creator_id);
create policy "quizzes_delete_own"      on quizzes for delete using (auth.uid() = creator_id);

-- questions: open read (via quiz); auth users manage their own via FK
drop policy if exists "allow all" on questions;
create policy "questions_select_open"  on questions for select using (true);
create policy "questions_insert_auth"  on questions for insert with check (
  auth.uid() is not null and
  exists (select 1 from quizzes where id = quiz_id and creator_id = auth.uid())
);
create policy "questions_update_own"    on questions for update using (
  exists (select 1 from quizzes where id = quiz_id and creator_id = auth.uid())
);
create policy "questions_delete_own"    on questions for delete using (
  exists (select 1 from quizzes where id = quiz_id and creator_id = auth.uid())
);

-- answers: open read; auth users manage their own via FK
drop policy if exists "allow all" on answers;
create policy "answers_select_open"    on answers for select using (true);
create policy "answers_insert_auth"    on answers for insert with check (
  auth.uid() is not null and
  exists (
    select 1 from questions q
    join quizzes quz on quz.id = q.quiz_id
    where q.id = question_id and quz.creator_id = auth.uid()
  )
);
create policy "answers_update_own"      on answers for update using (
  exists (
    select 1 from questions q
    join quizzes quz on quz.id = q.quiz_id
    where q.id = question_id and quz.creator_id = auth.uid()
  )
);
create policy "answers_delete_own"      on answers for delete using (
  exists (
    select 1 from questions q
    join quizzes quz on quz.id = q.quiz_id
    where q.id = question_id and quz.creator_id = auth.uid()
  )
);

-- sessions: open (any player/host can create/join)
-- players: open (anonymous join)
-- player_answers: open (anonymous submission)
-- session_question_answers: open read; writes go through security definer RPCs
drop policy if exists "allow all" on sessions;
drop policy if exists "allow all" on players;
drop policy if exists "allow all" on session_question_answers;

create policy "sessions_all_open"             on sessions for all using (true) with check (true);
create policy "players_all_open"              on players for all using (true) with check (true);
create policy "session_question_answers_read" on session_question_answers for select using (true);
