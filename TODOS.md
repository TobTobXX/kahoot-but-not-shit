# TODOs — v0.1: Session creation and join code

---

## Technical debt

Things intentionally left rough that must be revisited in a later version:

- [ ] **v0.8** — Replace open `allow all` RLS policies with proper user-scoped policies (currently every anonymous client can read and write everything)
- [ ] **v0.8** — `player_id` in `localStorage` is unauthenticated; any client can forge a player identity
- [ ] **future** — Join code collision is unhandled; if a duplicate code is generated the insert fails with a constraint error instead of retrying with a new code
- [ ] **future** — Stale `waiting` sessions accumulate in the DB with no expiry or cleanup mechanism

---

## 1. Project setup

- [x] Initialise a Vite + React project in the repo root (`npm create vite@latest . -- --template react`)
- [x] Install dependencies: `@supabase/supabase-js`, `react-router-dom`
- [x] Install and configure Tailwind CSS (follow Vite guide — install, add plugin to vite.config, add directives to index.css)
- [x] Verify dev server starts cleanly

## 2. Supabase client

- [x] Read `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `.env` (already present in repo root)
- [x] Create `src/lib/supabase.js` that initialises and exports the Supabase client

## 3. Database schema

Create a single migration file `supabase/migrations/<timestamp>_initial.sql` with the following tables. No RLS yet — enable it per-table but add no policies (so access is fully open for now).

- [x] `quizzes`: `id` (uuid PK default gen_random_uuid()), `title` (text not null), `created_at` (timestamptz default now())
- [x] `questions`: `id` (uuid PK), `quiz_id` (uuid FK → quizzes), `order_index` (integer not null), `question_text` (text not null), `time_limit` (integer not null default 30), `points` (integer not null default 1000), `image_url` (text)
- [x] `answers`: `id` (uuid PK), `question_id` (uuid FK → questions), `order_index` (integer not null), `answer_text` (text not null), `is_correct` (boolean not null default false)
- [x] `sessions`: `id` (uuid PK), `quiz_id` (uuid FK → quizzes), `join_code` (text not null unique), `state` (text not null default 'waiting'), `current_question_index` (integer), `created_at` (timestamptz default now())
- [x] `players`: `id` (uuid PK), `session_id` (uuid FK → sessions), `nickname` (text not null), `score` (integer not null default 0), `joined_at` (timestamptz default now())
- [x] Apply migration via Supabase dashboard or CLI

## 4. Seed data

Insert one quiz with at least 3 questions and 2–4 answers each (one marked correct per question). Do this via the Supabase dashboard SQL editor or a seed script.

- [x] Insert 1 row into `quizzes`
- [x] Insert 3+ rows into `questions` (with correct `order_index` values)
- [x] Insert 2–4 rows per question into `answers` (with exactly one `is_correct = true` per question)

## 5. Routing and app shell

- [x] Set up `react-router-dom` in `src/main.jsx` with a `BrowserRouter`
- [x] Create `src/App.jsx` with three routes:
  - `/` → `<Home />`
  - `/host` → `<Host />`
  - `/play/:code` → `<Play />`

## 6. Host page (`src/pages/Host.jsx`)

- [x] On mount, fetch all quizzes from Supabase and display them as a list (just titles)
- [x] Each quiz has a "Create session" button
- [x] On click: generate a random 6-character uppercase alphanumeric join code
- [x] Insert a new row into `sessions` with the quiz ID, join code, and state `'waiting'`
- [x] After successful insert, display the join code prominently on screen
- [x] Display a simple "Waiting for players..." message below the code

## 7. Home page (`src/pages/Home.jsx`)

- [x] Render a form with two fields: join code (text, max 6 chars, uppercased automatically) and nickname (text)
- [x] On submit: query `sessions` where `join_code = <entered code>` and `state = 'waiting'`
- [x] If no session found: show an inline error ("Session not found or already started")
- [x] If found: insert a new row into `players` (session_id, nickname), store the returned player `id` in `localStorage` under the key `player_id`, then navigate to `/play/<code>`

## 8. Play page (`src/pages/Play.jsx`)

- [x] Read the `:code` param from the URL
- [x] On mount, fetch the session from Supabase by join code to confirm it exists
- [x] Display the player's nickname (read from `localStorage` → look up the player row)
- [x] Display a "Waiting for the host to start..." message
- [x] No real-time yet — this screen is static until v0.4

## 9. Smoke test

Manually verify the full flow works:
- [x] Host creates a session → join code appears
- [x] Player enters code + nickname → lands on waiting screen
- [x] Row appears in `players` table in Supabase dashboard
- [x] Entering a wrong code shows an error
