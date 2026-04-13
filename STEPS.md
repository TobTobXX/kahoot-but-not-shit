# Steps

Ten incremental milestones, each leaving the app in a working (if limited) state.

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

- [x] Player screen loads and displays questions from the database
- [x] Answers are shown and selectable
- [x] Correct/wrong feedback is shown after selection (client-side for now)

## v0.3 — Styled player UI

Polish the player-facing screens. Focus on clarity and responsiveness — this is what participants see on their phones during a live session.

- [x] Question and answer layout is clear and responsive on mobile
- [x] Correct/wrong feedback is visually distinct
- [x] Waiting screen and join flow look presentable
- [x] Consistent visual style across player screens

## v0.4 — Real-time session sync

Wire up Supabase Realtime. When the host advances the session state (starts the game, moves to the next question), all connected player screens update automatically without a page reload.

- [x] Supabase Realtime subscriptions set up on the client
- [x] Host can advance session state (start, next question)
- [x] Player screens update automatically when session state changes
- [x] Current question is displayed correctly on all player screens

## v0.5 — Answer submission and basic scoring

Players can submit an answer during a question. Answers are stored in the database. After the host closes the question, players see whether they were correct and how many points they earned. Score calculation happens client-side for now. A simple between-question leaderboard is shown.

- [x] Players can submit an answer while a question is open
- [x] Answers are stored in the database
- [x] Players see correct/wrong feedback and points earned after the question closes
- [x] Between-question leaderboard is shown
- [x] Host sees live response count during a question

## v0.6 — Server-side score calculation

Move score calculation into a Postgres function invoked on answer submission. The client no longer computes or writes scores directly — it only submits the chosen answer. This makes scores tamper-proof without requiring a server.

- [x] Postgres function calculates and writes scores on answer submission
- [x] Client only sends the chosen answer, not a score
- [x] RLS prevents clients from writing scores directly

## v0.7 — Quiz creator UI

Build the quiz editor: create a new quiz, add/edit/delete questions, set answer options (2–4), mark correct answers, set time limits and point values, attach images. Quizzes are saved to Supabase. Still no auth — any visitor can create quizzes.

- [ ] Create and name a new quiz
- [ ] Add, edit, and delete questions
- [ ] Set 2–4 answer options per question and mark the correct one(s)
- [ ] Set a time limit and point value per question
- [ ] Attach an image to a question or answer option
- [ ] Quiz is saved to and loaded from Supabase

---

## v0.8 — Split-screen host/player

Redesign the data contract between host and player screens. Players receive only visual answer slots (color + icon) — never the question text or answer labels. This is the foundational security split: the player's device is a display for the host's screen, not a full data client. Done before auth so this protection is in place when RLS policies are added.

### Design decisions

- **4 fixed colors:** red `#FF4949`, blue `#2D7DD2`, yellow `#FFD60A`, green `#2ECC71`
- **4 fixed icons** (colorblind-friendly): circle, diamond, triangle, square
- **Randomization:** Host decides per question (not quiz creator) whether to shuffle answer slots
- **Countdown timer:** Host screen only; player screen has no timer
- **Player devices:** Receive only `current_question_index`, `question_open`, and answer slot assignments (color/icon/position). Never receive `question_text` or `answer_text`.

### Database

- [ ] Create `session_question_answers` table: `session_id`, `question_id`, `slot_index` (0–3), `answer_id`, `color`, `icon`. Unique constraint on `(session_id, question_id, slot_index)`.
- [ ] Populate `session_question_answers` when a session starts (copy answers from the quiz, assign fixed colors/icons to each slot)
- [ ] Add `current_question_slots jsonb` column to `sessions` — updated when a question opens with the 4 slot assignments. Players receive it via the existing `sessions` realtime subscription without a separate fetch.
- [ ] Enable realtime on `session_question_answers` (or rely on `sessions` JSONB column)
- [ ] `submit_answer` RPC validates the submitted `answer_id` via `session_question_answers` mapping (not direct from the player's knowledge of answer positions)
- [ ] Apply open RLS policies on new table (RLS proper comes in v0.9)

### Host page

- [ ] Add "shuffle answers" toggle/option per question (host-controlled randomization at session time)
- [ ] When opening a question, call the shuffle/assign logic and update `current_question_slots`
- [ ] Render the 4 answer slots with colors/icons (same visual as players, but labeled with answer text)
- [ ] Countdown timer displayed here (not sent to players)
- [ ] Show live response count per question (unchanged)

### Player page

- [ ] Remove `question_text` rendering — never displayed
- [ ] Remove answer label text rendering — never displayed
- [ ] Remove countdown timer from player screen
- [ ] Render a 2×2 grid of large colored buttons, each with an icon (circle/diamond/triangle/square), no text labels
- [ ] On answer click, send the mapped `answer_id` (looked up from the slot assignment received via realtime)
- [ ] After question closes, show correct/wrong feedback and points earned (same as before, but no answer text shown — just the slot color/icon they picked)
- [ ] Between-question leaderboard unchanged

### Realtime sync

- [ ] Player subscription on `sessions` remains: reacts to `state`, `current_question_index`, `question_open`, and now `current_question_slots`
- [ ] No separate fetch needed — slot data arrives in the same realtime payload
- [ ] `current_question_slots` is a JSONB array of 4 objects: `[{slot_index, answer_id, color, icon}, ...]`

### Migration file

- `supabase/migrations/..._split_screen.sql`

---

## v0.9 — Auth and quiz library

Add Supabase Auth for quiz creators (email/password or magic link). Each quiz belongs to an account. RLS policies are applied across all tables. Creators can only edit their own quizzes. Players still need no account to join a session.

- [ ] Supabase Auth integrated (email/password or magic link)
- [ ] Quizzes are linked to the creator's account
- [ ] RLS policies applied across all tables
- [ ] Creators can only edit and delete their own quizzes
- [ ] Personal quiz library page showing the creator's quizzes

---

## Technical debt

Items deferred to a later version. The version marker indicates the earliest point where it makes sense to address each one.

- [ ] **v0.9** — `submit_answer` RPC accepts any `p_player_id`; a client can call it with another player's UUID to submit answers or inflate their score. Addressed when auth is added and the function can assert `auth.uid() = p_player_id`.
- [ ] **v0.9** — Replace open `allow all` RLS policies with proper user-scoped policies (currently every anonymous client can read and write everything).
- [ ] **v0.9** — `player_id` in `localStorage` is unauthenticated; any client can forge a player identity.
- [ ] **v0.9** — `session_question_answers` is populated eagerly when a session starts — a quiz creator who edits answers mid-session may cause inconsistencies. Consider regenerating assignments when a question is reopened.
- [ ] **future** — Full security audit: clients can query questions/answers for future questions before they are shown (no row-level restriction by session state), and other unenumerated cheat vectors introduced by the all-anon-read RLS posture.

- [ ] **future** — Join code collision is unhandled; if a duplicate code is generated the insert fails with a constraint error instead of retrying with a new code.
- [ ] **future** — Stale `waiting` sessions accumulate in the DB with no expiry or cleanup mechanism.

---

## v0.10 — Results, polish, and full flow

Post-session results screen for the host: final leaderboard, per-question response distribution, average response time, and % correct. Host controls are complete: pause, skip, replay question. UI is polished end-to-end. The full flow works without any hardcoded values or missing pieces.

- [ ] Post-session results screen with final leaderboard
- [ ] Per-question breakdown: response distribution, average time, % correct
- [ ] Host controls: pause, skip forward/back, replay question
- [ ] Full end-to-end flow works without hardcoded values
- [ ] UI is consistent and polished across all screens
