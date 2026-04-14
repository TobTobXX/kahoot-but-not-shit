-- Add streak counter to players; apply flame bonus in submit_answer.
-- A streak is consecutive correct answers. Flames kick in at streak >= 3
-- (+10% per flame). A wrong answer resets streak to 0. A missed answer
-- (no RPC call) leaves streak unchanged.

alter table players add column streak integer not null default 0;

create or replace function submit_answer(
  p_player_id   uuid,
  p_question_id uuid,
  p_answer_id   uuid
) returns void
language plpgsql
security definer
as $$
declare
  v_session_id       uuid;
  v_is_correct       boolean;
  v_points           integer;
  v_time_limit       integer;
  v_opened_at        timestamptz;
  v_elapsed          numeric;
  v_points_earned    integer;
  v_response_time_ms integer;
  v_slot_valid       boolean;
  v_streak           integer;
  v_new_streak       integer;
  v_flame_count      integer;
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

  -- Read current streak before insert so we can compute the new value
  select streak into v_streak from players where id = p_player_id;

  -- Compute new streak and flame count
  v_new_streak  := case when v_is_correct then v_streak + 1 else 0 end;
  v_flame_count := greatest(0, v_new_streak - 2);

  -- When the current question was opened
  select s.question_opened_at into v_opened_at from sessions s where s.id = v_session_id;

  -- Elapsed seconds; NULL opened_at treated as 0 elapsed → full points
  v_elapsed := extract(epoch from (now() - coalesce(v_opened_at, now())));

  -- Score decay: full points at t=0, half points at t=time_limit, linear between
  if v_time_limit is not null and v_time_limit > 0 then
    v_points_earned    := round(v_points * (0.5 + 0.5 * greatest(0.0, 1.0 - v_elapsed / v_time_limit)));
    v_response_time_ms := round(v_elapsed * 1000)::integer;
  else
    v_points_earned    := v_points;
    v_response_time_ms := null;
  end if;

  -- Apply flame bonus (correct) or zero out points (wrong)
  if v_is_correct then
    v_points_earned := round(v_points_earned * (1.0 + v_flame_count * 0.10))::integer;
  else
    v_points_earned := 0;
  end if;

  insert into player_answers (player_id, question_id, answer_id, points_earned, response_time_ms)
  values (p_player_id, p_question_id, p_answer_id, v_points_earned, v_response_time_ms);

  -- Unconditional update: wrong answers add 0 points and reset streak to 0
  update players set score = score + v_points_earned, streak = v_new_streak where id = p_player_id;
end;
$$;
