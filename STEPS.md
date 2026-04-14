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
- Streaks: consecutive-correct bonus with flame display, correct count on game-over leaderboard (v0.12)
- Post-session results screen: final leaderboard, per-question breakdown, host controls, full end-to-end polish (v0.11)

## Technical debt

Items deferred to a later version. The version marker indicates the earliest point where it makes sense to address each one.

- [ ] **v0.9** — `player_id` in `localStorage` is unauthenticated; any client can forge a player identity. Left unresolved — players are intentionally unauthenticated by design.
- [ ] **v0.9** — `session_question_answers` is populated eagerly when a session starts — a quiz creator who edits answers mid-session may cause inconsistencies. Consider regenerating assignments when a question is reopened.
- [ ] **future** — Full security audit: clients can query questions/answers for future questions before they are shown (no row-level restriction by session state), and other unenumerated cheat vectors introduced by the all-anon-read RLS posture.
- [ ] **future** — Join code collision is unhandled; if a duplicate code is generated the insert fails with a constraint error instead of retrying with a new code.
- [ ] **future** — Stale `waiting` sessions accumulate in the DB with no expiry or cleanup mechanism.
- [ ] **future** — `player_${code}` localStorage entries for finished sessions are only cleared when Play.jsx receives the realtime `finished` event. If the user closes the tab before that fires, the entry lingers indefinitely. Consider a TTL-based cleanup on next read (e.g. check session state on mount in Join.jsx and clear stale entries).
- [ ] **future** — Quiz save (insert quiz → insert questions → insert answers) runs as three separate statements. If the answers insert fails, orphaned question rows are left. Fix with an atomic Postgres RPC that does all three inserts in one transaction.

## Future ideas:

- Pro/paid users can upload images (supabase bucket / S3) which will be shown at the question.

