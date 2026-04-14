-- Anon secrets: sessions and players get a random secret UUID on creation.
-- Clients store the secret in localStorage. All mutations to these tables
-- now go through security-definer RPCs that verify the secret.
-- No auth.users entries are created; zero MAU impact.

-- 1. Add secret columns (default generates a UUID for every existing row too)
ALTER TABLE sessions ADD COLUMN host_secret uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE players  ADD COLUMN secret      uuid NOT NULL DEFAULT gen_random_uuid();

-- 2. Hide secret columns from client roles so SELECT * never leaks them
REVOKE SELECT (host_secret) ON sessions FROM anon, authenticated;
REVOKE SELECT (secret)      ON players  FROM anon, authenticated;

-- 3. Lock down sessions: SELECT only; all writes go through RPCs
DROP POLICY IF EXISTS sessions_all_open ON sessions;
CREATE POLICY sessions_select_open ON sessions FOR SELECT USING (true);

-- 4. Lock down players: SELECT only; all writes go through RPCs
DROP POLICY IF EXISTS players_all_open    ON players;
DROP POLICY IF EXISTS players_select_open ON players;
DROP POLICY IF EXISTS players_insert_open ON players;
CREATE POLICY players_select_open ON players FOR SELECT USING (true);

-- 5. Revoke direct client access to assign_answer_slots; it is now an
--    internal helper called only from security-definer RPCs (which run as
--    the postgres role and retain EXECUTE regardless of this revoke).
REVOKE EXECUTE ON FUNCTION assign_answer_slots(uuid, uuid, boolean) FROM anon, authenticated;

-- 6. create_session
--    Generates a unique join code (retries up to 5×), inserts the session,
--    and returns { session_id, join_code, host_secret }.
CREATE OR REPLACE FUNCTION create_session(p_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id  uuid;
  v_join_code   text;
  v_host_secret uuid;
  v_chars       text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i           integer;
  v_attempt     integer := 0;
BEGIN
  LOOP
    v_join_code := '';
    FOR v_i IN 1..6 LOOP
      v_join_code := v_join_code || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
    END LOOP;

    BEGIN
      INSERT INTO sessions (quiz_id, join_code, state)
      VALUES (p_quiz_id, v_join_code, 'waiting')
      RETURNING id, host_secret INTO v_session_id, v_host_secret;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 5 THEN
        RAISE EXCEPTION 'Failed to generate a unique join code after 5 attempts';
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'session_id',  v_session_id,
    'join_code',   v_join_code,
    'host_secret', v_host_secret
  );
END;
$$;

-- 7. join_session
--    Validates the session is open, inserts the player, and returns
--    { player_id, secret }.
CREATE OR REPLACE FUNCTION join_session(p_join_code text, p_nickname text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id    uuid;
  v_session_state text;
  v_player_id     uuid;
  v_secret        uuid;
BEGIN
  SELECT id, state INTO v_session_id, v_session_state
    FROM sessions WHERE join_code = p_join_code;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_session_state = 'finished' THEN
    RAISE EXCEPTION 'Session has ended';
  END IF;

  INSERT INTO players (session_id, nickname)
  VALUES (v_session_id, p_nickname)
  RETURNING id, secret INTO v_player_id, v_secret;

  RETURN jsonb_build_object(
    'player_id', v_player_id,
    'secret',    v_secret
  );
END;
$$;

-- 8. start_game
--    Verifies the host secret, assigns answer slots for the first question,
--    and sets the session active. Returns the slot assignments.
CREATE OR REPLACE FUNCTION start_game(
  p_session_id        uuid,
  p_host_secret       uuid,
  p_first_question_id uuid,
  p_shuffle           boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slots jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_slots := assign_answer_slots(p_session_id, p_first_question_id, p_shuffle);

  UPDATE sessions
     SET state                  = 'active',
         current_question_index = 0,
         current_question_slots = v_slots
   WHERE id = p_session_id;

  RETURN v_slots;
END;
$$;

-- 9. open_next_question
--    Verifies the host secret, assigns slots for the given question, and
--    advances the session. Returns the slot assignments.
CREATE OR REPLACE FUNCTION open_next_question(
  p_session_id     uuid,
  p_host_secret    uuid,
  p_question_index integer,
  p_question_id    uuid,
  p_shuffle        boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slots jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_slots := assign_answer_slots(p_session_id, p_question_id, p_shuffle);

  UPDATE sessions
     SET current_question_index = p_question_index,
         question_open          = true,
         current_question_slots = v_slots
   WHERE id = p_session_id;

  RETURN v_slots;
END;
$$;

-- 10. close_question
--     Verifies the host secret and closes the answer window.
CREATE OR REPLACE FUNCTION close_question(
  p_session_id  uuid,
  p_host_secret uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE sessions SET question_open = false WHERE id = p_session_id;
END;
$$;

-- 11. end_game
--     Verifies the host secret and marks the session finished.
CREATE OR REPLACE FUNCTION end_game(
  p_session_id  uuid,
  p_host_secret uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE sessions SET state = 'finished' WHERE id = p_session_id;
END;
$$;

-- 12. submit_answer (updated)
--     Adds p_player_secret as the second argument; verifies it against
--     players.secret before proceeding. The old 3-argument overload is
--     dropped to prevent clients from calling the unguarded version.
DROP FUNCTION IF EXISTS submit_answer(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION submit_answer(
  p_player_id     uuid,
  p_player_secret uuid,
  p_question_id   uuid,
  p_answer_id     uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id             uuid;
  v_question_open          boolean;
  v_current_question_index integer;
  v_quiz_id                uuid;
  v_current_question_id    uuid;
  v_is_correct             boolean;
  v_points                 integer;
  v_time_limit             integer;
  v_opened_at              timestamptz;
  v_elapsed                numeric;
  v_points_earned          integer;
  v_response_time_ms       integer;
  v_slot_valid             boolean;
  v_streak                 integer;
  v_new_streak             integer;
  v_flame_count            integer;
BEGIN
  -- Verify player secret
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id AND secret = p_player_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get the player's session
  SELECT pl.session_id INTO v_session_id FROM players pl WHERE pl.id = p_player_id;

  -- Guard: answer window must be open
  SELECT s.question_open, s.current_question_index, s.quiz_id
    INTO v_question_open, v_current_question_index, v_quiz_id
    FROM sessions s
   WHERE s.id = v_session_id;

  IF NOT v_question_open THEN
    RAISE EXCEPTION 'Answer window is closed for session %', v_session_id;
  END IF;

  -- Guard: p_question_id must match the current question
  SELECT q.id INTO v_current_question_id
    FROM questions q
   WHERE q.quiz_id = v_quiz_id
     AND q.order_index = v_current_question_index;

  IF v_current_question_id IS DISTINCT FROM p_question_id THEN
    RAISE EXCEPTION 'Question % is not the current question in session %', p_question_id, v_session_id;
  END IF;

  -- Gate: answer must be in session_question_answers for this session + question
  SELECT EXISTS (
    SELECT 1 FROM session_question_answers
     WHERE session_id = v_session_id AND question_id = p_question_id AND answer_id = p_answer_id
  ) INTO v_slot_valid;

  IF NOT v_slot_valid THEN
    RAISE EXCEPTION 'Answer % is not valid for question % in session %', p_answer_id, p_question_id, v_session_id;
  END IF;

  -- Answer correctness and question base points / time limit
  SELECT a.is_correct, q.points, q.time_limit
    INTO v_is_correct, v_points, v_time_limit
    FROM answers a
    JOIN questions q ON q.id = a.question_id
   WHERE a.id = p_answer_id;

  -- Read current streak before insert so we can compute the new value
  SELECT streak INTO v_streak FROM players WHERE id = p_player_id;

  -- Compute new streak and flame count
  v_new_streak  := CASE WHEN v_is_correct THEN v_streak + 1 ELSE 0 END;
  v_flame_count := greatest(0, v_new_streak - 2);

  -- When the current question was opened
  SELECT s.question_opened_at INTO v_opened_at FROM sessions s WHERE s.id = v_session_id;

  -- Elapsed seconds; NULL opened_at treated as 0 elapsed → full points
  v_elapsed := extract(epoch FROM (now() - coalesce(v_opened_at, now())));

  -- Score decay: full points at t=0, half points at t=time_limit, linear between
  IF v_time_limit IS NOT NULL AND v_time_limit > 0 THEN
    v_points_earned    := round(v_points * (0.5 + 0.5 * greatest(0.0, 1.0 - v_elapsed / v_time_limit)));
    v_response_time_ms := round(v_elapsed * 1000)::integer;
  ELSE
    v_points_earned    := v_points;
    v_response_time_ms := NULL;
  END IF;

  -- Apply flame bonus (correct) or zero out points (wrong)
  IF v_is_correct THEN
    v_points_earned := round(v_points_earned * (1.0 + v_flame_count * 0.10))::integer;
  ELSE
    v_points_earned := 0;
  END IF;

  INSERT INTO player_answers (player_id, question_id, answer_id, points_earned, response_time_ms)
  VALUES (p_player_id, p_question_id, p_answer_id, v_points_earned, v_response_time_ms);

  -- Unconditional update: wrong answers add 0 points, reset streak to 0
  UPDATE players
     SET score         = score + v_points_earned,
         streak        = v_new_streak,
         correct_count = correct_count + (CASE WHEN v_is_correct THEN 1 ELSE 0 END)
   WHERE id = p_player_id;
END;
$$;
