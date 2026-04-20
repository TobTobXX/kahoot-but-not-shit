# Tasks

## Technical debt

Items deferred to a later version. The version marker indicates the earliest point where it makes sense to address each one.

- [ ] **future** — Full security audit: clients can query questions/answers for future questions before they are shown (no row-level restriction by session state), and other unenumerated cheat vectors introduced by the all-anon-read RLS posture.
- [ ] **future** — `anon` can read `is_correct` directly from the `answers` table. The `REVOKE SELECT (is_correct)` in old migrations was a no-op because Supabase's default `GRANT ALL ON TABLE answers TO anon` (table-level) cannot be overridden by a column-level revoke. Fix: `REVOKE SELECT ON answers FROM anon`, then `GRANT SELECT (id, question_id, order_index, answer_text) ON answers TO anon`. Requires auditing all client-side queries that touch `answers` to ensure none rely on the table-level grant.

## Future ideas:

- Music
- Multiple correct answers
- Question with 0 points or no right/wrong
- Profile view, quizzes form profile.
- Migrate to PocketBase to save on hosting costs?
- Filter by tags/language
