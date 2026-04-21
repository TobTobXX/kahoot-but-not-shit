-- Add total_questions to sessions so the host screen never needs quiz_id.
-- Populated by create_session at session-creation time.
ALTER TABLE public.sessions
  ADD COLUMN "total_questions" integer NOT NULL DEFAULT 0;

-- Redefine create_session to populate total_questions.
CREATE OR REPLACE FUNCTION "public"."create_session"("p_quiz_id" "uuid")
RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_session_id     uuid;
  v_join_code      text;
  v_host_secret    uuid;
  v_total_questions integer;
  v_chars          text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i              integer;
  v_attempt        integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.quizzes
     WHERE id = p_quiz_id
       AND (is_public = true OR creator_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Quiz not found or not accessible';
  END IF;

  SELECT count(*) INTO v_total_questions
    FROM public.questions
   WHERE quiz_id = p_quiz_id;

  LOOP
    v_join_code := '';
    FOR v_i IN 1..6 LOOP
      v_join_code := v_join_code
        || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.sessions (quiz_id, join_code, state, total_questions)
      VALUES (p_quiz_id, v_join_code, 'waiting', v_total_questions)
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
