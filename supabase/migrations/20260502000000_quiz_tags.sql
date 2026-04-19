-- Add language and subject tag columns to quizzes.
-- Both are nullable free-form text; NULL means "not set".

ALTER TABLE public.quizzes
  ADD COLUMN language text,
  ADD COLUMN subject  text;


-- Update save_quiz to persist language and subject.
-- New params default to NULL so existing callers are unaffected.
CREATE OR REPLACE FUNCTION public.save_quiz(
  p_title     text,
  p_is_public boolean,
  p_questions jsonb,
  p_language  text DEFAULT NULL,
  p_subject   text DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_quiz_id     uuid;
  v_question    jsonb;
  v_answer      jsonb;
  v_question_id uuid;
BEGIN
  INSERT INTO public.quizzes (title, is_public, creator_id, language, subject)
  VALUES (p_title, p_is_public, auth.uid(), nullif(p_language, ''), nullif(p_subject, ''))
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


-- Update update_quiz to persist language and subject.
-- New params default to NULL so existing callers are unaffected.
CREATE OR REPLACE FUNCTION public.update_quiz(
  p_quiz_id   uuid,
  p_title     text,
  p_is_public boolean,
  p_questions jsonb,
  p_language  text DEFAULT NULL,
  p_subject   text DEFAULT NULL
) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_question    jsonb;
  v_answer      jsonb;
  v_question_id uuid;
BEGIN
  UPDATE public.quizzes
     SET title    = p_title,
         is_public = p_is_public,
         language = nullif(p_language, ''),
         subject  = nullif(p_subject, '')
   WHERE id = p_quiz_id;

  -- Delete questions not in the new list (cascade removes their answers too).
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

    -- Delete answers removed from this question.
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
