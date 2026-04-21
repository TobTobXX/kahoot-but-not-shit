-- =============================================================================
-- Squashed schema — groupquiz
-- All migrations consolidated as of 2026-04-21.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
--CREATE EXTENSION IF NOT EXISTS "pg_cron"            WITH SCHEMA "pg_catalog";
--CREATE EXTENSION IF NOT EXISTS "pg_net"             WITH SCHEMA "extensions";
--CREATE EXTENSION IF NOT EXISTS "pg_graphql"         WITH SCHEMA "graphql";
--CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
--CREATE EXTENSION IF NOT EXISTS "pgcrypto"           WITH SCHEMA "extensions";
--CREATE EXTENSION IF NOT EXISTS "supabase_vault"     WITH SCHEMA "vault";
--CREATE EXTENSION IF NOT EXISTS "uuid-ossp"          WITH SCHEMA "extensions";
--CREATE EXTENSION IF NOT EXISTS "wrappers"           WITH SCHEMA "extensions";


-- -----------------------------------------------------------------------------
-- Stripe FDW (Postgres Wrappers)
-- Lets get_my_subscription_period_end() query live Stripe data via a foreign
-- table instead of a webhook round-trip.
-- The Stripe API key lives in vault.secrets (name: 'stripe_api_key_id').
-- On production the secret is pre-created via the Supabase dashboard.
-- On local dev the secret is inserted by seed.sql, which runs after migrations,
-- so the DO block below is a no-op on fresh resets; seed.sql recreates the
-- server and table once the secret is available.
-- -----------------------------------------------------------------------------
-- Create FDW server
CREATE FOREIGN DATA WRAPPER stripe_wrapper
  HANDLER stripe_fdw_handler
  VALIDATOR stripe_fdw_validator;

-- Set up FDW subscriptions table
DO $$
DECLARE
  v_secret_id uuid;
BEGIN
  -- Get or create the secret
  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = 'stripe_fdw_api_key';
  IF NOT FOUND THEN
    SELECT vault.create_secret('sk_test_placeholder_replace_via_dashboard', 'stripe_fdw_api_key') INTO v_secret_id;
  END IF;

  -- Create foreign data server if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_foreign_server WHERE srvname = 'stripe_server') THEN
    EXECUTE format('CREATE SERVER stripe_server FOREIGN DATA WRAPPER stripe_wrapper OPTIONS (api_key_id %L)', v_secret_id::text);
  END IF;

  -- Create subscriptions table
  CREATE SCHEMA IF NOT EXISTS stripe;
  EXECUTE $sql$
    CREATE FOREIGN TABLE stripe.subscriptions (
      id                   text,
      customer             text,
      status               text,
      current_period_start timestamp,
      current_period_end   timestamp,
      cancel_at_period_end boolean,
      attrs                jsonb
    )
    SERVER stripe_server
    OPTIONS (object 'subscriptions', rowid_column 'id')
  $sql$;
END;
$$;



-- -----------------------------------------------------------------------------
-- Quiz Data Tables
-- -----------------------------------------------------------------------------

-- Quizzes created by users. is_public controls visibility to anonymous readers.
-- creator_id is nullable (SET NULL on user deletion) — orphaned public quizzes remain visible.
-- language (BCP-47, e.g. 'en') and topic are optional metadata used for filtering.
CREATE TABLE IF NOT EXISTS "public"."quizzes" (
    "id"         "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id"),
    "title"      "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "creator_id" "uuid",                   -- nullable; set null when auth.users row is deleted
    CONSTRAINT "quizzes_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    "is_public"  boolean DEFAULT true NOT NULL,
    "language"   "text",                   -- BCP-47 code, e.g. 'en', 'de'
    "topic"      "text"                    -- free-form tag, e.g. 'Math'
);
ALTER TABLE "public"."quizzes" ENABLE ROW LEVEL SECURITY;

-- Public quizzes are readable by everyone; owners can do everything.
CREATE POLICY "quizzes_select_public" ON "public"."quizzes"
    FOR SELECT USING ("is_public" = true);

CREATE POLICY "quizzes_modify_own" ON "public"."quizzes"
    FOR ALL TO "authenticated"
    USING     ("auth"."uid"() = "creator_id")
    WITH CHECK ("auth"."uid"() = "creator_id");


-- Questions belonging to a quiz. Visibility inherits from the parent quiz.
-- order_index is 0-based. image_url points at a public storage object (Pro feature, nullable).
-- time_limit = 0 means no time limit.
CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id"            "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "questions_pkey" PRIMARY KEY ("id"),
    "quiz_id"       "uuid" NOT NULL,
    CONSTRAINT "questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE,
    "order_index"   integer NOT NULL,      -- 0-based display order
    "question_text" "text" NOT NULL,
    "time_limit"    integer DEFAULT 30 NOT NULL,   -- seconds; 0 = no limit
    "points"        integer DEFAULT 1000 NOT NULL,
    "image_url"     "text"                 -- nullable; public storage URL
);
ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;

-- Public when parent quiz is public; owners can read/write.
CREATE POLICY "questions_select_public" ON "public"."questions"
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM "public"."quizzes"
         WHERE "quizzes"."id" = "questions"."quiz_id"
           AND "quizzes"."is_public" = true
      )
    );

CREATE POLICY "questions_modify_own" ON "public"."questions"
    FOR ALL TO "authenticated"
    USING (
      EXISTS (
        SELECT 1 FROM "public"."quizzes"
         WHERE "quizzes"."id" = "questions"."quiz_id"
           AND "quizzes"."creator_id" = "auth"."uid"()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM "public"."quizzes"
         WHERE "quizzes"."id" = "questions"."quiz_id"
           AND "quizzes"."creator_id" = "auth"."uid"()
      )
    );


-- Answer choices for a question. Multiple rows may have is_correct = true (multi-correct support).
-- is_correct is hidden from anon via column-level grant; readable by authenticated owners.
-- order_index is 0-based; may be shuffled at session time by next_question.
CREATE TABLE IF NOT EXISTS "public"."answers" (
    "id"          "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "answers_pkey" PRIMARY KEY ("id"),
    "question_id" "uuid" NOT NULL,
    CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE,
    "order_index" integer NOT NULL,        -- 0-based display order
    "answer_text" "text" NOT NULL,
    "is_correct"  boolean DEFAULT false NOT NULL
);
ALTER TABLE "public"."answers" ENABLE ROW LEVEL SECURITY;

-- Same visibility rules as the parent quiz; is_correct hidden from anon via column-level grant.
CREATE POLICY "answers_select_public" ON "public"."answers"
    FOR SELECT USING (
      EXISTS (
        SELECT 1
          FROM "public"."questions" "q"
          JOIN "public"."quizzes" "quz" ON "quz"."id" = "q"."quiz_id"
         WHERE "q"."id" = "answers"."question_id"
           AND "quz"."is_public" = true
      )
    );

CREATE POLICY "answers_modify_own" ON "public"."answers"
    FOR ALL TO "authenticated"
    USING (
      EXISTS (
        SELECT 1
          FROM "public"."questions" "q"
          JOIN "public"."quizzes" "quz" ON "quz"."id" = "q"."quiz_id"
         WHERE "q"."id" = "answers"."question_id"
           AND "quz"."creator_id" = "auth"."uid"()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
          FROM "public"."questions" "q"
          JOIN "public"."quizzes" "quz" ON "quz"."id" = "q"."quiz_id"
         WHERE "q"."id" = "answers"."question_id"
           AND "quz"."creator_id" = "auth"."uid"()
      )
    );


-- -----------------------------------------------------------------------------
-- Quiz Sessions Tables
-- -----------------------------------------------------------------------------

-- One row per live session; ephemeral (cleaned up by pg_cron after 12 h).
CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id"         "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    "quiz_id"    "uuid" NOT NULL, -- The quiz being hosted
    CONSTRAINT "sessions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE,
    "join_code"  "text" NOT NULL,          -- 6-char uppercase alphanumeric
    CONSTRAINT "sessions_join_code_key" UNIQUE ("join_code"),
    "state"      "text" DEFAULT 'waiting'::"text" NOT NULL,  -- waiting | asking | reviewing | finished
    "active_question_id" "uuid" DEFAULT NULL, -- active question
    CONSTRAINT "sessions_active_question_id_fkey" FOREIGN KEY ("active_question_id") REFERENCES "public"."session_questions"("id") ON DELETE SET NULL,
    "host_secret" "uuid" DEFAULT "gen_random_uuid"() NOT NULL, -- hidden from client roles; verified by host RPCs
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id"            "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "players_pkey" PRIMARY KEY ("id"),
    "session_id"    "uuid" NOT NULL,
    CONSTRAINT "players_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE,
    "nickname"      "varchar(40)" NOT NULL,
    "score"         integer DEFAULT 0 NOT NULL,
    "streak"        integer DEFAULT 0 NOT NULL,           -- consecutive correct answers
    "correct_count" integer DEFAULT 0 NOT NULL,           -- total correct answers
    "player_secret"        "uuid" DEFAULT "gen_random_uuid"() NOT NULL, -- hidden from client roles; verified by submit_answer
    "joined_at"     timestamp with time zone DEFAULT "now"() NOT NULL
);


-- Snapshot of a question as shown to players. Created by next_question RPC;
-- correct_slot_indices is null while open (set by score_question).
-- slots JSONB: [{slot_index, answer_id, answer_text}]
-- answer_id is internal (used by score_question via SECURITY DEFINER).
CREATE TABLE IF NOT EXISTS "public"."session_questions" (
    "id"                   "uuid"        DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT "session_questions_pkey" PRIMARY KEY ("id"),
    "session_id"           "uuid"        NOT NULL,
    CONSTRAINT "session_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE,
    "question_index"       integer       NOT NULL,
    CONSTRAINT "session_questions_session_id_question_index_key" UNIQUE ("session_id", "question_index"),
    "question_text"        "text"        NOT NULL,
    "image_url"            "text",
    "time_limit"           integer       NOT NULL DEFAULT 30,
    "points"               integer       NOT NULL DEFAULT 1000,
    "slots"                "jsonb"       NOT NULL,  -- [{slot_index, answer_id, answer_text}]
    "started_at"           timestamp with time zone NOT NULL DEFAULT now(),
    "closed_at"            timestamp with time zone,           -- null while open
    "correct_slot_indices" "jsonb"                  -- null until score_question fires; e.g. [0, 2]
);


-- One row per player per question. Points default 0; set by score_question.
-- References session_question_id + slot_index — no FK into user-data tables.
CREATE TABLE IF NOT EXISTS "public"."session_answers" (
    "id"                  "uuid"    DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT "session_answers_pkey" PRIMARY KEY ("id"),
    "session_question_id" "uuid"    NOT NULL,
    CONSTRAINT "session_answers_session_question_id_fkey" FOREIGN KEY ("session_question_id") REFERENCES "public"."session_questions"("id") ON DELETE CASCADE,
    "player_id"           "uuid"    NOT NULL,
    CONSTRAINT "session_answers_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE,
    CONSTRAINT "session_answers_session_question_id_player_id_key" UNIQUE ("session_question_id", "player_id"),
    "slot_index"          integer   NOT NULL,
    "points_earned"       integer   NOT NULL DEFAULT 0,   -- set by score_question
    "response_time_ms"    integer,                        -- ms from started_at to submission
    "created_at"          timestamp with time zone NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- User Data Tables
-- -----------------------------------------------------------------------------

-- Public profile data for auth users. One row per user, created by the handle_new_user trigger.
-- username is an optional display name (max 30 chars). Sensitive billing data lives in subscriptions.
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id"       "uuid" NOT NULL,    -- PK; FK → auth.users (cascade delete)
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "username" "varchar(30)"              -- nullable; optional display name
);
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

-- All columns are safe to read publicly; owners can INSERT/UPDATE/DELETE their own row.
CREATE POLICY "profiles_select" ON "public"."profiles"
    FOR SELECT USING (true);

CREATE POLICY "profiles_own" ON "public"."profiles"
    FOR ALL TO "authenticated"
    USING     ("id" = "auth"."uid"())
    WITH CHECK ("id" = "auth"."uid"());


-- Stripe billing state. One row per user, created by the handle_new_user trigger.
-- Written exclusively by service_role Edge Functions (Stripe webhook handlers).
-- is_pro gates image upload and other Pro features; stripe_* columns written on first checkout.
CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id"                          "uuid"    NOT NULL,   -- PK; FK → auth.users (cascade delete)
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscriptions_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "is_pro"                      boolean   NOT NULL DEFAULT false,     -- gates image upload and Pro features
    "stripe_customer_id"          "text",               -- written on first checkout
    "stripe_subscription_id"      "text",               -- active subscription ID; cleared on cancellation
    "stripe_cancel_at_period_end" boolean   NOT NULL DEFAULT false      -- UI hint: cancellation scheduled
);
ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;

-- Owner can read their own row; writes go through service_role (bypasses RLS).
CREATE POLICY "subscriptions_select_own" ON "public"."subscriptions"
    FOR SELECT TO "authenticated"
    USING ("id" = "auth"."uid"());


-- User's bookmarked quizzes. Composite PK (user_id, quiz_id) prevents duplicate stars.
-- Cascades on both user deletion and quiz deletion.
CREATE TABLE IF NOT EXISTS "public"."starred_quizzes" (
    "user_id"    "uuid" NOT NULL,
    CONSTRAINT "starred_quizzes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "quiz_id"    "uuid" NOT NULL,
    CONSTRAINT "starred_quizzes_pkey" PRIMARY KEY ("user_id", "quiz_id"),
    CONSTRAINT "starred_quizzes_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE CASCADE,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."starred_quizzes" ENABLE ROW LEVEL SECURITY;

-- Owner-scoped for all operations.
CREATE POLICY "starred_quizzes_own" ON "public"."starred_quizzes"
    FOR ALL TO "authenticated"
    USING     ("auth"."uid"() = "user_id")
    WITH CHECK ("auth"."uid"() = "user_id");



-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

-- Creates or updates a quiz with all its questions and answers atomically.
-- p_quiz_id = NULL  → create mode: inserts a new quiz owned by the caller; returns its new UUID.
-- p_quiz_id = <id>  → update mode: caller must own the quiz; patches metadata, deletes removed
--                     questions/answers, and upserts the rest by ID; returns the same UUID.
-- Questions and answers must carry client-generated UUIDs in both modes.
CREATE OR REPLACE FUNCTION "public"."save_quiz"(
    "p_title"     "text",
    "p_is_public" boolean,
    "p_questions" "jsonb",
    "p_quiz_id"   "uuid"   DEFAULT NULL,
    "p_language"  "text"   DEFAULT NULL,
    "p_topic"     "text"   DEFAULT NULL
) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_quiz_id     uuid;
  v_question    jsonb;
  v_answer      jsonb;
  v_question_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_quiz_id IS NULL THEN
    -- Create mode: insert a new quiz row.
    INSERT INTO public.quizzes (title, is_public, creator_id, language, topic)
    VALUES (p_title, p_is_public, auth.uid(), nullif(p_language, ''), nullif(p_topic, ''))
    RETURNING id INTO v_quiz_id;
  ELSE
    -- Update mode: verify ownership, then patch metadata.
    IF NOT EXISTS (
      SELECT 1 FROM public.quizzes WHERE id = p_quiz_id AND creator_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.quizzes
       SET title     = p_title,
           is_public = p_is_public,
           language  = nullif(p_language, ''),
           topic     = nullif(p_topic, '')
     WHERE id = p_quiz_id;

    v_quiz_id := p_quiz_id;
  END IF;

  -- Remove questions that are no longer in the list (no-op on create).
  -- NULLs are excluded from the NOT IN list to avoid suppressing all deletes.
  DELETE FROM public.questions
   WHERE quiz_id = v_quiz_id
     AND id NOT IN (
       SELECT (q->>'id')::uuid
         FROM jsonb_array_elements(p_questions) q
        WHERE q->>'id' IS NOT NULL
     );

  FOR v_question IN SELECT * FROM jsonb_array_elements(p_questions)
  LOOP
    v_question_id := COALESCE((v_question->>'id')::uuid, gen_random_uuid());

    INSERT INTO public.questions (id, quiz_id, order_index, question_text, time_limit, points, image_url)
    VALUES (
      v_question_id,
      v_quiz_id,
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

    -- Remove answers that are no longer in the list (no-op on create).
    DELETE FROM public.answers
     WHERE question_id = v_question_id
       AND id NOT IN (
         SELECT (a->>'id')::uuid
           FROM jsonb_array_elements(v_question->'answers') a
          WHERE a->>'id' IS NOT NULL
       );

    FOR v_answer IN SELECT * FROM jsonb_array_elements(v_question->'answers')
    LOOP
      INSERT INTO public.answers (id, question_id, order_index, answer_text, is_correct)
      VALUES (
        COALESCE((v_answer->>'id')::uuid, gen_random_uuid()),
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

  RETURN v_quiz_id;
END;
$$;


-- Returns the current subscription period-end timestamp for the authenticated user.
-- Queries stripe.subscriptions via the Stripe Postgres Wrapper FDW.
-- Tries by subscription ID first, falls back to customer ID.
CREATE OR REPLACE FUNCTION "public"."get_my_subscription_period_end"()
RETURNS timestamp without time zone
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sub_id  text;
  v_cust_id text;
  v_result  timestamp;
BEGIN
  SELECT stripe_subscription_id, stripe_customer_id
    INTO v_sub_id, v_cust_id
    FROM public.subscriptions
   WHERE id = auth.uid();

  IF v_sub_id IS NULL AND v_cust_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_sub_id IS NOT NULL THEN
    SELECT coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      )
      INTO v_result
      FROM stripe.subscriptions
     WHERE id = v_sub_id
     LIMIT 1;
  END IF;

  IF v_result IS NULL AND v_cust_id IS NOT NULL THEN
    SELECT coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      )
      INTO v_result
      FROM stripe.subscriptions
     WHERE customer = v_cust_id
     ORDER BY coalesce(
        current_period_end,
        to_timestamp((attrs->'items'->'data'->0->>'current_period_end')::bigint)::timestamp
      ) DESC NULLS LAST
     LIMIT 1;
  END IF;

  RETURN v_result;
END;
$$;


-- Game lifecycle — host RPCs --------------------------------------------------

-- Creates a new session for the given quiz.
-- Returns {session_id, join_code, host_secret}; host_secret must be stored
-- client-side (localStorage) and passed to all subsequent host RPCs.
CREATE OR REPLACE FUNCTION "public"."start_session"("p_quiz_id" "uuid")
RETURNS "jsonb"
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
  IF NOT EXISTS (
    SELECT 1 FROM public.quizzes
     WHERE id = p_quiz_id
       AND (is_public = true OR creator_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Quiz not found or not accessible';
  END IF;

  LOOP
    v_join_code := '';
    FOR v_i IN 1..6 LOOP
      v_join_code := v_join_code
        || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
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


-- Opens the next question (or the first one), transitioning to asking.
-- Reads question + answer data from the quiz and snapshots it into
-- session_questions with slot assignments. Returns the new session_questions row
-- so the caller has it immediately without waiting for the realtime INSERT.
-- p_shuffle: when true, Fisher-Yates shuffles answers across slots.
CREATE OR REPLACE FUNCTION "public"."next_question"(
    "p_session_id"  "uuid",
    "p_host_secret" "uuid",
    "p_shuffle"     boolean DEFAULT false
)
RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_quiz_id        uuid;
  v_state          text;
  v_active_sq_id   uuid;
  v_next_index     integer;
  v_q              record;
  v_ans_ids        uuid[];
  v_ans_texts      text[];
  v_tmp_id         uuid;
  v_tmp_text       text;
  v_i              integer;
  v_j              integer;
  v_slots          jsonb := '[]'::jsonb;
  v_sq_id          uuid;
BEGIN
  SELECT quiz_id, state, active_question_id
    INTO v_quiz_id, v_state, v_active_sq_id
    FROM public.sessions
   WHERE id = p_session_id AND host_secret = p_host_secret;

  IF v_quiz_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF v_state = 'finished' THEN
    RAISE EXCEPTION 'Session is finished';
  END IF;

  -- The active question (if any) must be closed before opening a new one
  IF v_active_sq_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.session_questions
       WHERE id = v_active_sq_id AND closed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Current question is still open';
    END IF;
  END IF;

  -- Determine the next question index
  IF v_active_sq_id IS NULL THEN
    v_next_index := 0;
  ELSE
    SELECT question_index + 1
      INTO v_next_index
      FROM public.session_questions
     WHERE id = v_active_sq_id;
  END IF;

  -- Read question metadata
  SELECT q.id, q.question_text, q.image_url, q.time_limit, q.points
    INTO v_q
    FROM public.questions q
   WHERE q.quiz_id = v_quiz_id AND q.order_index = v_next_index;

  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'No question at index %', v_next_index;
  END IF;

  -- Read answers in order_index order
  SELECT
    array_agg(a.id          ORDER BY a.order_index),
    array_agg(a.answer_text ORDER BY a.order_index)
  INTO v_ans_ids, v_ans_texts
  FROM public.answers a
  WHERE a.question_id = v_q.id;

  -- Fisher-Yates shuffle: shuffles answers between slots.
  IF p_shuffle AND array_length(v_ans_ids, 1) > 1 THEN
    FOR v_i IN REVERSE array_length(v_ans_ids, 1) .. 2 LOOP
      v_j := 1 + floor(random() * v_i)::int;

      v_tmp_id         := v_ans_ids[v_i];
      v_ans_ids[v_i]   := v_ans_ids[v_j];
      v_ans_ids[v_j]   := v_tmp_id;

      v_tmp_text         := v_ans_texts[v_i];
      v_ans_texts[v_i]   := v_ans_texts[v_j];
      v_ans_texts[v_j]   := v_tmp_text;
    END LOOP;
  END IF;

  -- Build slots JSONB.
  -- answer_id is included for use by score_question (SECURITY DEFINER);
  -- anon can read the slots but cannot determine correctness because
  -- answers.is_correct is revoked from anon at the column level.
  FOR v_i IN 1..coalesce(array_length(v_ans_ids, 1), 0) LOOP
    v_slots := v_slots || jsonb_build_object(
      'slot_index',  v_i - 1,
      'answer_id',   v_ans_ids[v_i],
      'answer_text', v_ans_texts[v_i]
    );
  END LOOP;

  -- Snapshot the question
  INSERT INTO public.session_questions
    (session_id, question_index, question_text, image_url, time_limit, points, slots)
  VALUES
    (p_session_id, v_next_index,
     v_q.question_text, v_q.image_url, v_q.time_limit, v_q.points,
     v_slots)
  RETURNING id INTO v_sq_id;

  -- Advance the session: point active_question_id at the new question,
  -- and transition waiting → asking on the first question, reviewing → asking on subsequent ones.
  UPDATE public.sessions
     SET active_question_id = v_sq_id, state = 'asking'
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'id',             v_sq_id,
    'question_index', v_next_index,
    'question_text',  v_q.question_text,
    'image_url',      v_q.image_url,
    'time_limit',     v_q.time_limit,
    'points',         v_q.points,
    'slots',          v_slots
  );
END;
$$;


-- Closes the current open question, reveals correct_slot_indices, and scores
-- all submitted session_answers. Scoring: time-decayed points (30–100 % of
-- face value based on response speed) plus a streak bonus (+10 % per flame
-- above 2 consecutive correct answers). Wrong answers score 0.
-- answers.is_correct is readable here via SECURITY DEFINER.
CREATE OR REPLACE FUNCTION "public"."score_question"(
    "p_session_id"  "uuid",
    "p_host_secret" "uuid"
)
RETURNS void
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_active_sq_id  uuid;
  v_sq            record;
  v_slot          record;
  v_correct_arr   int[]  := '{}';
  v_correct_slots jsonb;
  v_rec           record;
  v_is_correct    boolean;
  v_points_earned integer;
  v_new_streak    integer;
BEGIN
  -- Verify host and fetch active question id in one query
  SELECT active_question_id INTO v_active_sq_id
    FROM public.sessions
   WHERE id = p_session_id AND host_secret = p_host_secret;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_active_sq_id IS NULL THEN
    RAISE EXCEPTION 'No active question for session %', p_session_id;
  END IF;

  -- Fetch the active question (must still be open)
  SELECT * INTO v_sq
    FROM public.session_questions
   WHERE id = v_active_sq_id AND closed_at IS NULL;

  IF v_sq.id IS NULL THEN
    RAISE EXCEPTION 'Active question is already closed';
  END IF;

  -- Close the question window
  UPDATE public.session_questions
     SET closed_at = now()
   WHERE id = v_sq.id;

  -- Determine which slot indices map to correct answers.
  -- answers.is_correct is readable here because the function is SECURITY DEFINER.
  FOR v_slot IN
    SELECT
      (s->>'slot_index')::integer AS slot_index,
      (s->>'answer_id')::uuid     AS answer_id
    FROM jsonb_array_elements(v_sq.slots) AS s
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.answers
       WHERE id = v_slot.answer_id AND is_correct = true
    ) THEN
      v_correct_arr := v_correct_arr || v_slot.slot_index;
    END IF;
  END LOOP;

  v_correct_slots := to_jsonb(v_correct_arr);

  UPDATE public.session_questions
     SET correct_slot_indices = v_correct_slots
   WHERE id = v_sq.id;

  -- Transition session to reviewing
  UPDATE public.sessions
     SET state = 'reviewing'
   WHERE id = p_session_id;

  -- Score each submitted answer
  FOR v_rec IN
    SELECT sa.id, sa.player_id, sa.slot_index, sa.response_time_ms,
           pl.streak AS current_streak
      FROM public.session_answers sa
      JOIN public.players pl ON pl.id = sa.player_id
     WHERE sa.session_question_id = v_sq.id
  LOOP
    v_is_correct := v_rec.slot_index = ANY(v_correct_arr);

    IF v_is_correct THEN
      -- Time-decayed score: 30–100 % of face value based on response speed
      IF v_sq.time_limit > 0 AND v_rec.response_time_ms IS NOT NULL THEN
        v_points_earned := round(
          v_sq.points * (
            0.3 + 0.7 * greatest(0.0,
              1.0 - v_rec.response_time_ms::numeric / (v_sq.time_limit * 1000.0)
            )
          )
        );
      ELSE
        v_points_earned := v_sq.points;
      END IF;
      -- Streak bonus: +10 % per flame above 2 consecutive correct answers
      v_new_streak    := v_rec.current_streak + 1;
      v_points_earned := round(v_points_earned * (1.0 + greatest(0, v_new_streak - 2) * 0.10))::integer;
    ELSE
      v_new_streak    := 0;
      v_points_earned := 0;
    END IF;

    UPDATE public.session_answers
       SET points_earned = v_points_earned
     WHERE id = v_rec.id;

    UPDATE public.players
       SET score         = score + v_points_earned,
           streak        = v_new_streak,
           correct_count = correct_count + (CASE WHEN v_is_correct THEN 1 ELSE 0 END)
     WHERE id = v_rec.player_id;
  END LOOP;
END;
$$;


-- Transitions a session to 'finished'.
CREATE OR REPLACE FUNCTION "public"."end_session"(
    "p_session_id"  "uuid",
    "p_host_secret" "uuid"
)
RETURNS void
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions
     WHERE id = p_session_id AND host_secret = p_host_secret
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.sessions SET state = 'finished', active_question_id = NULL WHERE id = p_session_id;
END;
$$;


-- Joins a session by join_code; returns {player_id, secret}.
-- Both values must be stored client-side (localStorage) and passed to submit_answer.
CREATE OR REPLACE FUNCTION "public"."join_session"("p_join_code" "text", "p_nickname" "text")
RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_session_id    uuid;
  v_session_state text;
  v_player_id     uuid;
  v_secret        uuid;
BEGIN
  SELECT id, state
    INTO v_session_id, v_session_state
    FROM public.sessions
   WHERE join_code = p_join_code;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  IF v_session_state = 'finished' THEN
    RAISE EXCEPTION 'Session has ended';
  END IF;

  INSERT INTO public.players (session_id, nickname)
  VALUES (v_session_id, p_nickname)
  RETURNING id, secret INTO v_player_id, v_secret;

  RETURN jsonb_build_object('player_id', v_player_id, 'secret', v_secret);
END;
$$;


-- Records a player's answer for the current question.
-- Validates: player secret, submitted question matches session.active_question_id,
-- session state is 'asking', and slot_index exists in the question's slots.
-- response_time_ms is computed server-side from session_questions.started_at.
-- points_earned defaults to 0 and is set by score_question.
CREATE OR REPLACE FUNCTION "public"."submit_answer"(
    "p_player_id"           "uuid",
    "p_player_secret"       "uuid",
    "p_session_question_id" "uuid",
    "p_slot_index"          integer
)
RETURNS void
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_session record;
  v_sq      record;
  v_elapsed numeric;
  v_resp_ms integer;
BEGIN
  -- Verify player identity and fetch their session in one query
  SELECT s.state, s.active_question_id
    INTO v_session
    FROM public.players pl
    JOIN public.sessions s ON s.id = pl.session_id
   WHERE pl.id = p_player_id AND pl.player_secret = p_player_secret;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Session must be in 'asking' state
  IF v_session.state <> 'asking' THEN
    RAISE EXCEPTION 'Answer window is closed';
  END IF;

  -- Submitted question must be the currently active one
  IF v_session.active_question_id IS DISTINCT FROM p_session_question_id THEN
    RAISE EXCEPTION 'Invalid session question';
  END IF;

  -- Fetch the active question
  SELECT * INTO v_sq
    FROM public.session_questions
   WHERE id = v_session.active_question_id;

  -- Guard: slot_index must exist in this question's slots
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sq.slots) s
     WHERE (s->>'slot_index')::integer = p_slot_index
  ) THEN
    RAISE EXCEPTION 'Invalid slot index %', p_slot_index;
  END IF;

  -- Compute response time server-side from session_questions.started_at
  v_elapsed := extract(epoch FROM (now() - v_sq.started_at));
  IF v_sq.time_limit > 0 THEN
    v_resp_ms := round(v_elapsed * 1000)::integer;
  ELSE
    v_resp_ms := NULL;
  END IF;

  -- points_earned defaults to 0 and is set by score_question
  INSERT INTO public.session_answers
    (session_question_id, player_id, slot_index, response_time_ms)
  VALUES
    (v_session.active_question_id, p_player_id, p_slot_index, v_resp_ms);
END;
$$;


-- -----------------------------------------------------------------------------
-- Storage policies (storage schema)
-- -----------------------------------------------------------------------------

-- images bucket: operations restricted to Pro users and scoped to their user id
CREATE POLICY "Pro users can upload images" ON "storage"."objects"
    FOR ALL TO "authenticated"
    USING (
      "bucket_id" = 'images'
      AND ("storage"."foldername"("name"))[1] = "auth"."uid"()::text
      AND EXISTS (
        SELECT 1 FROM "public"."subscriptions"
         WHERE "id" = "auth"."uid"() AND "is_pro" = true
      )
    )
    WITH CHECK (
      "bucket_id" = 'images'
      AND ("storage"."foldername"("name"))[1] = "auth"."uid"()::text
      AND EXISTS (
        SELECT 1 FROM "public"."subscriptions"
         WHERE "id" = "auth"."uid"() AND "is_pro" = true
      )
    );



-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- Automatically add profile in public.profile on user signup.
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles      (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.subscriptions (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER "on_auth_user_created"
    AFTER INSERT ON "auth"."users"
    FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();


-- -----------------------------------------------------------------------------
-- Scheduled jobs (pg_cron)
-- -----------------------------------------------------------------------------

-- Hourly: delete sessions older than 12 hours (cascades to players, answers, etc.)
SELECT cron.schedule(
  'cleanup-old-sessions',
  '0 * * * *',
  $$ DELETE FROM public.sessions WHERE created_at < now() - interval '12 hours'; $$
);

-- Daily at 03:00 UTC: call the sweep-orphan-images Edge Function to purge storage
-- objects that are no longer referenced by any questions.image_url.
-- NOTE: URL is hardcoded to the production Edge Function endpoint.
SELECT cron.schedule(
  'sweep-orphan-images',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qvglitqbidnrbfziotme.supabase.co/functions/v1/sweep-orphan-images',
    headers := '{}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
