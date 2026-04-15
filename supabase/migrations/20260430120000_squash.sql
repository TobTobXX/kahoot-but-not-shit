-- =============================================================================
-- Squashed migration — full public schema as of 2026-04-30
-- Replaces all prior migrations: 20260413123158 through 20260430000000.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- pg_cron: used for scheduled session cleanup (see bottom of file)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA cron TO postgres;


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- quizzes: one row per quiz; linked to auth.users via creator_id (nullable
-- so legacy/anonymous quizzes remain valid without an auth account)
CREATE TABLE public.quizzes (
    id         uuid        DEFAULT gen_random_uuid() NOT NULL,
    title      text        NOT NULL,
    created_at timestamptz DEFAULT now()             NOT NULL,
    creator_id uuid,                       -- FK → auth.users; NULL = legacy/anonymous
    is_public  boolean     DEFAULT true              NOT NULL
);

-- questions: ordered question rows belonging to a quiz
CREATE TABLE public.questions (
    id            uuid    DEFAULT gen_random_uuid() NOT NULL,
    quiz_id       uuid    NOT NULL,
    order_index   integer NOT NULL,         -- 0-based display order
    question_text text    NOT NULL,
    time_limit    integer DEFAULT 30        NOT NULL,   -- seconds; drives score decay
    points        integer DEFAULT 1000      NOT NULL,   -- max points for a correct answer
    image_url     text                                  -- NULL unless pro user uploaded one
);

-- answers: up to 4 answer choices per question
CREATE TABLE public.answers (
    id          uuid    DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid    NOT NULL,
    order_index integer NOT NULL,
    answer_text text    NOT NULL,
    is_correct  boolean DEFAULT false NOT NULL
);

-- sessions: one live game instance per quiz run
-- State machine: waiting → active → finished
CREATE TABLE public.sessions (
    id                     uuid        DEFAULT gen_random_uuid() NOT NULL,
    quiz_id                uuid        NOT NULL,
    join_code              text        NOT NULL,            -- 6-char alphanumeric, unique
    state                  text        DEFAULT 'waiting'    NOT NULL,
    current_question_index integer,                         -- NULL while waiting
    created_at             timestamptz DEFAULT now()        NOT NULL,
    question_open          boolean     DEFAULT true         NOT NULL,
    question_opened_at     timestamptz,                     -- set by trigger; drives time-based scoring
    current_question_slots jsonb,                           -- [{slot_index,answer_id,color,icon}]; set by open_next_question
    host_secret            uuid        DEFAULT gen_random_uuid() NOT NULL  -- authenticates host RPCs
);

-- players: anonymous players in a session (no auth account needed)
CREATE TABLE public.players (
    id            uuid        DEFAULT gen_random_uuid() NOT NULL,
    session_id    uuid        NOT NULL,
    nickname      text        NOT NULL,
    score         integer     DEFAULT 0   NOT NULL,
    joined_at     timestamptz DEFAULT now() NOT NULL,
    streak        integer     DEFAULT 0   NOT NULL,  -- consecutive correct answers
    correct_count integer     DEFAULT 0   NOT NULL,
    secret        uuid        DEFAULT gen_random_uuid() NOT NULL  -- authenticates player RPCs
);

-- player_answers: one row per player per question (unique enforced)
CREATE TABLE public.player_answers (
    id               uuid        DEFAULT gen_random_uuid() NOT NULL,
    player_id        uuid        NOT NULL,
    question_id      uuid        NOT NULL,
    answer_id        uuid        NOT NULL,
    created_at       timestamptz DEFAULT now() NOT NULL,
    points_earned    integer     DEFAULT 0     NOT NULL,
    response_time_ms integer                              -- NULL when question has no time limit
);

-- session_question_answers: per-session slot/colour assignment for each question.
-- Populated by assign_answer_slots() when a question is opened; allows answer
-- order to be shuffled independently per session.
-- slot_index 0-3 → (red/circle, blue/diamond, yellow/triangle, green/square)
CREATE TABLE public.session_question_answers (
    id          uuid    DEFAULT gen_random_uuid() NOT NULL,
    session_id  uuid    NOT NULL,
    question_id uuid    NOT NULL,
    slot_index  integer NOT NULL,
    answer_id   uuid    NOT NULL,
    color       text    NOT NULL,
    icon        text    NOT NULL,
    CONSTRAINT session_question_answers_slot_index_check CHECK (slot_index >= 0 AND slot_index <= 3)
);

-- profiles: one row per auth.users entry; created automatically on signup.
-- is_pro controls access to image uploads; username is optional display name.
CREATE TABLE public.profiles (
    id       uuid    NOT NULL,  -- FK → auth.users (1-to-1)
    is_pro   boolean DEFAULT false NOT NULL,
    username text
);

-- starred_quizzes: authenticated users can star quizzes they like
CREATE TABLE public.starred_quizzes (
    user_id    uuid        NOT NULL,
    quiz_id    uuid        NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);


-- ---------------------------------------------------------------------------
-- Primary keys & unique constraints
-- ---------------------------------------------------------------------------

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.player_answers
    ADD CONSTRAINT player_answers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.player_answers
    ADD CONSTRAINT player_answers_player_id_question_id_key UNIQUE (player_id, question_id);

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.session_question_answers
    ADD CONSTRAINT session_question_answers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.session_question_answers
    ADD CONSTRAINT session_question_answers_session_id_question_id_slot_index_key
    UNIQUE (session_id, question_id, slot_index);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_join_code_key UNIQUE (join_code);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.starred_quizzes
    ADD CONSTRAINT starred_quizzes_pkey PRIMARY KEY (user_id, quiz_id);


-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE ONLY public.answers
    ADD CONSTRAINT answers_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.player_answers
    ADD CONSTRAINT player_answers_answer_id_fkey
    FOREIGN KEY (answer_id) REFERENCES public.answers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.player_answers
    ADD CONSTRAINT player_answers_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.player_answers
    ADD CONSTRAINT player_answers_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_quiz_id_fkey
    FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.session_question_answers
    ADD CONSTRAINT session_question_answers_answer_id_fkey
    FOREIGN KEY (answer_id) REFERENCES public.answers(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.session_question_answers
    ADD CONSTRAINT session_question_answers_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.session_question_answers
    ADD CONSTRAINT session_question_answers_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_quiz_id_fkey
    FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.starred_quizzes
    ADD CONSTRAINT starred_quizzes_quiz_id_fkey
    FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.starred_quizzes
    ADD CONSTRAINT starred_quizzes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- assign_answer_slots: shuffles (or preserves order of) a question's answers
-- and writes one session_question_answers row per slot for the given session.
-- Returns a JSONB array of {slot_index, answer_id, color, icon}.
-- Called internally by start_game and open_next_question only; not callable
-- by anon/authenticated clients (see REVOKE below).
CREATE FUNCTION public.assign_answer_slots(
    p_session_id  uuid,
    p_question_id uuid,
    p_shuffle     boolean
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
  DELETE FROM public.session_question_answers
   WHERE session_id = p_session_id AND question_id = p_question_id;

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

-- Internal helper — not directly callable by clients
REVOKE EXECUTE ON FUNCTION public.assign_answer_slots(uuid, uuid, boolean) FROM anon, authenticated;


-- create_session: generates a unique 6-char join code, inserts a session row,
-- and returns {session_id, join_code, host_secret}.
-- Only callable if the quiz is public or owned by the caller.
CREATE FUNCTION public.create_session(p_quiz_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session_id  uuid;
  v_join_code   text;
  v_host_secret uuid;
  v_chars       text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i           integer;
  v_attempt     integer := 0;
BEGIN
  -- Verify the caller has access to the quiz
  IF NOT EXISTS (
    SELECT 1 FROM public.quizzes
     WHERE id = p_quiz_id AND (is_public = true OR creator_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Quiz not found or not accessible';
  END IF;

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


-- join_session: inserts a player row and returns {player_id, secret}.
-- Rejects joins to finished sessions.
CREATE FUNCTION public.join_session(p_join_code text, p_nickname text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


-- start_game: transitions a session from waiting → active, sets question index
-- to 0, and calls assign_answer_slots for the first question.
-- Requires a valid host_secret. Returns the slot assignment JSONB array.
CREATE FUNCTION public.start_game(
    p_session_id        uuid,
    p_host_secret       uuid,
    p_first_question_id uuid,
    p_shuffle           boolean
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


-- open_next_question: advances to the given question index, marks it open,
-- and (re-)assigns answer slots. Returns the slot assignment JSONB array.
CREATE FUNCTION public.open_next_question(
    p_session_id     uuid,
    p_host_secret    uuid,
    p_question_index integer,
    p_question_id    uuid,
    p_shuffle        boolean
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


-- close_question: marks question_open = false so no further answers are accepted.
CREATE FUNCTION public.close_question(p_session_id uuid, p_host_secret uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.sessions SET question_open = false WHERE id = p_session_id;
END;
$$;


-- end_game: transitions the session to finished state.
CREATE FUNCTION public.end_game(p_session_id uuid, p_host_secret uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.sessions SET state = 'finished' WHERE id = p_session_id;
END;
$$;


-- submit_answer: the core scoring RPC. Validates player secret, answer window,
-- question match, and slot validity; then computes time-based score decay and
-- streak bonus, inserts a player_answers row, and updates the player's totals.
--
-- Score formula:
--   base    = points * (0.5 + 0.5 * max(0, 1 - elapsed / time_limit))
--   bonus   = base * (1 + max(0, streak - 2) * 0.10)  [flame bonus ≥ 3-streak]
--   wrong   = 0 points, streak reset to 0
CREATE FUNCTION public.submit_answer(
    p_player_id     uuid,
    p_player_secret uuid,
    p_question_id   uuid,
    p_answer_id     uuid
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
   WHERE q.quiz_id = v_quiz_id AND q.order_index = v_current_question_index;

  IF v_current_question_id IS DISTINCT FROM p_question_id THEN
    RAISE EXCEPTION 'Question % is not the current question in session %', p_question_id, v_session_id;
  END IF;

  -- Gate: answer must be present in session_question_answers for this session
  SELECT EXISTS (
    SELECT 1 FROM public.session_question_answers
     WHERE session_id = v_session_id AND question_id = p_question_id AND answer_id = p_answer_id
  ) INTO v_slot_valid;

  IF NOT v_slot_valid THEN
    RAISE EXCEPTION 'Answer % is not valid for question % in session %', p_answer_id, p_question_id, v_session_id;
  END IF;

  SELECT a.is_correct, q.points, q.time_limit
    INTO v_is_correct, v_points, v_time_limit
    FROM public.answers a
    JOIN public.questions q ON q.id = a.question_id
   WHERE a.id = p_answer_id;

  SELECT streak INTO v_streak FROM public.players WHERE id = p_player_id;

  v_new_streak  := CASE WHEN v_is_correct THEN v_streak + 1 ELSE 0 END;
  v_flame_count := greatest(0, v_new_streak - 2);

  SELECT s.question_opened_at INTO v_opened_at FROM public.sessions s WHERE s.id = v_session_id;
  v_elapsed := extract(epoch FROM (now() - coalesce(v_opened_at, now())));

  -- Score decay: full points at t=0, half points at t=time_limit, linear between
  IF v_time_limit IS NOT NULL AND v_time_limit > 0 THEN
    v_points_earned    := round(v_points * (0.5 + 0.5 * greatest(0.0, 1.0 - v_elapsed / v_time_limit)));
    v_response_time_ms := round(v_elapsed * 1000)::integer;
  ELSE
    v_points_earned    := v_points;
    v_response_time_ms := NULL;
  END IF;

  -- Flame bonus for streaks ≥ 3; wrong answers score 0
  IF v_is_correct THEN
    v_points_earned := round(v_points_earned * (1.0 + v_flame_count * 0.10))::integer;
  ELSE
    v_points_earned := 0;
  END IF;

  INSERT INTO public.player_answers (player_id, question_id, answer_id, points_earned, response_time_ms)
  VALUES (p_player_id, p_question_id, p_answer_id, v_points_earned, v_response_time_ms);

  UPDATE public.players
     SET score         = score + v_points_earned,
         streak        = v_new_streak,
         correct_count = correct_count + (CASE WHEN v_is_correct THEN 1 ELSE 0 END)
   WHERE id = p_player_id;
END;
$$;


-- get_correct_answer_id: returns the correct answer UUID for a question,
-- but only after the question window has been closed.
CREATE FUNCTION public.get_correct_answer_id(p_session_id uuid, p_question_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_question_open boolean;
  v_correct_id    uuid;
BEGIN
  SELECT question_open INTO v_question_open
    FROM public.sessions WHERE id = p_session_id;

  IF v_question_open IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Question window is still open';
  END IF;

  SELECT id INTO v_correct_id
    FROM public.answers
   WHERE question_id = p_question_id AND is_correct = true
   LIMIT 1;

  RETURN v_correct_id;
END;
$$;


-- save_quiz: creates a full quiz (quizzes + questions + answers) in one RPC call.
-- The quiz is attributed to the calling authenticated user.
-- p_questions is a JSONB array matching the quiz export format (see ARCHITECTURE.md).
CREATE FUNCTION public.save_quiz(p_title text, p_is_public boolean, p_questions jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
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


-- sessions_set_question_opened_at: BEFORE UPDATE trigger on sessions.
-- Stamps question_opened_at whenever a new question is opened; used by
-- submit_answer to compute elapsed time for score decay.
CREATE FUNCTION public.sessions_set_question_opened_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (new.current_question_index IS DISTINCT FROM old.current_question_index)
     OR (new.question_open = true AND old.question_open = false) THEN
    new.question_opened_at := now();
  END IF;
  RETURN new;
END;
$$;


-- handle_new_user: AFTER INSERT trigger on auth.users.
-- Creates a matching profiles row for every new sign-up (ON CONFLICT DO NOTHING
-- makes it safe to replay).
CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;


-- rls_auto_enable: event trigger function that auto-enables RLS on any new
-- table created in the public schema. Not currently wired to an event trigger,
-- but kept available for reference.
CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL
       AND cmd.schema_name IN ('public')
       AND cmd.schema_name NOT IN ('pg_catalog', 'information_schema')
       AND cmd.schema_name NOT LIKE 'pg_toast%'
       AND cmd.schema_name NOT LIKE 'pg_temp%'
    THEN
      BEGIN
        EXECUTE format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
    END IF;
  END LOOP;
END;
$$;


-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Stamp question_opened_at on every question transition in a session
CREATE TRIGGER sessions_question_opened_at_trigger
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.sessions_set_question_opened_at();

-- Auto-create a profiles row when a new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- quizzes: owners have full CRUD; public quizzes are readable by everyone
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY quizzes_select_public ON public.quizzes FOR SELECT
  USING (is_public = true);

CREATE POLICY quizzes_select_own ON public.quizzes FOR SELECT
  USING (auth.uid() = creator_id);

CREATE POLICY quizzes_insert_auth ON public.quizzes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = creator_id);

CREATE POLICY quizzes_update_own ON public.quizzes FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY quizzes_delete_own ON public.quizzes FOR DELETE
  USING (auth.uid() = creator_id);


-- questions: same read visibility as their parent quiz (public OR owned OR
-- the quiz has an active session); write requires ownership
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY questions_select_visible ON public.questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.quizzes
     WHERE quizzes.id = questions.quiz_id
       AND (quizzes.is_public = true
            OR quizzes.creator_id = auth.uid()
            OR EXISTS (
                 SELECT 1 FROM public.sessions
                  WHERE sessions.quiz_id = quizzes.id AND sessions.state = 'active'
               ))
  ));

CREATE POLICY questions_insert_auth ON public.questions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.quizzes
     WHERE quizzes.id = questions.quiz_id AND quizzes.creator_id = auth.uid()
  ));

CREATE POLICY questions_update_own ON public.questions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.quizzes
     WHERE quizzes.id = questions.quiz_id AND quizzes.creator_id = auth.uid()
  ));

CREATE POLICY questions_delete_own ON public.questions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.quizzes
     WHERE quizzes.id = questions.quiz_id AND quizzes.creator_id = auth.uid()
  ));


-- answers: same visibility as questions (via question→quiz join)
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY answers_select_visible ON public.answers FOR SELECT
  USING (EXISTS (
    SELECT 1
      FROM public.questions q
      JOIN public.quizzes quz ON quz.id = q.quiz_id
     WHERE q.id = answers.question_id
       AND (quz.is_public = true
            OR quz.creator_id = auth.uid()
            OR EXISTS (
                 SELECT 1 FROM public.sessions
                  WHERE sessions.quiz_id = quz.id AND sessions.state = 'active'
               ))
  ));

CREATE POLICY answers_insert_auth ON public.answers FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.questions q
      JOIN public.quizzes quz ON quz.id = q.quiz_id
     WHERE q.id = answers.question_id AND quz.creator_id = auth.uid()
  ));

CREATE POLICY answers_update_own ON public.answers FOR UPDATE
  USING (EXISTS (
    SELECT 1
      FROM public.questions q
      JOIN public.quizzes quz ON quz.id = q.quiz_id
     WHERE q.id = answers.question_id AND quz.creator_id = auth.uid()
  ));

CREATE POLICY answers_delete_own ON public.answers FOR DELETE
  USING (EXISTS (
    SELECT 1
      FROM public.questions q
      JOIN public.quizzes quz ON quz.id = q.quiz_id
     WHERE q.id = answers.question_id AND quz.creator_id = auth.uid()
  ));


-- sessions: fully open reads; all writes go through security-definer RPCs
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_select_open ON public.sessions FOR SELECT
  USING (true);


-- players: fully open reads; joined via join_session RPC
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY players_select_open ON public.players FOR SELECT
  USING (true);


-- player_answers: open reads; written only via submit_answer RPC
ALTER TABLE public.player_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY player_answers_select ON public.player_answers FOR SELECT
  USING (true);


-- session_question_answers: fully open (read + write via RPCs)
ALTER TABLE public.session_question_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on session_question_answers" ON public.session_question_answers
  USING (true) WITH CHECK (true);

CREATE POLICY session_question_answers_read ON public.session_question_answers FOR SELECT
  USING (true);


-- profiles: each user can only read and modify their own row;
-- row is created automatically by the handle_new_user trigger
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT
  TO authenticated USING (id = auth.uid());

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  TO authenticated USING (id = auth.uid());


-- starred_quizzes: users can only see and manage their own stars
ALTER TABLE public.starred_quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select" ON public.starred_quizzes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "owner insert" ON public.starred_quizzes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner delete" ON public.starred_quizzes FOR DELETE
  USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Enable realtime subscriptions on tables the client listens to
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_question_answers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_answers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;


-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- images bucket: public, JPEG only, 500 KiB limit
-- Used for optional question images; upload restricted to pro users.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('images', 'images', true, 512000, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can list/read their own folder
-- (public bucket URLs work without RLS; this just enables JS client listing)
CREATE POLICY "Users can read own images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Only pro users can upload; restricted to own folder (path: {userId}/{questionId}.jpg)
CREATE POLICY "Pro users can upload images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'images' AND
    (storage.foldername(name))[1] = auth.uid()::text AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_pro = true)
  );

-- Pro users can overwrite their own images (upsert)
CREATE POLICY "Pro users can update own images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'images' AND
    (storage.foldername(name))[1] = auth.uid()::text AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_pro = true)
  )
  WITH CHECK (
    bucket_id = 'images' AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_pro = true)
  );

-- Pro users can delete their own images
CREATE POLICY "Pro users can delete own images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'images' AND
    (storage.foldername(name))[1] = auth.uid()::text AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_pro = true)
  );


-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron)
-- ---------------------------------------------------------------------------

-- Hourly cleanup: remove sessions older than 12 h.
-- Cascade deletes remove players, player_answers, session_question_answers, etc.
SELECT cron.schedule(
  'cleanup-old-sessions',
  '0 * * * *',
  $$ DELETE FROM public.sessions WHERE created_at < now() - interval '12 hours'; $$
);
