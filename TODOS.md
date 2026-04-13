# TODOs — v0.5: Answer submission and basic scoring

---

## 1. Schema: `player_answers` table

Add the new table to store submitted answers. The `UNIQUE (player_id, question_id)` constraint prevents double-submission as an extra safety net beyond the UI disabling the button. No new policy needed — `open_policies.sql` already covers all tables with `allow all`.

> **Files:** `supabase/migrations/`. **User action required:** After writing the migration, push it with `nix run nixpkgs#supabase-cli -- db push`. **Context:** A separate `player_answers` table is necessary because it lets us track submissions per question (enabling the host's response count), prevent re-answering on page refresh, and later enables tamper-proof scoring via a Postgres function in v0.6. The `question_id` is stored denormalised on the row to avoid JOINs when filtering by question in realtime.

- [x] Create `supabase/migrations/20260414000000_player_answers.sql` with the `player_answers` table (id, player_id FK, question_id FK, answer_id FK, created_at) and a `UNIQUE (player_id, question_id)` constraint
- [x] Run `nix run nixpkgs#supabase-cli -- db push` to apply the migration to the remote DB

---

## 2. Host page — players list with realtime subscription

Add a realtime subscription on the `players` table so the host sees player count update live as people join, before and during the game.

> **Files:** `src/pages/Host.jsx`. **Watch out:** Use a separate channel named `players-${sessionId}` — don't combine with the existing session channel. Return the unsubscribe function in the `useEffect` cleanup. **Context:** The `players` array is added now so the leaderboard in Section 6 can reuse it without a separate fetch. No scores are fetched here — scores come from DB writes in v0.6.

- [x] Add `playerCount` state initialised to `0`
- [x] Add `players` state initialised to `[]`
- [x] In the existing session subscription `useEffect`, after confirming `sessionId` exists, subscribe to a channel named `players-${sessionId}` filtered to `players` table with `session_id=eq.${sessionId}`
- [x] In the subscription's `on('INSERT')` handler, increment `playerCount` and append the new player to `players`
- [x] Return `() => supabase.removeChannel(channel)` from the `useEffect`
- [x] In the session-fetch `then()` block, also load existing players for the session: `select('*').eq('session_id', sessionId).order('joined_at')` and set both states
- [x] Update the `waiting` block UI: change "Waiting for players…" text to "X player(s) joined" and update the Start Game button label to "Start game (X players)"

---

## 3. Host page — "Close question" button and live response count

The host needs a "Close question" action (distinct from advancing to the next question) so they can reveal feedback to players at a time of their choosing. A live answer count shows how many of the joined players have responded.

> **Files:** `src/pages/Host.jsx`. **Watch out:** When `currentQuestionIndex` changes (host advances), reset `answerCount` to `0`. The `player_answers` subscription must be filtered by the current `question_id` — update the filter target when the question changes. Don't combine this with the players channel — use a separate named channel. **Context:** The `nextQuestion` button currently advances the index. After this change, "Next question" resets `question_open` to `true` AND increments the index. The new "Close question" button sets `question_open` to `false` without changing the index.

- [x] Add `const [answerCount, setAnswerCount] = useState(0)` state
- [x] Add `const [questionOpen, setQuestionOpen] = useState(true)` state (initialise from session subscription payload — default `true` for backwards compatibility with existing sessions that have no `question_open` column yet; after migration the DB default handles this)
- [x] Add a realtime subscription on `player_answers` table filtered to the current question_id (`question_id=eq.${questions[currentQuestionIndex]?.id}`). Increment `answerCount` on each INSERT. Use channel name `answers-${sessionId}`.
- [x] In the `on('UPDATE')` handler on sessions, destructure `question_open` from `payload.new` and update `setQuestionOpen`
- [x] When `currentQuestionIndex` changes, reset `answerCount` to `0`
- [x] Update `nextQuestion()`: include `question_open: true` in the `.update()` call so opening the next question also resets the open flag
- [x] Add a new `closeQuestion()` function: `.update({ question_open: false })` on sessions, guarded by `if (!questionOpen) return`
- [x] In the `active` state UI: add a "Close question" button above the Next/End buttons. Disabled when `!questionOpen`. Show "X / Y answered" text below the question counter, where Y is `playerCount`
- [x] When `!questionOpen` (after the host has closed), change the "answered" text to "Results shown" (feedback is now visible to players)

---

## 4. Play page — answer submission (INSERT to `player_answers`)

Replace the client-side-only answer selection with a DB INSERT. The UI should still show the player's selection immediately but correctness is not revealed yet.

> **Files:** `src/pages/Play.jsx`. **Watch out:** Use `playerId` from `localStorage` (set at join time). Fetch the question's `id` from `questions[currentQuestionIndex]`. The INSERT will fail silently for already-answered questions due to the unique constraint — handle the error gracefully and show an "Already answered" state instead of an error message. **Context:** The `is_correct` column is still fetched in the questions query for v0.5 (the technical debt note says this is solved in v0.6). This is an acceptable interim state — the cheat vector is acknowledged.

- [x] Add state: `const [answerSubmitted, setAnswerSubmitted] = useState(false)` and `const [alreadyAnswered, setAlreadyAnswered] = useState(false)`
- [x] Rename `selectedAnswerId` → `submittedAnswerId` for semantic clarity (or keep the name, your call — this is a cosmetic refactor)
- [x] In `handleAnswer`, rename the function to `submitAnswer(answer)` and guard with `if (answerSubmitted || alreadyAnswered) return`
- [x] Inside `submitAnswer`: set `submittedAnswerId`, then INSERT into `player_answers` with `{ player_id, question_id: questions[currentQuestionIndex].id, answer_id: answer.id }`
- [x] On INSERT success: set `answerSubmitted(true)`, show a subtle "Answer submitted" confirmation below the answer buttons (no correctness yet)
- [x] On INSERT error (constraint violation code `23505`): set `alreadyAnswered(true)` and show "You already answered this question"
- [x] Disable all answer buttons when `answerSubmitted || alreadyAnswered` (in addition to the existing guard)

---

## 5. Play page — feedback reveal and leaderboard

When the host closes the question (`question_open` becomes `false`), reveal whether the player's answer was correct, the points earned, and show a full leaderboard. The question area is fully replaced by the leaderboard during this phase.

> **Files:** `src/pages/Play.jsx`. **Watch out:** When the session subscription receives an UPDATE where `question_open` transitions `true → false`, trigger the feedback reveal. The leaderboard fetch should happen at the same time (separate from the existing players subscription on the host side — the play page needs its own). On the `nextQuestion` transition (index increments), reset `feedbackShown`, `answerSubmitted`, `submittedAnswerId`, and `alreadyAnswered` so the player can answer the next question. Use `useRef` for `wasActiveRef` to track whether the session was already active (needed inside async callbacks). **Context:** The leaderboard replaces the question area entirely (not an overlay) — confirmed with user. Flat scoring: `isCorrect ? question.points : 0`. No time bonus in v0.5.

- [x] Add state: `const [feedbackShown, setFeedbackShown] = useState(false)`, `const [isCorrect, setIsCorrect] = useState(null)`, `const [pointsEarned, setPointsEarned] = useState(0)`, `const [leaderboard, setLeaderboard] = useState([])`
- [x] Add a `useRef`: `const wasActiveRef = useRef(false)`. Set `wasActiveRef.current = true` after questions load in the session subscription callback.
- [x] In the session subscription's `on('UPDATE')` handler, detect the `question_open` transition: `if (wasActiveRef.current && payload.new.question_open === false) { /* reveal feedback */ }`
- [x] In the feedback reveal block: set `feedbackShown(true)`, reset `answerSubmitted(false)`, `submittedAnswerId(null)`, `alreadyAnswered(false)`. Fetch `player_answers` row for `{ player_id, question_id: questions[payload.old.current_question_index].id }`, join with `answers` to get `is_correct`, derive `pointsEarned = isCorrect ? questions[oldIndex].points : 0`. Fetch `players` for `session_id` ordered by `score desc`, `nickname asc` → set `leaderboard`.
- [x] Update `answerClassName`: when `feedbackShown` is `true`, show the player's submitted answer in green (if correct) or red (if wrong) with a ring. Show the correct answer (the one with `is_correct === true`) in emerald green with a ring even if it wasn't the player's answer. All other answers dim to 40% opacity.
- [x] In the feedback reveal block, also show a result banner above the answers: "Correct! +X points" in green or "Wrong" in red, using the `isCorrect` and `pointsEarned` state.
- [x] When `currentQuestionIndex` changes to a new value (session UPDATE with new index), reset: `setFeedbackShown(false)`, `setAnswerSubmitted(false)`, `setSubmittedAnswerId(null)`, `setAlreadyAnswered(false)`, `setIsCorrect(null)`, `setPointsEarned(0)`
- [x] Add a `leaderboardView` section that replaces the entire inner content (question + answers) when `feedbackShown` is `true`. Render a ranked list: rank number, nickname (highlight the player's own row with a subtle background), and score. Show the result banner above it. "Waiting for next question…" text below the leaderboard if `questionOpen` is `false` and we're still in `active` state.
- [x] The existing `useEffect` that resets `submittedAnswerId` on `currentQuestionIndex` change should also reset `feedbackShown` and `alreadyAnswered`

---

## 6. Home page — allow joining active sessions

Players must be able to join mid-game, not just before the host starts.

> **Files:** `src/pages/Home.jsx`. **Watch out:** Change only the `.eq('state', 'waiting')` filter to `.in('state', ['waiting', 'active'])`. Everything else stays the same.

- [x] Change `.eq('state', 'waiting')` to `.in('state', ['waiting', 'active'])` in the session lookup

---

## 7. Smoke test

Run the dev server and walk through the full flow manually in two browser windows.

> **User action required:** `nix shell nixpkgs#nodejs -c npm run dev`. **Context:** The full flow: (1) player joins via home page → sees waiting screen; (2) host starts game → player sees question, no feedback yet; (3) player clicks an answer → "Answer submitted" shown, buttons disabled; (4) host clicks "Close question" → player sees correct/wrong + points + leaderboard; (5) host clicks "Next question" → player sees new question, can answer again; (6) host repeats → leaderboard persists/grows across questions; (7) host ends game → game over screen.

- [ ] Player joins via home page and lands on waiting screen
- [ ] Host starts game → player sees first question, answers are interactive
- [ ] Player clicks an answer → "Answer submitted" shown, buttons disabled
- [ ] Host sees live "X / Y answered" count
- [ ] Host clicks "Close question" → player sees correct/wrong feedback and points earned
- [ ] Player sees leaderboard replacing the question area
- [ ] Host clicks "Next question" → player sees the next question, can submit again
- [ ] Process repeats for all questions
- [ ] Host ends game → player sees game over screen
