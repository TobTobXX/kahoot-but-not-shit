-- =============================================================================
-- Security: hide sessions.host_secret and players.secret from client roles.
-- Switches from GRANT ALL (table-level) to column-level SELECT grants so the
-- secret columns are invisible via REST and Realtime events.
-- Also adds explicit auth/ownership guards to save_quiz and update_quiz so
-- non-owners get a clear error rather than a silent no-op.
-- =============================================================================


-- sessions: revoke table-level, re-grant only the safe columns
REVOKE ALL ON TABLE "public"."sessions" FROM "anon";
REVOKE ALL ON TABLE "public"."sessions" FROM "authenticated";
GRANT SELECT (
    "id", "quiz_id", "join_code", "state",
    "current_question_index", "question_open", "question_opened_at",
    "current_question_slots", "created_at"
) ON TABLE "public"."sessions" TO "anon";
GRANT SELECT (
    "id", "quiz_id", "join_code", "state",
    "current_question_index", "question_open", "question_opened_at",
    "current_question_slots", "created_at"
) ON TABLE "public"."sessions" TO "authenticated";


-- players: revoke table-level, re-grant only the safe columns
REVOKE ALL ON TABLE "public"."players" FROM "anon";
REVOKE ALL ON TABLE "public"."players" FROM "authenticated";
GRANT SELECT (
    "id", "session_id", "nickname", "score", "streak", "correct_count", "joined_at"
) ON TABLE "public"."players" TO "anon";
GRANT SELECT (
    "id", "session_id", "nickname", "score", "streak", "correct_count", "joined_at"
) ON TABLE "public"."players" TO "authenticated";


-- save_quiz: add explicit auth guard (fail fast instead of relying on RLS rejection)
CREATE OR REPLACE FUNCTION "public"."save_quiz"(
    "p_title"     "text",
    "p_is_public" boolean,
    "p_questions" "jsonb",
    "p_language"  "text" DEFAULT NULL::"text",
    "p_topic"     "text" DEFAULT NULL::"text"
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
ALTER FUNCTION "public"."save_quiz"(
    "p_title" "text", "p_is_public" boolean, "p_questions" "jsonb",
    "p_language" "text", "p_topic" "text"
) OWNER TO "postgres";


-- update_quiz: add explicit ownership guard (fail fast instead of silent no-op)
CREATE OR REPLACE FUNCTION "public"."update_quiz"(
    "p_quiz_id"   "uuid",
    "p_title"     "text",
    "p_is_public" boolean,
    "p_questions" "jsonb",
    "p_language"  "text" DEFAULT NULL::"text",
    "p_topic"     "text" DEFAULT NULL::"text"
) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_question    jsonb;
  v_answer      jsonb;
  v_question_id uuid;
BEGIN
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
ALTER FUNCTION "public"."update_quiz"(
    "p_quiz_id" "uuid", "p_title" "text", "p_is_public" boolean,
    "p_questions" "jsonb", "p_language" "text", "p_topic" "text"
) OWNER TO "postgres";
