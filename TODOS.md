# TODOS — Security Audit

Full RLS and function-level security audit. All tables have RLS enabled but several policies are far too permissive. Work through the items below in priority order; each section is an independent unit of work that can be committed on its own.

---

## 1. [C1/C2] Hide `is_correct` and restrict answer/question visibility

Anyone with the anon key can `SELECT * FROM answers` and read `is_correct` for every question in every quiz. `questions_select_open` and `answers_select_open` both use `USING (true)` with no filter on session state, question index, or quiz privacy. The split-screen UI is bypassed entirely by a direct API call.

Fix: restrict `answers` SELECT to only the columns a player legitimately needs (no `is_correct`), or replace the open read policy with one that limits visibility to currently-active session questions. The cleanest approach is a Postgres view or column-level security on `is_correct`.

> **Relevant files:**
> - `supabase/migrations/20260413195738_rls_auth.sql` — defines `answers_select_open` and `questions_select_open`.
> - New migration timestamp: `20260421000000`.
>
> **Watch out:**
> - The host and quiz creator legitimately need `is_correct` (to show the correct answer after a question closes). Any policy must allow them through.
> - `submit_answer` is a security-definer function and reads `answers` internally — it bypasses RLS regardless, so tightening client-facing policies does not break scoring.
> - `assign_answer_slots` also reads `answers` as security definer — also unaffected.
> - The frontend (`HostActiveQuestion`, `FeedbackView`, `HostResults`) reads answer correctness to highlight the right answer. These reads happen as the authenticated creator — check whether the existing `answers_select_open` being replaced needs a creator-scoped fallback.
> - Questions for a private quiz are still readable by anyone who knows a `question_id` or `quiz_id` — the `questions_select_open` policy ignores `is_public`. Decide whether to also restrict questions to public quizzes or leave that for a later pass.

- [x] Write `supabase/migrations/20260421000000_restrict_answers.sql`.
- [x] `REVOKE SELECT (is_correct) ON answers FROM anon` (column-level; authenticated users retain access).
- [x] Add `get_correct_answer_id(p_session_id, p_question_id)` security-definer RPC gated on `question_open = false`.
- [x] Update `Play.jsx`: derive `isCorrect` from `points_earned > 0`; fetch correct slot via the new RPC instead of direct `is_correct` query.
- [x] Run `nix run nixpkgs#supabase-cli -- db push`.
- [x] Commit.

**Note:** `answers_select_open` was left in place — the column-level REVOKE is sufficient and more targeted than dropping the row-level policy (which would break the host/creator reads). Authenticated hosts/creators continue to read `is_correct` through the existing policy.

---

## 2. [C3] Lock down `sessions` — restrict UPDATE/DELETE to owner

`sessions_all_open` is `FOR ALL USING (true) WITH CHECK (true)`. Any anon user can advance questions, close the answer window, modify `question_opened_at` (corrupting time-based scoring), or delete active sessions.

Fix: allow anon SELECT and INSERT freely (join flow requires reading by `join_code`; host creates sessions). Restrict UPDATE and DELETE to the authenticated creator of the underlying quiz.

> **Relevant files:**
> - `supabase/migrations/20260413195738_rls_auth.sql` — defines `sessions_all_open`.
> - New migration timestamp: `20260421000001`.
>
> **Watch out:**
> - The host page calls `UPDATE sessions SET state/current_question_index/question_open/...` — the host is an authenticated user. The creator of the quiz is `quizzes.creator_id`. Sessions have a `quiz_id` FK, so the policy can join: `EXISTS (SELECT 1 FROM quizzes WHERE id = quiz_id AND creator_id = auth.uid())`.
> - DELETE should follow the same creator-ownership check.
> - INSERT can stay open (anon): anyone can start a session for a public quiz. Optionally restrict to authenticated users only — but that would break the current host flow if the host page ever creates sessions without auth. Check `HostLibrary.jsx` to confirm the session creation call.
> - SELECT must stay open for players (they read sessions by `join_code`).
> - The cleanup cron job (`session_cleanup_cron.sql`) runs as `postgres` superuser — RLS does not apply to it.

- [ ] Write `supabase/migrations/20260421000001_sessions_rls.sql`.
- [ ] Drop `sessions_all_open`.
- [ ] Create `sessions_select_open` — `FOR SELECT USING (true)`.
- [ ] Create `sessions_insert_auth` — `FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)` (only authenticated users can start sessions).
- [ ] Create `sessions_update_own` — `FOR UPDATE USING (EXISTS (SELECT 1 FROM quizzes WHERE id = quiz_id AND creator_id = auth.uid()))`.
- [ ] Create `sessions_delete_own` — `FOR DELETE USING (EXISTS (SELECT 1 FROM quizzes WHERE id = quiz_id AND creator_id = auth.uid()))`.
- [ ] Run `nix run nixpkgs#supabase-cli -- db push`.
- [ ] Smoke-test: host can start, advance, and finish a session; player join flow still works.
- [ ] Commit.

---

## 3. [C4/M3] Lock down `players` — restrict UPDATE to server-side RPCs only

`players_all_open` is `FOR ALL USING (true) WITH CHECK (true)`. Any anon user knowing a player UUID (exposed via realtime) can `UPDATE players SET score = 999999` or reset another player's `streak`/`correct_count`.

All legitimate score/streak/correct_count writes go through `submit_answer` (security definer), which bypasses RLS. Direct client UPDATE should be blocked entirely.

> **Relevant files:**
> - `supabase/migrations/20260413195738_rls_auth.sql` — defines `players_all_open`.
> - `supabase/migrations/20260415000000_server_side_scoring.sql` — earlier narrower policies (`players_select`, `players_insert`) that now coexist with `players_all_open`.
> - New migration timestamp: `20260421000002`.
>
> **Watch out:**
> - Players join by `INSERT INTO players` directly from the client (`Join.jsx`) — INSERT must stay open for anon.
> - SELECT must stay open (leaderboard, realtime subscriptions).
> - UPDATE from the client should be **fully blocked**. All score/streak mutations happen inside `submit_answer` (security definer) which bypasses RLS.
> - DELETE: players are currently never deleted by the client. Leave blocked.
> - The earlier `players_select` and `players_insert` policies from `server_side_scoring.sql` are now redundant (superseded by `players_all_open`). Drop all three and replace with two clean policies.

- [x] Write `supabase/migrations/20260421000002_players_rls.sql`.
- [x] Drop `players_all_open`, `players_select`, `players_insert`.
- [x] Create `players_select_open` — `FOR SELECT USING (true)`.
- [x] Create `players_insert_open` — `FOR INSERT WITH CHECK (true)`.
- [x] Run `nix run nixpkgs#supabase-cli -- db push`.
- [ ] Smoke-test: player join works; score updates appear via realtime after answering.
- [x] Commit.

---

## 4. [H1] Add authorization check to `assign_answer_slots()`

`assign_answer_slots` is a security-definer function callable by any client. It accepts any `session_id` and `question_id` with no check that the caller owns the session. A player can call it to reshuffle slot assignments mid-question.

Fix: verify the caller is the authenticated creator of the quiz linked to the session.

> **Relevant files:**
> - `supabase/migrations/20260417000000_split_screen.sql` — defines `assign_answer_slots`.
> - New migration timestamp: `20260421000003`.
>
> **Watch out:**
> - The function is security definer, so `auth.uid()` returns the caller's JWT UID inside the function body.
> - Add a guard at the top: `SELECT quizzes.creator_id INTO v_creator FROM sessions JOIN quizzes ON quizzes.id = sessions.quiz_id WHERE sessions.id = p_session_id; IF v_creator IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorised'; END IF;`
> - If `creator_id` is NULL (legacy seed data with no owner), the check will block the call. Decide: require auth always (safest), or allow NULL creator as a bypass for legacy sessions.

- [ ] Write `supabase/migrations/20260421000003_assign_slots_authz.sql`.
- [ ] `CREATE OR REPLACE FUNCTION assign_answer_slots(...)` with the creator ownership check added before any data mutation.
- [ ] Run `nix run nixpkgs#supabase-cli -- db push`.
- [ ] Smoke-test: host can open a question (slot assignment succeeds); a non-owner call is rejected.
- [ ] Commit.

---

## 5. [M1] Guard `submit_answer()` against out-of-window submissions

`submit_answer` validates slot membership but does not check:
1. That `sessions.question_open = true` (the answer window is currently open).
2. That `p_question_id` matches `sessions.current_question_index` (no submitting for past/future questions).

A player can submit after the host has closed the window, or target any question in the quiz.

> **Relevant files:**
> - Most recent `submit_answer` definition is in `supabase/migrations/20260419000001_correct_count.sql`.
> - New migration timestamp: `20260421000004`.
>
> **Watch out:**
> - `sessions.current_question_index` is an integer index into the questions array ordered by `order_index`. To validate, fetch `questions.id` at position `current_question_index` for the session's quiz and compare to `p_question_id`.
> - `question_open` check is simpler: just fetch `sessions.question_open` and raise if false.
> - Both checks should go right after the player session lookup, before the slot-membership check.
> - Both checks use `v_session_id` which is already fetched at the top of the function.

- [x] Write `supabase/migrations/20260421000004_submit_answer_guards.sql`.
- [x] `CREATE OR REPLACE FUNCTION submit_answer(...)` with two new guards:
  - Fetch `question_open`, `current_question_index`, `quiz_id` from `sessions`; raise if `NOT question_open`.
  - Fetch `questions.id` at `order_index = current_question_index`; raise if it doesn't match `p_question_id`.
- [x] Run `nix run nixpkgs#supabase-cli -- db push`.
- [ ] Smoke-test: answer accepted during open window; answer rejected after host closes question; answer rejected for a wrong question ID.
- [x] Commit.

---

## 6. Lint + build verification

> **Run after all sections above are complete.**

- [ ] `nix shell nixpkgs#nodejs -c npm run lint` — fix any new lint errors.
- [ ] `nix shell nixpkgs#nodejs -c npm run build` — verify production build succeeds.
- [ ] Full manual smoke test:
  - Create a quiz, start a session, join as a player.
  - Confirm the answer window: player can submit during open window, gets rejected after host closes it.
  - Confirm score integrity: direct `UPDATE players SET score = 99999` via REST is rejected with 403.
  - Confirm session integrity: anon `UPDATE sessions SET state = 'finished'` is rejected with 403.
  - Confirm `is_correct` is not readable by an unauthenticated client.
  - Confirm `assign_answer_slots` called from an anon client (not the quiz creator) is rejected.
