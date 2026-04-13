-- Fix submit_answer: remove incorrect auth gate
-- p_player_id is an anonymous players table UUID, not an auth user UUID.
-- Comparing auth.uid() to p_player_id crosses two unrelated ID spaces and
-- blocks any logged-in user (host/quiz creator) from submitting a player answer.
-- Players are always unauthenticated, so no auth gate is needed here.

create or replace function submit_answer(
  p_player_id   uuid,
  p_question_id uuid,
  p_answer_id   uuid
) returns void
language plpgsql
security definer
as $$
declare
  v_session_id   uuid;
  v_is_correct   boolean;
  v_points        integer;
  v_time_limit    integer;
  v_opened_at     timestamptz;
  v_elapsed       numeric;
  v_points_earned  integer;
  v_slot_valid    boolean;
begin
  -- Get the player's session
  select pl.session_id into v_session_id from players pl where pl.id = p_player_id;

  -- Gate: answer must be in session_question_answers for this session + question
  select exists (
    select 1 from session_question_answers
    where session_id = v_session_id and question_id = p_question_id and answer_id = p_answer_id
  ) into v_slot_valid;

  if not v_slot_valid then
    raise exception 'Answer % is not valid for question % in session %', p_answer_id, p_question_id, v_session_id;
  end if;

  -- Answer correctness and question base points / time limit
  select a.is_correct, q.points, q.time_limit
    into v_is_correct, v_points, v_time_limit
    from answers a
    join questions q on q.id = a.question_id
   where a.id = p_answer_id;

  -- When the current question was opened
  select s.question_opened_at into v_opened_at from sessions s where s.id = v_session_id;

  -- Elapsed seconds; NULL opened_at treated as 0 elapsed → full points
  v_elapsed := extract(epoch from (now() - coalesce(v_opened_at, now())));

  -- Score decay: full points at t=0, half points at t=time_limit, linear between
  if v_time_limit is not null and v_time_limit > 0 then
    v_points_earned := round(v_points * (0.5 + 0.5 * greatest(0.0, 1.0 - v_elapsed / v_time_limit)));
  else
    v_points_earned := v_points;
  end if;

  insert into player_answers (player_id, question_id, answer_id, points_earned)
  values (p_player_id, p_question_id, p_answer_id, v_points_earned);

  if v_is_correct then
    update players set score = score + v_points_earned where id = p_player_id;
  end if;
end;
$$;
