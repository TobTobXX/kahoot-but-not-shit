# Tasks

## Schema migration: frontend must be updated

~~The squash migration (`20260420233331_squash.sql`) changed the schema considerably.~~
~~The frontend still targets the old schema. Every item below is a concrete bug/breakage.~~

All items below were completed in commit `643b013`.

### `Profile.jsx`

- [x] Queries `profiles` for `is_pro` and `stripe_cancel_at_period_end` — those columns were moved to the separate `subscriptions` table. Fix: query `profiles` for `username` only, then query `subscriptions` for `is_pro` and `stripe_cancel_at_period_end` (or join via Supabase select).

### `HostSession.jsx` (major overhaul)

The component was written against an old `sessions` schema that had `current_question_index`, `question_open`, and `current_question_slots` columns. None of those exist any more. The session now points at a `session_questions` row via `active_question_id`.

- [x] **Initial load**: remove reads of `current_question_index`, `question_open`, `current_question_slots` from the `sessions` query; load `active_question_id` instead and fetch the corresponding `session_questions` row.
- [x] **Realtime**: the `sessions` realtime publication only delivers `(id, state, active_question_id)`. Remove references to `payload.new.current_question_index`, `payload.new.question_open`, `payload.new.current_question_slots`. React to `active_question_id` changes to fetch the new `session_questions` row.
- [x] **State machine**: replace all `sessionState === 'active'` checks with `'asking'` (question open) and `'reviewing'` (question closed). The `HostActiveQuestion` view maps to `'asking'`; `HostQuestionReview` maps to `'reviewing'`.
- [x] **`startGame()` → `next_question`**: delete `start_game` RPC call; replace with `next_question({ p_session_id, p_host_secret, p_shuffle })`. The RPC returns the new `session_questions` row directly (no separate fetch needed).
- [x] **`nextQuestion()` → `next_question`**: delete `open_next_question` RPC call; use same `next_question` RPC.
- [x] **`closeQuestion()` → `score_question`**: delete `close_question` RPC; replace with `score_question({ p_session_id, p_host_secret })`. After this, the session state transitions to `'reviewing'` via realtime.
- [x] **`endGame()` → `end_session`**: delete `end_game` RPC; replace with `end_session({ p_session_id, p_host_secret })`.
- [x] **`hostAgain()`**: kept `create_session` RPC (`start_session` mentioned in TASKS.md does not exist in the migration).
- [x] **Answer-count subscription**: subscribes to `player_answers` table — that table no longer exists. Subscribe to `session_answers` filtered by `session_question_id=eq.<active sq id>` instead. Realtime only delivers `(id, session_question_id)` so counting INSERTs is sufficient.
- [x] **Review answer-count fetch**: reads from `player_answers` keyed by `answer_id` — should fetch `session_answers` for the current `session_question_id` and key counts by `slot_index`. `slot_index` is what `correct_slot_indices` in `session_questions` uses.
- [x] **`hostQuestions` pre-load**: the old code pre-loaded `questions + answers` from the quiz. That data is no longer needed for the game loop — `session_questions.slots` already has `answer_text`. Keep the question count fetch for progress display; remove the answers join.
- [x] **Timer**: `session_questions.started_at` is the authoritative start time. When a new `session_questions` row is loaded, compute `timeRemaining = time_limit - floor((now - started_at) / 1000)` to avoid drift on late loads.

### `HostActiveQuestion.jsx`

- [x] `question?.answers?.find((a) => a.id === slot.answer_id)` — the host no longer pre-loads `answers` from the quiz. Each `slot` already carries `answer_text`; replace the lookup with `slot.answer_text`.
- [x] `question.image_url` — this should now come from the `session_questions` row (same field name, but sourced differently); update prop types accordingly.

### `HostQuestionReview.jsx`

- [x] `answerCounts` prop is keyed by `answer_id` — must be keyed by `slot_index` to match new data model.
- [x] `answer?.is_correct` — anon/unauthenticated hosts cannot read `answers.is_correct` (column-level grant revokes it). Use `session_questions.correct_slot_indices` (a JSONB array of correct slot indices) instead. Pass `correctSlotIndices` as a prop alongside `slots`.

### `HostResults.jsx` (major overhaul)

- [x] Fetches from `session_question_answers` table — that table does not exist. Replace with `session_questions` (for the slot/answer snapshot per question) filtered by `session_id`.
- [x] Fetches from `player_answers` — that table does not exist. Replace with `session_answers` joined or fetched by `session_question_id`.
- [x] `slot.icon` — the `slots` JSONB in `session_questions` is `[{slot_index, answer_id, answer_text}]`; there is no `icon` field. Icons are derived client-side from `slot_index` via `lib/slots.js` (same as everywhere else in the app).
- [x] `answers.is_correct` — replace with `session_questions.correct_slot_indices` for the same reason as `HostQuestionReview`.
- [x] Answer counting: `countByAnswer[pa.answer_id]` — should be `countBySlotnIndex[sa.slot_index]`.
- [x] Avg response time: `pa.response_time_ms` → `sa.response_time_ms` (same field name, different table).

### `Play.jsx` (major overhaul)

- [x] **Initial load**: removes non-existent columns (`current_question_index`, `question_open`, `current_question_slots`) from the `sessions` query. Load `active_question_id` and fetch the corresponding `session_questions` row.
- [x] **Realtime filter**: the realtime filter is `join_code=eq.${code}` — per the migration comment, `join_code` is *intentionally excluded* from the sessions realtime publication to prevent enumeration. Change to `id=eq.${sessionId}` (session id is known after the initial REST fetch).
- [x] **Question data source**: player currently fetches questions from the `questions` table. Replace with `session_questions` subscribed/fetched by `session_id`. The `session_questions` row has `question_text`, `image_url`, `time_limit`, `points`, and `slots`.
- [x] **State transitions**: the `question_open` field no longer exists. Detect open→closed by `state` changing to `'reviewing'` (or `closed_at` being set on the `session_questions` row via realtime).
- [x] **`submit_answer` RPC**: old call: `{ p_player_id, p_player_secret, p_question_id, p_answer_id }` — new signature: `{ p_player_id, p_player_secret, p_session_question_id, p_slot_index }`. The player now submits a slot index, not an answer ID.
- [x] **`submittedAnswerId`**: rename / replace with `submittedSlotIndex` throughout.
- [x] **`loadFeedback` — correctness**: calls `get_correct_answer_ids` RPC — that RPC does not exist. Use `session_questions.correct_slot_indices` instead (already available on the closed session_questions row).
- [x] **`loadFeedback` — player answer**: reads from `player_answers.answer_id` — replace with `session_answers` fetched by `player_id` and `session_question_id`. Correctness is `correct_slot_indices.includes(sa.slot_index)`.
- [x] **Session state checks**: replace `sessionState === 'active'` with appropriate `'asking'` / `'reviewing'` checks.

---

## Other tasks

- Music
- Preview quizzes.
- Replace edit/export with icons
- Handle too long nicks/usernames gracefully
- Migrate to PocketBase to save on hosting costs?
- Don't publish answer_id from an active quiz
- Solo mode
