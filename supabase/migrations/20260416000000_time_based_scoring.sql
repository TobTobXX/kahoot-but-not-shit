-- Time-based scoring (Kahoot-style decay)
-- Adds question_opened_at to sessions, points_earned to player_answers,
-- a trigger to auto-timestamp when a question opens, and updates submit_answer.

-- New column: when the current question was opened
alter table sessions add column question_opened_at timestamptz;

-- New column: actual points awarded for this answer (server-computed)
alter table player_answers add column points_earned integer not null default 0;

-- Trigger function: set question_opened_at whenever the question advances or reopens
create or replace function sessions_set_question_opened_at()
returns trigger
language plpgsql
as $$
begin
  if (new.current_question_index is distinct from old.current_question_index)
     or (new.question_open = true and old.question_open = false) then
    new.question_opened_at := now();
  end if;
  return new;
end;
$$;

create trigger sessions_question_opened_at_trigger
  before update on sessions
  for each row execute function sessions_set_question_opened_at();

-- Updated submit_answer: compute time-decayed points and store in player_answers
create or replace function submit_answer(
  p_player_id   uuid,
  p_question_id uuid,
  p_answer_id   uuid
) returns void
language plpgsql
security definer
as $$
declare
  v_is_correct    boolean;
  v_points        integer;
  v_time_limit    integer;
  v_opened_at     timestamptz;
  v_elapsed       numeric;
  v_points_earned integer;
begin
  -- Answer correctness and question base points / time limit
  select a.is_correct, q.points, q.time_limit
    into v_is_correct, v_points, v_time_limit
    from answers a
    join questions q on q.id = a.question_id
   where a.id = p_answer_id;

  -- When the current question was opened (via the player's session)
  select s.question_opened_at
    into v_opened_at
    from players pl
    join sessions s on s.id = pl.session_id
   where pl.id = p_player_id;

  -- Elapsed seconds; NULL opened_at (edge case) treated as 0 elapsed → full points
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
    update players
       set score = score + v_points_earned
     where id = p_player_id;
  end if;
end;
$$;
