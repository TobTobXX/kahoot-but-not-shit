-- Auth: creator_id + is_public on quizzes
-- Nullable creator_id preserves legacy seed data (no migration needed for auth.users itself)

alter table quizzes add column creator_id uuid references auth.users(id) on delete set null;
alter table quizzes add column is_public boolean not null default true;

-- Enable realtime on session_question_answers so players receive slot updates
alter publication supabase_realtime add table session_question_answers;
