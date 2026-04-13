# Steps

Nine incremental milestones, each leaving the app in a working (if limited) state.

---

## v0.1 — Session creation and join code

Get the core flow working end-to-end with a hardcoded quiz and zero styling. A host can create a session and get a join code. A player can enter that code and land on a waiting screen. No real-time yet; pages must be refreshed manually to see updates.

- [x] Supabase project configured and JS client connected
- [x] Schema defined for quizzes, questions, and sessions
- [x] One quiz seeded manually via Supabase dashboard
- [x] Host page lets the host create a session and see the join code
- [x] Short join code is generated and stored
- [x] Player can enter a code and land on a waiting screen

## v0.2 — Load quiz from Supabase

The player view now loads the actual quiz from the database and displays questions and answers. Still minimal styling, but real data flows through the full session.

- [ ] Player screen loads and displays questions from the database
- [ ] Answers are shown and selectable
- [ ] Correct/wrong feedback is shown after selection (client-side for now)

## v0.3 — Styled player UI

Polish the player-facing screens. Focus on clarity and responsiveness — this is what participants see on their phones during a live session.

- [ ] Question and answer layout is clear and responsive on mobile
- [ ] Correct/wrong feedback is visually distinct
- [ ] Waiting screen and join flow look presentable
- [ ] Consistent visual style across player screens

## v0.4 — Real-time session sync

Wire up Supabase Realtime. When the host advances the session state (starts the game, moves to the next question), all connected player screens update automatically without a page reload.

- [ ] Supabase Realtime subscriptions set up on the client
- [ ] Host can advance session state (start, next question)
- [ ] Player screens update automatically when session state changes
- [ ] Current question is displayed correctly on all player screens

## v0.5 — Answer submission and basic scoring

Players can submit an answer during a question. Answers are stored in the database. After the host closes the question, players see whether they were correct and how many points they earned. Score calculation happens client-side for now. A simple between-question leaderboard is shown.

- [ ] Players can submit an answer while a question is open
- [ ] Answers are stored in the database
- [ ] Players see correct/wrong feedback and points earned after the question closes
- [ ] Between-question leaderboard is shown
- [ ] Host sees live response count during a question

## v0.6 — Server-side score calculation

Move score calculation into a Postgres function invoked on answer submission. The client no longer computes or writes scores directly — it only submits the chosen answer. This makes scores tamper-proof without requiring a server.

- [ ] Postgres function calculates and writes scores on answer submission
- [ ] Client only sends the chosen answer, not a score
- [ ] RLS prevents clients from writing scores directly

## v0.7 — Quiz creator UI

Build the quiz editor: create a new quiz, add/edit/delete questions, set answer options (2–4), mark correct answers, set time limits and point values, attach images. Quizzes are saved to Supabase. Still no auth — any visitor can create quizzes.

- [ ] Create and name a new quiz
- [ ] Add, edit, and delete questions
- [ ] Set 2–4 answer options per question and mark the correct one(s)
- [ ] Set a time limit and point value per question
- [ ] Attach an image to a question or answer option
- [ ] Quiz is saved to and loaded from Supabase

## v0.8 — Auth and quiz library

Add Supabase Auth for quiz creators (email/password or magic link). Each quiz belongs to an account. RLS policies are applied across all tables. Creators can only edit their own quizzes. Players still need no account to join a session.

- [ ] Supabase Auth integrated (email/password or magic link)
- [ ] Quizzes are linked to the creator's account
- [ ] RLS policies applied across all tables
- [ ] Creators can only edit and delete their own quizzes
- [ ] Personal quiz library page showing the creator's quizzes

---

## Technical debt

Items deferred to a later version. The version marker indicates the earliest point where it makes sense to address each one.

- [ ] **v0.4** — Host loses session state on page refresh; all session data (session ID, state, question index) lives in component state only. Recovery requires adding URL-based session lookup when real-time is wired up.
- [ ] **v0.5** — Player can re-answer a question by refreshing the page, and currently sees correct/wrong feedback immediately (client-side). Instead: submitted answers should be stored in the DB on selection, and feedback should only be revealed to all players simultaneously when the host closes the question (advances or ends the game). This prevents one player from seeing the correct answer early and sharing it with the group.
- [ ] **v0.6** — `is_correct` is fetched for all answers and visible in the browser network tab before the player answers, making it trivial to cheat. Addressed when score calculation moves server-side (client no longer needs `is_correct` upfront).
- [ ] **v0.8** — Replace open `allow all` RLS policies with proper user-scoped policies (currently every anonymous client can read and write everything).
- [ ] **v0.8** — `player_id` in `localStorage` is unauthenticated; any client can forge a player identity.
- [ ] **future** — Join code collision is unhandled; if a duplicate code is generated the insert fails with a constraint error instead of retrying with a new code.
- [ ] **future** — Stale `waiting` sessions accumulate in the DB with no expiry or cleanup mechanism.

---

## v0.9 — Results, polish, and full flow

Post-session results screen for the host: final leaderboard, per-question response distribution, average response time, and % correct. Host controls are complete: pause, skip, replay question. UI is polished end-to-end. The full flow works without any hardcoded values or missing pieces.

- [ ] Post-session results screen with final leaderboard
- [ ] Per-question breakdown: response distribution, average time, % correct
- [ ] Host controls: pause, skip forward/back, replay question
- [ ] Full end-to-end flow works without hardcoded values
- [ ] UI is consistent and polished across all screens
