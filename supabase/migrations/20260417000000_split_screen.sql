-- Split-screen: answer slots sent to players as color+icon only
-- Players never receive question text or answer labels.
-- Host controls per-question shuffle; players see only visual slots.

-- Table: per-session, per-question slot assignments
create table session_question_answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  slot_index  integer not null check (slot_index between 0 and 3),
  answer_id   uuid not null references answers(id) on delete cascade,
  color       text not null,
  icon        text not null,
  unique (session_id, question_id, slot_index)
);

alter table session_question_answers enable row level security;
create policy "Allow all on session_question_answers" on session_question_answers for all using (true) with check (true);

-- Column: cached 4-slot array sent to players via sessions realtime subscription
alter table sessions add column current_question_slots jsonb;

-- Function: assign answer slots for a session question (with optional shuffle)
create or replace function assign_answer_slots(
  p_session_id  uuid,
  p_question_id uuid,
  p_shuffle     boolean
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_slot_index integer := 0;
  v_result     jsonb := '[]'::jsonb;
  v_colors     text[] := array['red', 'blue', 'yellow', 'green'];
  v_icons      text[] := array['circle', 'diamond', 'triangle', 'square'];
  v_ordered    uuid[];
  v_i          integer;
  v_j          integer;
  v_tmp        uuid;
  v_ans        uuid;
begin
  -- Collect answer ids in order_index order
  select array_agg(a.id order by a.order_index)
    into v_ordered
    from answers a
   where a.question_id = p_question_id;

  -- Fisher-Yates shuffle if requested
  if p_shuffle and array_length(v_ordered, 1) > 1 then
    for v_i in reverse array_length(v_ordered, 1) .. 2 loop
      v_j := 1 + floor(random() * v_i)::int;
      v_tmp := v_ordered[v_i];
      v_ordered[v_i] := v_ordered[v_j];
      v_ordered[v_j] := v_tmp;
    end loop;
  end if;

  -- Delete any existing slot assignments for this session+question (idempotent on replay)
  delete from session_question_answers where session_id = p_session_id and question_id = p_question_id;

  -- Insert one row per slot using a for loop over the array
  for v_i in 1..coalesce(array_length(v_ordered, 1), 0) loop
    v_ans := v_ordered[v_i];
    insert into session_question_answers (session_id, question_id, slot_index, answer_id, color, icon)
    values (p_session_id, p_question_id, v_slot_index, v_ans, v_colors[v_slot_index + 1], v_icons[v_slot_index + 1]);

    v_result := v_result || jsonb_build_object(
      'slot_index', v_slot_index,
      'answer_id',  v_ans,
      'color',      v_colors[v_slot_index + 1],
      'icon',       v_icons[v_slot_index + 1]
    );

    v_slot_index := v_slot_index + 1;
  end loop;

  return v_result;
end;
$$;

-- Updated submit_answer: validate answer_id via session_question_answers mapping
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
