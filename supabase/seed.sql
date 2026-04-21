-- Seed data for local development.
-- Applied automatically by `supabase start` (first run) and `supabase db reset`.
-- Provides a public quiz visible in Browse so the full play flow works without
-- needing to create a quiz creator account first.
--
-- Also sets up the Stripe FDW for local dev using the Stripe test key.
-- The migration's DO block skips server/table creation because it runs before
-- this seed file; we complete the setup here once the vault secret exists.

insert into quizzes (id, title, is_public, language, topic)
values ('00000000-0000-0000-0000-000000000001', 'Sample Quiz', true, 'en', 'General');

insert into questions (id, quiz_id, order_index, question_text, time_limit, points)
values
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 0, 'What is 2 + 2?', 30, 1000),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 1, 'What is the capital of France?', 30, 1000),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 2, 'Which planet is closest to the Sun?', 20, 1000);

insert into answers (id, question_id, order_index, answer_text, is_correct)
values
  -- Q1: 2+2
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-000000000001', 0, '3',  false),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-000000000001', 1, '4',  true),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-000000000001', 2, '5',  false),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0001-000000000001', 3, '22', false),
  -- Q2: capital of France
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0001-000000000002', 0, 'London', false),
  ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0001-000000000002', 1, 'Paris',  true),
  ('00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0001-000000000002', 2, 'Berlin', false),
  ('00000000-0000-0000-0002-000000000008', '00000000-0000-0000-0001-000000000002', 3, 'Madrid', false),
  -- Q3: closest planet to Sun
  ('00000000-0000-0000-0002-000000000009', '00000000-0000-0000-0001-000000000003', 0, 'Venus',   false),
  ('00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0001-000000000003', 1, 'Earth',   false),
  ('00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0001-000000000003', 2, 'Mercury', true),
  ('00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0001-000000000003', 3, 'Mars',    false);

-- Create test users
insert into auth.users (id, email, encrypted_password, aud, role, email_confirmed_at)
values
  (
    '8ba02763-c167-4058-bb85-9dad9a096b28',
    'test@tobtobxx.net',
    '$2a$10$r6aXT0bIJP06LYGzfAVlkuddbtY0Ereamj3DNxXyRVvLpNq3jXYFa', -- 123456
    'authenticated',
    'authenticated',
    now()
  ),
  (
    '36d62388-a464-46d3-af33-076bdacddf73',
    'test-pro@tobtobxx.net',
    '$2a$10$r6aXT0bIJP06LYGzfAVlkuddbtY0Ereamj3DNxXyRVvLpNq3jXYFa', -- 123456
    'authenticated',
    'authenticated',
    now()
  );
insert into auth.identities (provider_id, user_id, identity_data, provider)
VALUES 
  (
    '00000000-0000-0000-0000-000000000001',
    '8ba02763-c167-4058-bb85-9dad9a096b28',
    '{"sub": "8ba02763-c167-4058-bb85-9dad9a096b28"}',
    'email'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '36d62388-a464-46d3-af33-076bdacddf73',
    '{"sub": "36d62388-a464-46d3-af33-076bdacddf73"}',
    'email'
  );
update public.subscriptions
  set is_pro = true
  where id = '36d62388-a464-46d3-af33-076bdacddf73';

