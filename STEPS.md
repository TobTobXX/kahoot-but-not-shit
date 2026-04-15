# Steps

Ten incremental milestones, each leaving the app in a working (if limited) state.

## Completed (v0.1–v0.9)

Core quiz platform fully functional with real-time sync, server-side scoring, split-screen host/player, quiz creation and management, and authenticated creators. Key features:

- Session creation and join codes (v0.1)
- Real-time Supabase sync across all clients (v0.4)
- Server-side score calculation via Postgres function (v0.6)
- Quiz creator UI: create/edit quizzes, questions, answer options, images (v0.7)
- Split-screen security: players receive only slot assignments (color/icon), never question/answer text (v0.8)
- Supabase Auth for quiz creators, user-scoped RLS policies, personal quiz library (v0.9)
- Consistent navigation across the app (v0.10)
- Post-session results screen: final leaderboard, per-question breakdown, host controls, full end-to-end polish (v0.11)
- Streaks: consecutive-correct bonus with flame display, correct count on game-over leaderboard (v0.12)

## Technical debt

Items deferred to a later version. The version marker indicates the earliest point where it makes sense to address each one.

- [ ] **future** — Full security audit: clients can query questions/answers for future questions before they are shown (no row-level restriction by session state), and other unenumerated cheat vectors introduced by the all-anon-read RLS posture.
- [ ] **future** — `anon` can read `is_correct` directly from the `answers` table. The `REVOKE SELECT (is_correct)` in old migrations was a no-op because Supabase's default `GRANT ALL ON TABLE answers TO anon` (table-level) cannot be overridden by a column-level revoke. Fix: `REVOKE SELECT ON answers FROM anon`, then `GRANT SELECT (id, question_id, order_index, answer_text) ON answers TO anon`. Requires auditing all client-side queries that touch `answers` to ensure none rely on the table-level grant.
- [ ] Images accumulate in the bucket. How to emtpy?
- [ ] Batch quiz imports / edits

## Future ideas:

- Music
- Make it hostable on non-root servers (ie. don't fetch /assets/..., but assets/...)
- Multiple correct answers
- Question with 0 points or no right/wrong
- Pro/paid users users. They can upload images.
- Profile view, quizzes form profile.

