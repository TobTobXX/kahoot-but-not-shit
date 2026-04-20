


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."assign_answer_slots"("p_session_id" "uuid", "p_question_id" "uuid", "p_shuffle" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."assign_answer_slots"("p_session_id" "uuid", "p_question_id" "uuid", "p_shuffle" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_question"("p_session_id" "uuid", "p_host_secret" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_question_index integer;
  v_quiz_id        uuid;
  v_question_id    uuid;
  v_points         integer;
  v_time_limit     integer;
  v_correct_id     uuid;

  -- cursor over submitted answers for this question
  v_rec            record;
  v_elapsed        numeric;
  v_points_earned  integer;
  v_new_streak     integer;
  v_flame_count    integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.sessions SET question_open = false WHERE id = p_session_id;

  -- Look up the current question
  SELECT s.current_question_index, s.quiz_id
    INTO v_question_index, v_quiz_id
    FROM public.sessions s
   WHERE s.id = p_session_id;

  SELECT q.id, q.points, q.time_limit
    INTO v_question_id, v_points, v_time_limit
    FROM public.questions q
   WHERE q.quiz_id = v_quiz_id AND q.order_index = v_question_index;

  IF v_question_id IS NULL THEN
    RETURN; -- no question to score (shouldn't happen in normal flow)
  END IF;

  -- Find the correct answer for this question
  SELECT id INTO v_correct_id
    FROM public.answers
   WHERE question_id = v_question_id AND is_correct = true
   LIMIT 1;

  -- Evaluate each player's submitted answer
  FOR v_rec IN
    SELECT pa.player_id, pa.answer_id, pa.response_time_ms,
           pl.streak AS current_streak
      FROM public.player_answers pa
      JOIN public.players pl ON pl.id = pa.player_id
     WHERE pa.question_id = v_question_id
  LOOP
    -- Compute time-decayed score
    IF v_time_limit IS NOT NULL AND v_time_limit > 0 AND v_rec.response_time_ms IS NOT NULL THEN
      v_elapsed       := v_rec.response_time_ms::numeric / 1000.0;
      v_points_earned := round(v_points * (0.5 + 0.5 * greatest(0.0, 1.0 - v_elapsed / v_time_limit)));
    ELSE
      v_points_earned := v_points;
    END IF;

    -- Streak and flame bonus; wrong answers score 0
    IF v_rec.answer_id = v_correct_id THEN
      v_new_streak    := v_rec.current_streak + 1;
      v_flame_count   := greatest(0, v_new_streak - 2);
      v_points_earned := round(v_points_earned * (1.0 + v_flame_count * 0.10))::integer;
    ELSE
      v_new_streak    := 0;
      v_points_earned := 0;
    END IF;

    UPDATE public.player_answers
       SET points_earned = v_points_earned
     WHERE player_id = v_rec.player_id AND question_id = v_question_id;

    UPDATE public.players
       SET score         = score + v_points_earned,
           streak        = v_new_streak,
           correct_count = correct_count + (CASE WHEN v_rec.answer_id = v_correct_id THEN 1 ELSE 0 END)
     WHERE id = v_rec.player_id;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."close_question"("p_session_id" "uuid", "p_host_secret" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_session"("p_quiz_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_session"("p_quiz_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_game"("p_session_id" "uuid", "p_host_secret" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND host_secret = p_host_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.sessions SET state = 'finished' WHERE id = p_session_id;
END;
$$;


ALTER FUNCTION "public"."end_game"("p_session_id" "uuid", "p_host_secret" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_correct_answer_id"("p_session_id" "uuid", "p_question_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_correct_answer_id"("p_session_id" "uuid", "p_question_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_subscription_period_end"() RETURNS timestamp without time zone
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sub_id  text;
  v_cust_id text;
  v_result  timestamp;
begin
  select stripe_subscription_id, stripe_customer_id
    into v_sub_id, v_cust_id
  from public.profiles
  where id = auth.uid();

  if v_sub_id is null and v_cust_id is null then
    return null;
  end if;

  if v_sub_id is not null then
    select coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      )
      into v_result
    from stripe.subscriptions
    where id = v_sub_id
    limit 1;
  end if;

  if v_result is null and v_cust_id is not null then
    select coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      )
      into v_result
    from stripe.subscriptions
    where customer = v_cust_id
    order by coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      ) desc nulls last
    limit 1;
  end if;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."get_my_subscription_period_end"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_session"("p_join_code" "text", "p_nickname" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."join_session"("p_join_code" "text", "p_nickname" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_next_question"("p_session_id" "uuid", "p_host_secret" "uuid", "p_question_index" integer, "p_question_id" "uuid", "p_shuffle" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."open_next_question"("p_session_id" "uuid", "p_host_secret" "uuid", "p_question_index" integer, "p_question_id" "uuid", "p_shuffle" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
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


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_quiz"("p_title" "text", "p_is_public" boolean, "p_questions" "jsonb", "p_language" "text" DEFAULT NULL::"text", "p_topic" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_quiz_id     uuid;
  v_question    jsonb;
  v_answer      jsonb;
  v_question_id uuid;
BEGIN
  INSERT INTO public.quizzes (title, is_public, creator_id, language, topic)
  VALUES (p_title, p_is_public, auth.uid(), nullif(p_language, ''), nullif(p_topic, ''))
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


ALTER FUNCTION "public"."save_quiz"("p_title" "text", "p_is_public" boolean, "p_questions" "jsonb", "p_language" "text", "p_topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sessions_set_question_opened_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (new.current_question_index IS DISTINCT FROM old.current_question_index)
     OR (new.question_open = true AND old.question_open = false) THEN
    new.question_opened_at := now();
  END IF;
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."sessions_set_question_opened_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_game"("p_session_id" "uuid", "p_host_secret" "uuid", "p_first_question_id" "uuid", "p_shuffle" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."start_game"("p_session_id" "uuid", "p_host_secret" "uuid", "p_first_question_id" "uuid", "p_shuffle" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_answer"("p_player_id" "uuid", "p_player_secret" "uuid", "p_question_id" "uuid", "p_answer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_session_id             uuid;
  v_question_open          boolean;
  v_current_question_index integer;
  v_quiz_id                uuid;
  v_current_question_id    uuid;
  v_time_limit             integer;
  v_opened_at              timestamptz;
  v_elapsed                numeric;
  v_response_time_ms       integer;
  v_slot_valid             boolean;
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

  -- Compute response_time_ms server-side from question_opened_at
  SELECT s.question_opened_at, q.time_limit
    INTO v_opened_at, v_time_limit
    FROM public.sessions s
    JOIN public.questions q ON q.id = p_question_id
   WHERE s.id = v_session_id;

  v_elapsed := extract(epoch FROM (now() - coalesce(v_opened_at, now())));

  IF v_time_limit IS NOT NULL AND v_time_limit > 0 THEN
    v_response_time_ms := round(v_elapsed * 1000)::integer;
  ELSE
    v_response_time_ms := NULL;
  END IF;

  -- Record answer; points_earned defaults to 0 and is set by close_question
  INSERT INTO public.player_answers (player_id, question_id, answer_id, response_time_ms)
  VALUES (p_player_id, p_question_id, p_answer_id, v_response_time_ms);
END;
$$;


ALTER FUNCTION "public"."submit_answer"("p_player_id" "uuid", "p_player_secret" "uuid", "p_question_id" "uuid", "p_answer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_quiz"("p_quiz_id" "uuid", "p_title" "text", "p_is_public" boolean, "p_questions" "jsonb", "p_language" "text" DEFAULT NULL::"text", "p_topic" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_question    jsonb;
  v_answer      jsonb;
  v_question_id uuid;
BEGIN
  UPDATE public.quizzes
     SET title     = p_title,
         is_public = p_is_public,
         language  = nullif(p_language, ''),
         topic     = nullif(p_topic, '')
   WHERE id = p_quiz_id;

  DELETE FROM public.questions
   WHERE quiz_id = p_quiz_id
     AND id NOT IN (
       SELECT (q->>'id')::uuid FROM jsonb_array_elements(p_questions) q
     );

  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    v_question_id := (v_question->>'id')::uuid;

    INSERT INTO public.questions (id, quiz_id, order_index, question_text, time_limit, points, image_url)
    VALUES (
      v_question_id,
      p_quiz_id,
      (v_question->>'order_index')::integer,
      v_question->>'question_text',
      (v_question->>'time_limit')::integer,
      (v_question->>'points')::integer,
      nullif(v_question->>'image_url', '')
    )
    ON CONFLICT (id) DO UPDATE SET
      order_index   = EXCLUDED.order_index,
      question_text = EXCLUDED.question_text,
      time_limit    = EXCLUDED.time_limit,
      points        = EXCLUDED.points,
      image_url     = EXCLUDED.image_url;

    DELETE FROM public.answers
     WHERE question_id = v_question_id
       AND id NOT IN (
         SELECT (a->>'id')::uuid FROM jsonb_array_elements(v_question->'answers') a
       );

    FOR v_answer IN SELECT * FROM jsonb_array_elements(v_question->'answers')
    LOOP
      INSERT INTO public.answers (id, question_id, order_index, answer_text, is_correct)
      VALUES (
        (v_answer->>'id')::uuid,
        v_question_id,
        (v_answer->>'order_index')::integer,
        v_answer->>'answer_text',
        (v_answer->>'is_correct')::boolean
      )
      ON CONFLICT (id) DO UPDATE SET
        order_index = EXCLUDED.order_index,
        answer_text = EXCLUDED.answer_text,
        is_correct  = EXCLUDED.is_correct;
    END LOOP;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."update_quiz"("p_quiz_id" "uuid", "p_title" "text", "p_is_public" boolean, "p_questions" "jsonb", "p_language" "text", "p_topic" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "order_index" integer NOT NULL,
    "answer_text" "text" NOT NULL,
    "is_correct" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "answer_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "points_earned" integer DEFAULT 0 NOT NULL,
    "response_time_ms" integer
);


ALTER TABLE "public"."player_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "nickname" "text" NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "streak" integer DEFAULT 0 NOT NULL,
    "correct_count" integer DEFAULT 0 NOT NULL,
    "secret" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "is_pro" boolean DEFAULT false NOT NULL,
    "username" "text",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_cancel_at_period_end" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "order_index" integer NOT NULL,
    "question_text" "text" NOT NULL,
    "time_limit" integer DEFAULT 30 NOT NULL,
    "points" integer DEFAULT 1000 NOT NULL,
    "image_url" "text"
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quizzes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "creator_id" "uuid",
    "is_public" boolean DEFAULT true NOT NULL,
    "language" "text",
    "topic" "text"
);


ALTER TABLE "public"."quizzes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_question_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "slot_index" integer NOT NULL,
    "answer_id" "uuid" NOT NULL,
    "color" "text" NOT NULL,
    "icon" "text" NOT NULL,
    CONSTRAINT "session_question_answers_slot_index_check" CHECK ((("slot_index" >= 0) AND ("slot_index" <= 3)))
);


ALTER TABLE "public"."session_question_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "join_code" "text" NOT NULL,
    "state" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "current_question_index" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "question_open" boolean DEFAULT true NOT NULL,
    "question_opened_at" timestamp with time zone,
    "current_question_slots" "jsonb",
    "host_secret" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."starred_quizzes" (
    "user_id" "uuid" NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."starred_quizzes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_answers"
    ADD CONSTRAINT "player_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_answers"
    ADD CONSTRAINT "player_answers_player_id_question_id_key" UNIQUE ("player_id", "question_id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_question_answers"
    ADD CONSTRAINT "session_question_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_question_answers"
    ADD CONSTRAINT "session_question_answers_session_id_question_id_slot_index_key" UNIQUE ("session_id", "question_id", "slot_index");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_join_code_key" UNIQUE ("join_code");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."starred_quizzes"
    ADD CONSTRAINT "starred_quizzes_pkey" PRIMARY KEY ("user_id", "quiz_id");



CREATE OR REPLACE TRIGGER "sessions_question_opened_at_trigger" BEFORE UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."sessions_set_question_opened_at"();



ALTER TABLE ONLY "public"."answers"
    ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_answers"
    ADD CONSTRAINT "player_answers_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_answers"
    ADD CONSTRAINT "player_answers_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_answers"
    ADD CONSTRAINT "player_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quizzes"
    ADD CONSTRAINT "quizzes_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_question_answers"
    ADD CONSTRAINT "session_question_answers_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_question_answers"
    ADD CONSTRAINT "session_question_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_question_answers"
    ADD CONSTRAINT "session_question_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."starred_quizzes"
    ADD CONSTRAINT "starred_quizzes_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."starred_quizzes"
    ADD CONSTRAINT "starred_quizzes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "answers_delete_own" ON "public"."answers" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."questions" "q"
     JOIN "public"."quizzes" "quz" ON (("quz"."id" = "q"."quiz_id")))
  WHERE (("q"."id" = "answers"."question_id") AND ("quz"."creator_id" = "auth"."uid"())))));



CREATE POLICY "answers_insert_auth" ON "public"."answers" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."questions" "q"
     JOIN "public"."quizzes" "quz" ON (("quz"."id" = "q"."quiz_id")))
  WHERE (("q"."id" = "answers"."question_id") AND ("quz"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "answers_select_visible" ON "public"."answers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."questions" "q"
     JOIN "public"."quizzes" "quz" ON (("quz"."id" = "q"."quiz_id")))
  WHERE (("q"."id" = "answers"."question_id") AND (("quz"."is_public" = true) OR ("quz"."creator_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."sessions"
          WHERE (("sessions"."quiz_id" = "quz"."id") AND ("sessions"."state" = 'active'::"text")))))))));



CREATE POLICY "answers_update_own" ON "public"."answers" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."questions" "q"
     JOIN "public"."quizzes" "quz" ON (("quz"."id" = "q"."quiz_id")))
  WHERE (("q"."id" = "answers"."question_id") AND ("quz"."creator_id" = "auth"."uid"())))));



CREATE POLICY "owner delete" ON "public"."starred_quizzes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "owner insert" ON "public"."starred_quizzes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "owner select" ON "public"."starred_quizzes" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."player_answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "player_answers_select" ON "public"."player_answers" FOR SELECT USING (true);



ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "players_select_open" ON "public"."players" FOR SELECT USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "questions_delete_own" ON "public"."questions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."quizzes"
  WHERE (("quizzes"."id" = "questions"."quiz_id") AND ("quizzes"."creator_id" = "auth"."uid"())))));



CREATE POLICY "questions_insert_auth" ON "public"."questions" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."quizzes"
  WHERE (("quizzes"."id" = "questions"."quiz_id") AND ("quizzes"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "questions_select_visible" ON "public"."questions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."quizzes"
  WHERE (("quizzes"."id" = "questions"."quiz_id") AND (("quizzes"."is_public" = true) OR ("quizzes"."creator_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."sessions"
          WHERE (("sessions"."quiz_id" = "quizzes"."id") AND ("sessions"."state" = 'active'::"text")))))))));



CREATE POLICY "questions_update_own" ON "public"."questions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."quizzes"
  WHERE (("quizzes"."id" = "questions"."quiz_id") AND ("quizzes"."creator_id" = "auth"."uid"())))));



ALTER TABLE "public"."quizzes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quizzes_delete_own" ON "public"."quizzes" FOR DELETE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "quizzes_insert_auth" ON "public"."quizzes" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "creator_id")));



CREATE POLICY "quizzes_select_own" ON "public"."quizzes" FOR SELECT USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "quizzes_select_public" ON "public"."quizzes" FOR SELECT USING (("is_public" = true));



CREATE POLICY "quizzes_update_own" ON "public"."quizzes" FOR UPDATE USING (("auth"."uid"() = "creator_id"));



ALTER TABLE "public"."session_question_answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_question_answers_select" ON "public"."session_question_answers" FOR SELECT USING (true);



ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sessions_select_open" ON "public"."sessions" FOR SELECT USING (true);



ALTER TABLE "public"."starred_quizzes" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."player_answers";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."players";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."session_question_answers";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sessions";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




















































































































































































GRANT ALL ON FUNCTION "public"."assign_answer_slots"("p_session_id" "uuid", "p_question_id" "uuid", "p_shuffle" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."close_question"("p_session_id" "uuid", "p_host_secret" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."close_question"("p_session_id" "uuid", "p_host_secret" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_question"("p_session_id" "uuid", "p_host_secret" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_session"("p_quiz_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_session"("p_quiz_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_session"("p_quiz_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."end_game"("p_session_id" "uuid", "p_host_secret" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."end_game"("p_session_id" "uuid", "p_host_secret" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_game"("p_session_id" "uuid", "p_host_secret" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_correct_answer_id"("p_session_id" "uuid", "p_question_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_correct_answer_id"("p_session_id" "uuid", "p_question_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_correct_answer_id"("p_session_id" "uuid", "p_question_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_subscription_period_end"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_subscription_period_end"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_subscription_period_end"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."join_session"("p_join_code" "text", "p_nickname" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_session"("p_join_code" "text", "p_nickname" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_session"("p_join_code" "text", "p_nickname" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."open_next_question"("p_session_id" "uuid", "p_host_secret" "uuid", "p_question_index" integer, "p_question_id" "uuid", "p_shuffle" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."open_next_question"("p_session_id" "uuid", "p_host_secret" "uuid", "p_question_index" integer, "p_question_id" "uuid", "p_shuffle" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_next_question"("p_session_id" "uuid", "p_host_secret" "uuid", "p_question_index" integer, "p_question_id" "uuid", "p_shuffle" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."save_quiz"("p_title" "text", "p_is_public" boolean, "p_questions" "jsonb", "p_language" "text", "p_topic" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_quiz"("p_title" "text", "p_is_public" boolean, "p_questions" "jsonb", "p_language" "text", "p_topic" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_quiz"("p_title" "text", "p_is_public" boolean, "p_questions" "jsonb", "p_language" "text", "p_topic" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sessions_set_question_opened_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."sessions_set_question_opened_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sessions_set_question_opened_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."start_game"("p_session_id" "uuid", "p_host_secret" "uuid", "p_first_question_id" "uuid", "p_shuffle" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."start_game"("p_session_id" "uuid", "p_host_secret" "uuid", "p_first_question_id" "uuid", "p_shuffle" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_game"("p_session_id" "uuid", "p_host_secret" "uuid", "p_first_question_id" "uuid", "p_shuffle" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_answer"("p_player_id" "uuid", "p_player_secret" "uuid", "p_question_id" "uuid", "p_answer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_answer"("p_player_id" "uuid", "p_player_secret" "uuid", "p_question_id" "uuid", "p_answer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_answer"("p_player_id" "uuid", "p_player_secret" "uuid", "p_question_id" "uuid", "p_answer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_quiz"("p_quiz_id" "uuid", "p_title" "text", "p_is_public" boolean, "p_questions" "jsonb", "p_language" "text", "p_topic" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_quiz"("p_quiz_id" "uuid", "p_title" "text", "p_is_public" boolean, "p_questions" "jsonb", "p_language" "text", "p_topic" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_quiz"("p_quiz_id" "uuid", "p_title" "text", "p_is_public" boolean, "p_questions" "jsonb", "p_language" "text", "p_topic" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."answers" TO "anon";
GRANT ALL ON TABLE "public"."answers" TO "authenticated";
GRANT ALL ON TABLE "public"."answers" TO "service_role";



GRANT ALL ON TABLE "public"."player_answers" TO "anon";
GRANT ALL ON TABLE "public"."player_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."player_answers" TO "service_role";



GRANT ALL ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."quizzes" TO "anon";
GRANT ALL ON TABLE "public"."quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."session_question_answers" TO "anon";
GRANT ALL ON TABLE "public"."session_question_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."session_question_answers" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."starred_quizzes" TO "anon";
GRANT ALL ON TABLE "public"."starred_quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."starred_quizzes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



CREATE POLICY "Pro users can delete own images" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_pro" = true))))));



CREATE POLICY "Pro users can update own images" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_pro" = true)))))) WITH CHECK ((("bucket_id" = 'images'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_pro" = true))))));



CREATE POLICY "Pro users can upload images" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_pro" = true))))));



CREATE POLICY "Users can read own images" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'images'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



