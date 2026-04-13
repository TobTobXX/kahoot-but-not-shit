# TODOs — v0.2: Load quiz from Supabase

---

## Technical debt

Carried forward — do not work these until the version they are scheduled for:

- [ ] **v0.8** — Replace open `allow all` RLS policies with proper user-scoped policies (currently every anonymous client can read and write everything)
- [ ] **v0.8** — `player_id` in `localStorage` is unauthenticated; any client can forge a player identity
- [ ] **future** — Join code collision is unhandled; if a duplicate code is generated the insert fails with a constraint error instead of retrying with a new code
- [ ] **future** — Stale `waiting` sessions accumulate in the DB with no expiry or cleanup mechanism

---

## 1. Host — session controls

The host needs to start the game, step through questions, and end the session. These are direct DB mutations for now — no real-time, just button clicks.

- [x] When the join code is displayed, also show a "Start game" button
- [x] "Start game": update the session row — set `state = 'active'` and `current_question_index = 0`; fetch the total question count for the quiz and store it in component state
- [x] After starting, show the current question number and total (e.g. "Question 1 / 5") instead of the "Waiting for players…" message
- [x] Show a "Next question" button; on click: increment `current_question_index` by 1 in the DB and in local state
- [x] Disable "Next question" when already on the last question
- [x] Show an "End game" button; on click: set `state = 'finished'` in the DB

## 2. Play page — session state handling

Expand the existing `load()` function to fetch `state` and `current_question_index` alongside the session `id`. Branch on session state:

- [x] If `state === 'waiting'`: keep the existing "Waiting for the host to start…" screen
- [x] If `state === 'active'`: proceed to load and display the current question (section 3)
- [x] If `state === 'finished'`: show a "Game over" screen (no score yet — that comes in v0.5)

## 3. Play page — question and answer display

Triggered when `state === 'active'`. Load the full question list once and display the question at `current_question_index`.

- [x] Fetch all questions for the session's quiz ordered by `order_index`, with answers nested and ordered by `order_index` (single Supabase query via nested select)
- [x] If `current_question_index` is at or beyond the last question, show "Waiting for the game to end…"
- [x] Otherwise, display the question text for the question at `current_question_index`
- [x] Render each answer as a clickable button (2–4 per question)
- [x] On click: record the selected answer in component state and disable all answer buttons
- [x] Reveal client-side feedback: colour the selected button green if `is_correct === true`, red if not — no DB write (answer storage is v0.5)

## 4. Smoke test

Manually verify the full flow end-to-end:

- [ ] Host creates a session → join code appears with "Start game" button
- [ ] Player joins → sees "Waiting for the host to start…"
- [ ] Host clicks "Start game" → sees "Question 1 / N" with Next/End controls
- [ ] Player refreshes → sees question text and answer buttons
- [ ] Player clicks an answer → buttons lock; selected button turns green or red
- [ ] Host clicks "Next question" → counter increments on host screen
- [ ] Player refreshes → sees next question
- [ ] Host clicks "End game" → session state becomes `'finished'`
- [ ] Player refreshes → sees "Game over" screen
