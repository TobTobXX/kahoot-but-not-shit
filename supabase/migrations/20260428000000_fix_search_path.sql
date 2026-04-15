-- Security hardening: pin search_path = public on every function so callers
-- cannot redirect unqualified table references to a shadow schema.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assign_answer_slots(
  p_session_id  uuid,
  p_question_id uuid,
  p_shuffle     boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot_index integer := 0;
  v_result     jsonb := '[]'::jsonb;
  v_colors     text[] := array['red', 'blue', 'yellow', 'green'];
  v_icons      text[] := array['circle', 'diamond', 'triangle', 'square'];
  v_ordered    uuid[];
  v_i          integer;
  v_j          integer;
  v_tmp        uuid;
  v_ans        uuid;
BEGIN
  -- Collect answer ids in order_index order
  SELECT array_agg(a.id ORDER BY a.order_index)
    INTO v_ordered
    FROM public.answers a
   WHERE a.question_id = p_question_id;

  -- Fisher-Yates shuffle if requested
  IF p_shuffle AND array_length(v_ordered, 1) > 1 THEN
    FOR v_i IN REVERSE array_length(v_ordered, 1) .. 2 LOOP
      v_j := 1 + floor(random() * v_i)::int;
      v_tmp := v_ordered[v_i];
      v_ordered[v_i] := v_ordered[v_j];
      v_ordered[v_j] := v_tmp;
    END LOOP;
  END IF;

  -- Delete any existing slot assignments for this session+question (idempotent on replay)
  DELETE FROM public.session_question_answers WHERE session_id = p_session_id AND question_id = p_question_id;

  -- Insert one row per slot
  FOR v_i IN 1..coalesce(array_length(v_ordered, 1), 0) LOOP
    v_ans := v_ordered[v_i];
    INSERT INTO public.session_question_answers (session_id, question_id, slot_index, answer_id, color, icon)
    VALUES (p_session_id, p_question_id, v_slot_index, v_ans, v_colors[v_slot_index + 1], v_icons[v_slot_index + 1]);

    v_result := v_result || jsonb_build_object(
      'slot_index', v_slot_index,
      'answer_id',  v_ans,
      'color',      v_colors[v_slot_index + 1],
      'icon',       v_icons[v_slot_index + 1]
    );

    v_slot_index := v_slot_index + 1;
  END LOOP;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_correct_answer_id(
  p_session_id  uuid,
  p_question_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question_open boolean;
  v_correct_id    uuid;
BEGIN
  SELECT question_open INTO v_question_open
    FROM public.sessions
   WHERE id = p_session_id;

  IF v_question_open IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Question window is still open';
  END IF;

  SELECT id INTO v_correct_id
    FROM public.answers
   WHERE question_id = p_question_id
     AND is_correct = true
   LIMIT 1;

  RETURN v_correct_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_quiz(
  p_title     text,
  p_is_public boolean,
  p_questions jsonb
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quiz_id     uuid;
  v_question    jsonb;
  v_answer      jsonb;
  v_question_id uuid;
BEGIN
  INSERT INTO public.quizzes (title, is_public, creator_id)
  VALUES (p_title, p_is_public, auth.uid())
  RETURNING id INTO v_quiz_id;

  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    INSERT INTO public.questions (quiz_id, order_index, question_text, time_limit, points, image_url)
    VALUES (
      v_quiz_id,
      (v_question->>'order_index')::integer,
      v_question->>'question_text',
      (v_question->>'time_limit')::integer,
      (v_question->>'points')::integer,
      nullif(v_question->>'image_url', '')
    )
    RETURNING id INTO v_question_id;

    FOR v_answer IN SELECT * FROM jsonb_array_elements(v_question->'answers')
    LOOP
      INSERT INTO public.answers (question_id, order_index, answer_text, is_correct)
      VALUES (
        v_question_id,
        (v_answer->>'order_index')::integer,
        v_answer->>'answer_text',
        (v_answer->>'is_correct')::boolean
      );
    END LOOP;
  END LOOP;

  RETURN v_quiz_id;
END;
$$;

CREATE OR REPLACE FUNCTION create_session(p_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      INSERT INTO public.sessions (quiz_id, join_code, state)
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

CREATE OR REPLACE FUNCTION join_session(p_join_code text, p_nickname text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id    uuid;
  v_session_state text;
  v_player_id     uuid;
  v_secret        uuid;
BEGIN
  SELECT id, state INTO v_session_id, v_session_state
    FROM public.sessions WHERE join_code = p_join_code;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_session_state = 'finished' THEN
    RAISE EXCEPTION 'Session has ended';
  END IF;

  INSERT INTO public.players (session_id, nickname)
  VALUES (v_session_id, p_nickname)
  RETURNING id, secret INTO v_player_id, v_secret;

  RETURN jsonb_build_object(
    'player_id', v_player_id,
    'secret',    v_secret
  );
END;
$$;

CREATE OR REPLACE FUNCTION start_game(
  p_session_id        uuid,
  p_host_secret       uuid,
  p_first_question_id uuid,
  p_shuffle           boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slots jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_slots := assign_answer_slots(p_session_id, p_first_question_id, p_shuffle);

  UPDATE public.sessions
     SET state                  = 'active',
         current_question_index = 0,
         current_question_slots = v_slots
   WHERE id = p_session_id;

  RETURN v_slots;
END;
$$;

CREATE OR REPLACE FUNCTION open_next_question(
  p_session_id     uuid,
  p_host_secret    uuid,
  p_question_index integer,
  p_question_id    uuid,
  p_shuffle        boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slots jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_slots := assign_answer_slots(p_session_id, p_question_id, p_shuffle);

  UPDATE public.sessions
     SET current_question_index = p_question_index,
         question_open          = true,
         current_question_slots = v_slots
   WHERE id = p_session_id;

  RETURN v_slots;
END;
$$;

CREATE OR REPLACE FUNCTION close_question(
  p_session_id  uuid,
  p_host_secret uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.sessions SET question_open = false WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION end_game(
  p_session_id  uuid,
  p_host_secret uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.sessions SET state = 'finished' WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION submit_answer(
  p_player_id     uuid,
  p_player_secret uuid,
  p_question_id   uuid,
  p_answer_id     uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_player_id AND secret = p_player_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get the player's session
  SELECT pl.session_id INTO v_session_id FROM public.players pl WHERE pl.id = p_player_id;

  -- Guard: answer window must be open
  SELECT s.question_open, s.current_question_index, s.quiz_id
    INTO v_question_open, v_current_question_index, v_quiz_id
    FROM public.sessions s
   WHERE s.id = v_session_id;

  IF NOT v_question_open THEN
    RAISE EXCEPTION 'Answer window is closed for session %', v_session_id;
  END IF;

  -- Guard: p_question_id must match the current question
  SELECT q.id INTO v_current_question_id
    FROM public.questions q
   WHERE q.quiz_id = v_quiz_id
     AND q.order_index = v_current_question_index;

  IF v_current_question_id IS DISTINCT FROM p_question_id THEN
    RAISE EXCEPTION 'Question % is not the current question in session %', p_question_id, v_session_id;
  END IF;

  -- Gate: answer must be in session_question_answers for this session + question
  SELECT EXISTS (
    SELECT 1 FROM public.session_question_answers
     WHERE session_id = v_session_id AND question_id = p_question_id AND answer_id = p_answer_id
  ) INTO v_slot_valid;

  IF NOT v_slot_valid THEN
    RAISE EXCEPTION 'Answer % is not valid for question % in session %', p_answer_id, p_question_id, v_session_id;
  END IF;

  -- Answer correctness and question base points / time limit
  SELECT a.is_correct, q.points, q.time_limit
    INTO v_is_correct, v_points, v_time_limit
    FROM public.answers a
    JOIN public.questions q ON q.id = a.question_id
   WHERE a.id = p_answer_id;

  -- Read current streak before insert so we can compute the new value
  SELECT streak INTO v_streak FROM public.players WHERE id = p_player_id;

  -- Compute new streak and flame count
  v_new_streak  := CASE WHEN v_is_correct THEN v_streak + 1 ELSE 0 END;
  v_flame_count := greatest(0, v_new_streak - 2);

  -- When the current question was opened
  SELECT s.question_opened_at INTO v_opened_at FROM public.sessions s WHERE s.id = v_session_id;

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

  INSERT INTO public.player_answers (player_id, question_id, answer_id, points_earned, response_time_ms)
  VALUES (p_player_id, p_question_id, p_answer_id, v_points_earned, v_response_time_ms);

  -- Unconditional update: wrong answers add 0 points, reset streak to 0
  UPDATE public.players
     SET score         = score + v_points_earned,
         streak        = v_new_streak,
         correct_count = correct_count + (CASE WHEN v_is_correct THEN 1 ELSE 0 END)
   WHERE id = p_player_id;
END;
$$;
