# Technologies

## Architecture

There is no dynamic server. The app consists of two parts:

- **Supabase** — the entire backend: database, auth, real-time, and server-side logic.
- **Static host** — serves the compiled React app (HTML/CSS/JS). Any static host works (Vercel, Netlify, GitHub Pages, etc.).

All authorization is enforced via Postgres Row Level Security (RLS) policies. Business logic that must be tamper-proof (e.g. score calculation) runs inside the database as Postgres functions, invoked by the client but executed server-side within Supabase.

## Backend: Supabase

- **PostgreSQL** — primary data store for quizzes, questions, sessions, answers, and scores.
- **Row Level Security (RLS)** — enforces who can read and write what, directly at the database level.
- **Supabase Auth** — handles quiz creator accounts (email/password). Players do not need an account. Auth state is exposed app-wide via `AuthContext`; protected routes (`/create`, `/edit`) redirect unauthenticated users to `/login`.
- **Supabase Realtime** — WebSocket-based pub/sub over Postgres changes. Used for syncing session state across host and all players in real time. Enabled on `sessions`, `players`, and `player_answers`.
- **Postgres Functions** — used for logic that must run server-side: session/player creation (with secret generation), host actions (start/advance/close/end), answer submission with scoring, and quiz save. All host and player mutations go through security-definer RPCs that verify a secret UUID stored in `localStorage`; no `auth.users` entries are created for players.
- **Supabase Storage** — `images` bucket (public, JPEG, 500 KiB limit) for question images. Upload is restricted to pro users (flagged in `profiles.is_pro`). Images are stored at `{userId}/{questionId}.jpg`.
- **pg_cron** — scheduled job runs hourly to delete sessions older than 12 hours (cascade removes players, answers, etc.).

## Database schema

All tables have RLS enabled. As of v0.9, user-scoped policies are in place: `quizzes`, `questions`, and `answers` are creator-scoped; `sessions`, `players`, `player_answers`, and `session_question_answers` remain open (anonymous play).

### `quizzes`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `title` | text | not null |
| `created_at` | timestamptz | default now() |
| `creator_id` | uuid FK → auth.users | nullable; `on delete set null`; links quiz to its creator |
| `is_public` | boolean | not null; default true; controls visibility to non-owners |

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
| `current_question_slots` | jsonb | nullable; array of 4 answer slot assignments sent to players via realtime |
| `host_secret` | uuid | not null; hidden from all client roles; stored in `localStorage` as `host_secret`; verified by host action RPCs |
| `created_at` | timestamptz | default now() |

### `session_question_answers`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → sessions | cascade delete |
| `question_id` | uuid FK → questions | cascade delete |
| `slot_index` | integer | 0–3; display position |
| `answer_id` | uuid FK → answers | which answer this slot maps to |
| `color` | text | `'red'`, `'blue'`, `'yellow'`, `'green'` |
| `icon` | text | `'circle'`, `'diamond'`, `'triangle'`, `'square'` |
| — | unique | `(session_id, question_id, slot_index)` |

### `players`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | stored in client `localStorage` as `player_id` |
| `session_id` | uuid FK → sessions | cascade delete |
| `nickname` | text | not null |
| `score` | integer | not null; default 0 |
| `streak` | integer | not null; default 0; consecutive correct answers |
| `correct_count` | integer | not null; default 0; total correct answers |
| `secret` | uuid | not null; hidden from all client roles; stored in `localStorage` as `player_secret`; verified by `submit_answer` RPC |
| `joined_at` | timestamptz | default now() |

### `player_answers`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `player_id` | uuid FK → players | cascade delete |
| `question_id` | uuid FK → questions | cascade delete |
| `answer_id` | uuid FK → answers | |
| `points_earned` | integer | not null; default 0; server-computed time-decayed score for this answer |
| `response_time_ms` | integer | nullable; milliseconds from question open to answer submission |
| `created_at` | timestamptz | default now() |
| — | unique | `(player_id, question_id)` — one answer per player per question |

### `profiles`
| column | type | notes |
|---|---|---|
| `id` | uuid PK FK → auth.users | cascade delete |
| `is_pro` | boolean | not null; default false; set manually via Supabase dashboard; gates image upload |

## File index

### Planning documents

| File | Purpose |
|---|---|
| `GOAL.md` | Product vision — what we're building and for whom |
| `ARCHITECTURE.md` | Stack decisions, architecture, and full DB schema |
| `STEPS.md` | Nine incremental versions (v0.1–v0.9) with checklists |
| `TODOS.md` | Detailed task list for the current version |
| `AGENTS.md` | Coding agent instructions and lessons learned |

### Page hierarchy and navigation

All routes are static (no dynamic path segments). Session/quiz context is passed via query parameters.

```
/                          Home — join a game (code + nickname) or navigate to host
/login                     Login — email/password auth for quiz creators
/profile                  Profile — view/edit your profile  [protected]
/host                     HostLibrary — browse quizzes, pick one to host
/host?sessionId=<uuid>     HostSession — live game management
/join?code=<join_code>     Join — join by URL; auto-rejoins if a stored entry exists
/play?code=<join_code>     Play — player game interface (waiting → answering → feedback)
/edit                     Create — new quiz editor  [protected]
/edit?quizId=<uuid>        Create — edit existing quiz  [protected]
```

`/library` redirects to `/host`. `/create` is not a route — quiz editing lives at `/edit`.

### Static hosting and routing

Because all routes are static paths, the app uses Vite's [multi-page app](https://vite.dev/guide/build#multi-page-app) build mode. Each route has its own `<route>/index.html` at the project root (e.g. `host/index.html`, `join/index.html`). Vite is configured in `vite.config.js` with `build.rolldownOptions.input` listing all route HTML files.

This produces a `dist/` tree where every route is a real directory with its own `index.html`, so a static file server (GitHub Pages, Netlify, etc.) can serve any route directly without redirect hacks or fallback rules.

### Route entry points

Each route directory at the project root contains an `index.html` that is identical to the root `index.html` and serves as the Vite entry point for that route: `login/`, `host/`, `join/`, `play/`, `edit/`, `library/`.

### Frontend source (`src/`)

| File | Purpose |
|---|---|
| `src/main.jsx` | React entry point; mounts app with `BrowserRouter` |
| `src/App.jsx` | Route definitions: `/`, `/login`, `/host`, `/join`, `/play`, `/edit`, `/profile`; context passed via query params; `/library` redirects to `/host` |
| `src/index.css` | Tailwind CSS import + dark base styles |
| `src/lib/supabase.js` | Supabase client singleton |
| `src/lib/slots.js` | Slot shuffle/color/icon utilities for split-screen answer layout |
| `src/lib/utils.js` | Shared utility helpers |
| `src/lib/imageUpload.js` | Resizes an image file to ≤1500×1000 px, encodes as JPEG, and uploads to the `images` storage bucket; returns the public URL |
| `src/lib/quizExport.js` | `exportQuiz` — serialises a quiz to JSON with base64-embedded images; `importQuiz` — parses JSON, uploads images, and calls `save_quiz` RPC |
| `src/context/AuthContext.jsx` | React context providing `user`, `loading`, and `signOut` from Supabase Auth |
| `src/pages/` | One file per route: `Home`, `Login`, `Host` (thin router → HostLibrary or HostSession), `Join`, `Edit`, `Play` |
| `src/components/Header.jsx` | Shared header bar — logo, library link, auth controls (login/logout/create) |
| `src/components/HostSession.jsx` | Host session shell — orchestrates HostLobby, HostActiveQuestion, HostQuestionReview, and HostResults |
| `src/components/HostLibrary.jsx` | Quiz picker — browse own and public quizzes, start a session, import/export |
| `src/components/HostLobby.jsx` | Waiting room — players gather here before the game starts |
| `src/components/HostActiveQuestion.jsx` | Active-question view shown to host during a live question |
| `src/components/HostQuestionReview.jsx` | Between-question review — correct answer highlighted, per-slot response counts, optional top-5 leaderboard |
| `src/components/HostResults.jsx` | Post-session results screen — final leaderboard and per-question breakdown with response distribution and avg time |
| `src/components/FeedbackView.jsx` | Post-answer feedback screen shown to players |
| `src/components/QuestionEditor.jsx` | Question + answer editor sub-component used in Edit |
| `src/components/SlotIcon.jsx` | Renders the colored shape icon for an answer slot |

### Database migrations (`supabase/migrations/`)

Migrations are applied in filename order. Each file is named `<YYYYMMDDHHmmss>_<description>.sql`.

| File | What it does |
|---|---|
| `…_initial.sql` | Creates core schema: `quizzes`, `questions`, `answers`, `sessions`, `players` |
| `…_seed.sql` | Inserts sample quiz "General Knowledge" with 3 questions |
| `…_open_policies.sql` | Open `allow all` RLS policies for all 5 core tables |
| `…_enable_realtime_sessions.sql` | Adds `sessions` to the Supabase realtime publication |
| `…_player_answers.sql` | Adds `player_answers` table + `question_open` on `sessions`; enables realtime on `player_answers` and `players` |
| `…_player_answers_policy.sql` | Open `allow all` RLS policy for `player_answers` |
| `…_session_cleanup_cron.sql` | Enables `pg_cron`; schedules hourly job to delete sessions older than 12 h |
| `…_auth_quizzes.sql` | Adds `creator_id` + `is_public` to `quizzes`; enables realtime on `session_question_answers` |
| `…_rls_auth.sql` | Replaces open policies with user-scoped RLS for `quizzes`, `questions`, `answers` |
| `…_submit_answer_gate.sql` | Adds auth-uid gate to `submit_answer` (later superseded) |
| `…_fix_submit_answer_gate.sql` | Removes incorrect auth gate from `submit_answer` (player IDs are not auth UIDs) |
| `…_server_side_scoring.sql` | Tightens RLS on `players`/`player_answers`; adds `submit_answer` security-definer function |
| `…_time_based_scoring.sql` | Adds `question_opened_at` on `sessions`, `points_earned` on `player_answers`; updates `submit_answer` with time-decay scoring |
| `…_split_screen.sql` | Adds `session_question_answers` table, `current_question_slots` on `sessions`; shuffle/open question flow; updates `submit_answer` to validate slot membership |
| `…_response_time.sql` | Adds `response_time_ms` to `player_answers`; persists elapsed time in `submit_answer` |
| `…_streaks.sql` | Adds `streak` to `players`; applies streak flame bonus (+10% per flame ≥3) in `submit_answer` |
| `…_correct_count.sql` | Adds `correct_count` to `players`; incremented by `submit_answer` on correct answers |
| `…_save_quiz_rpc.sql` | Adds `save_quiz(title, is_public, questions jsonb)` RPC for atomic quiz creation |
| `…_restrict_answers.sql` | Revokes `is_correct` SELECT from `anon` role; adds `get_correct_answer_id` RPC (gated on question being closed) |
| `…_players_rls.sql` | Drops open UPDATE policy on `players`; keeps SELECT + INSERT open |
| `…_submit_answer_guards.sql` | Adds window-open and current-question guards to `submit_answer` |
| `…_pro_images.sql` | Adds `profiles` table (`is_pro`); creates `images` storage bucket; upload restricted to pro users |
| `…_images_select_policy.sql` | Scopes images SELECT policy to authenticated users reading their own folder |
| `…_images_jpeg.sql` | Switches `images` bucket from JPEG-XL to JPEG |
| `…_anon_secrets.sql` | Adds `host_secret` to `sessions` and `secret` to `players`; hides both from client roles; adds host-action RPCs (`create_session`, `join_session`, `start_game`, `open_next_question`, `close_question`, `end_game`) and updates `submit_answer` to require `p_player_secret` |

## Quiz export format

Quizzes are exported as `.json` files. The format is self-contained: images are embedded as base64 data URLs so no external requests are needed when importing on another instance.

```json
{
  "version": 1,
  "exported_at": "<ISO 8601 timestamp>",
  "title": "Quiz Title",
  "is_public": true,
  "questions": [
    {
      "question_text": "What is 2+2?",
      "time_limit": 30,
      "points": 1000,
      "image_data": "data:image/jpeg;base64,<...>",
      "answers": [
        { "answer_text": "4", "is_correct": true },
        { "answer_text": "3", "is_correct": false }
      ]
    }
  ]
}
```

- Database UUIDs are stripped; new ones are assigned on import via the `save_quiz` RPC.
- `order_index` is derived from array position on both export and import.
- `image_data` is `null` when the question has no image. If a fetch fails during export, the field is also `null` (image silently skipped).
- `is_public` defaults to `true` on import if absent.
- UI: **Export** button per quiz in "My Quizzes" (HostLibrary); **Import** button next to "Create new quiz" (HostLibrary).

## Frontend: React

- **React 19** — UI framework. Supabase Realtime subscriptions integrate naturally with React state via `useEffect`.
- **React Router v7** — client-side routing.
- **Supabase JS client v2** — communicates with Supabase directly from the browser (REST for data, WebSockets for Realtime).
- **Vite 8** — build tool and dev server.
- **Tailwind CSS v4** — utility-first styling via the `@tailwindcss/vite` plugin; no custom CSS infrastructure needed.
