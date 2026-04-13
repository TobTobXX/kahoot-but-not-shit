# Technologies

## Architecture

There is no dynamic server. The app consists of two parts:

- **Supabase** — the entire backend: database, auth, real-time, and server-side logic.
- **Static host** — serves the compiled React app (HTML/CSS/JS). Any static host works (Vercel, Netlify, GitHub Pages, etc.).

All authorization is enforced via Postgres Row Level Security (RLS) policies. Business logic that must be tamper-proof (e.g. score calculation) runs inside the database as Postgres functions, invoked by the client but executed server-side within Supabase.

## Backend: Supabase

- **PostgreSQL** — primary data store for quizzes, questions, sessions, answers, and scores.
- **Row Level Security (RLS)** — enforces who can read and write what, directly at the database level.
- **Supabase Auth** — handles quiz creator accounts. Players do not need an account.
- **Supabase Realtime** — WebSocket-based pub/sub over Postgres changes. Used for syncing session state across host and all players in real time. Enabled on `sessions`, `players`, and `player_answers`.
- **Postgres Functions** — used for logic that must run server-side, most importantly score calculation on answer submission.

## Database schema

All tables have RLS enabled. Until v0.8 there are open `allow all` policies; proper user-scoped policies replace them then.

### `quizzes`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `title` | text | not null |
| `created_at` | timestamptz | default now() |

### `questions`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `quiz_id` | uuid FK → quizzes | cascade delete |
| `order_index` | integer | not null; 0-based display order |
| `question_text` | text | not null |
| `time_limit` | integer | seconds; default 30 |
| `points` | integer | default 1000 |
| `image_url` | text | nullable |

### `answers`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `question_id` | uuid FK → questions | cascade delete |
| `order_index` | integer | not null; 0-based display order |
| `answer_text` | text | not null |
| `is_correct` | boolean | not null; default false |

### `sessions`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `quiz_id` | uuid FK → quizzes | |
| `join_code` | text | not null; unique; 6-char uppercase alphanumeric |
| `state` | text | `'waiting'` → `'active'` → `'finished'` |
| `current_question_index` | integer | nullable; index into questions |
| `question_open` | boolean | default true; controls whether the current question accepts answers |
| `question_opened_at` | timestamptz | nullable; set automatically by trigger when question advances or reopens |
| `created_at` | timestamptz | default now() |

### `players`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | stored in client `localStorage` as `player_id` |
| `session_id` | uuid FK → sessions | cascade delete |
| `nickname` | text | not null |
| `score` | integer | not null; default 0 |
| `joined_at` | timestamptz | default now() |

### `player_answers`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `player_id` | uuid FK → players | cascade delete |
| `question_id` | uuid FK → questions | cascade delete |
| `answer_id` | uuid FK → answers | |
| `points_earned` | integer | not null; default 0; server-computed time-decayed score for this answer |
| `created_at` | timestamptz | default now() |
| — | unique | `(player_id, question_id)` — one answer per player per question |

## File index

### Planning documents

| File | Purpose |
|---|---|
| `GOAL.md` | Product vision — what we're building and for whom |
| `TECHNOLOGIES.md` | Stack decisions, architecture, and full DB schema |
| `STEPS.md` | Nine incremental versions (v0.1–v0.9) with checklists |
| `TODOS.md` | Detailed task list for the current version |
| `AGENTS.md` | Coding agent instructions and lessons learned |

### Frontend source (`src/`)

| File | Purpose |
|---|---|
| `src/main.jsx` | React entry point; mounts app with `BrowserRouter` |
| `src/App.jsx` | Route definitions: `/`, `/host`, `/host/:sessionId`, `/play/:code` |
| `src/index.css` | Tailwind CSS import + dark base styles |
| `src/lib/supabase.js` | Supabase client singleton |
| `src/pages/Home.jsx` | Landing page — player enters join code + nickname |
| `src/pages/Host.jsx` | Host interface — quiz selection, session management, question progression |
| `src/pages/Play.jsx` | Player interface — answer questions, see feedback + leaderboard |

### Database migrations (`supabase/migrations/`)

| File | What it does |
|---|---|
| `20260413123158_initial.sql` | Creates core schema: `quizzes`, `questions`, `answers`, `sessions`, `players` |
| `20260413123159_seed.sql` | Inserts sample quiz "General Knowledge" with 3 questions |
| `20260413123160_open_policies.sql` | Open `allow all` RLS policies for all 5 core tables |
| `20260413130000_enable_realtime_sessions.sql` | Adds `sessions` to the Supabase realtime publication |
| `20260414000000_player_answers.sql` | Adds `player_answers` table + `question_open` on `sessions`; enables realtime on `player_answers` and `players` |
| `20260414000001_player_answers_policy.sql` | Open `allow all` RLS policy for `player_answers` |
| `20260416000000_time_based_scoring.sql` | Adds time-based scoring: question_opened_at on sessions, points_earned on player_answers, trigger, updated submit_answer |

## Frontend: React

- **React 19** — UI framework. Supabase Realtime subscriptions integrate naturally with React state via `useEffect`.
- **React Router v7** — client-side routing.
- **Supabase JS client v2** — communicates with Supabase directly from the browser (REST for data, WebSockets for Realtime).
- **Vite 8** — build tool and dev server.
- **Tailwind CSS v4** — utility-first styling via the `@tailwindcss/vite` plugin; no custom CSS infrastructure needed.
