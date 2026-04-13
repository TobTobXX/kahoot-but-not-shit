# TODOs — v0.1: Session creation and join code

---

## 1. Project setup

- [x] Initialise a Vite + React project in the repo root (`npm create vite@latest . -- --template react`)
- [x] Install dependencies: `@supabase/supabase-js`, `react-router-dom`
- [x] Install and configure Tailwind CSS (follow Vite guide — install, add plugin to vite.config, add directives to index.css)
- [x] Verify dev server starts cleanly

## 2. Supabase client

- [ ] Read `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `.env` (already present in repo root)
- [ ] Create `src/lib/supabase.js` that initialises and exports the Supabase client

## 3. Database schema

Create a single migration file `supabase/migrations/<timestamp>_initial.sql` with the following tables. No RLS yet — enable it per-table but add no policies (so access is fully open for now).

- [ ] `quizzes`: `id` (uuid PK default gen_random_uuid()), `title` (text not null), `created_at` (timestamptz default now())
- [ ] `questions`: `id` (uuid PK), `quiz_id` (uuid FK → quizzes), `order_index` (integer not null), `question_text` (text not null), `time_limit` (integer not null default 30), `points` (integer not null default 1000), `image_url` (text)
- [ ] `answers`: `id` (uuid PK), `question_id` (uuid FK → questions), `order_index` (integer not null), `answer_text` (text not null), `is_correct` (boolean not null default false)
- [ ] `sessions`: `id` (uuid PK), `quiz_id` (uuid FK → quizzes), `join_code` (text not null unique), `state` (text not null default 'waiting'), `current_question_index` (integer), `created_at` (timestamptz default now())
- [ ] `players`: `id` (uuid PK), `session_id` (uuid FK → sessions), `nickname` (text not null), `score` (integer not null default 0), `joined_at` (timestamptz default now())
- [ ] Apply migration via Supabase dashboard or CLI

## 4. Seed data

Insert one quiz with at least 3 questions and 2–4 answers each (one marked correct per question). Do this via the Supabase dashboard SQL editor or a seed script.

- [ ] Insert 1 row into `quizzes`
- [ ] Insert 3+ rows into `questions` (with correct `order_index` values)
- [ ] Insert 2–4 rows per question into `answers` (with exactly one `is_correct = true` per question)

## 5. Routing and app shell

- [ ] Set up `react-router-dom` in `src/main.jsx` with a `BrowserRouter`
- [ ] Create `src/App.jsx` with three routes:
  - `/` → `<Home />`
  - `/host` → `<Host />`
  - `/play/:code` → `<Play />`

## 6. Host page (`src/pages/Host.jsx`)

- [ ] On mount, fetch all quizzes from Supabase and display them as a list (just titles)
- [ ] Each quiz has a "Create session" button
- [ ] On click: generate a random 6-character uppercase alphanumeric join code
- [ ] Insert a new row into `sessions` with the quiz ID, join code, and state `'waiting'`
- [ ] After successful insert, display the join code prominently on screen
- [ ] Display a simple "Waiting for players..." message below the code

## 7. Home page (`src/pages/Home.jsx`)

- [ ] Render a form with two fields: join code (text, max 6 chars, uppercased automatically) and nickname (text)
- [ ] On submit: query `sessions` where `join_code = <entered code>` and `state = 'waiting'`
- [ ] If no session found: show an inline error ("Session not found or already started")
- [ ] If found: insert a new row into `players` (session_id, nickname), store the returned player `id` in `localStorage` under the key `player_id`, then navigate to `/play/<code>`

## 8. Play page (`src/pages/Play.jsx`)

- [ ] Read the `:code` param from the URL
- [ ] On mount, fetch the session from Supabase by join code to confirm it exists
- [ ] Display the player's nickname (read from `localStorage` → look up the player row)
- [ ] Display a "Waiting for the host to start..." message
- [ ] No real-time yet — this screen is static until v0.4

## 9. Smoke test

Manually verify the full flow works:
- [ ] Host creates a session → join code appears
- [ ] Player enters code + nickname → lands on waiting screen
- [ ] Row appears in `players` table in Supabase dashboard
- [ ] Entering a wrong code shows an error
