# Technologies

## Architecture

There is no dynamic server. The app consists of two parts:

- **Supabase** — the entire backend: database, auth, real-time, and server-side logic.
- **Static host** — serves the compiled React app (HTML/CSS/JS). Any static host works (Vercel, Netlify, GitHub Pages, etc.).

All authorization is enforced via Postgres Row Level Security (RLS) policies. Business logic that must be tamper-proof (e.g. score calculation) runs inside the database as Postgres functions, invoked by the client but executed server-side within Supabase.

## Backend: Supabase

- **PostgreSQL** — primary data store for quizzes, questions, sessions, answers, and scores.
- **Row Level Security (RLS)** — enforces who can read and write what, directly at the database level.
- **Supabase Auth** — handles quiz creator accounts (email/password). Players do not need an account. Auth state is exposed app-wide via `AuthContext`; protected routes (`/library`, `/edit`, `/profile`) redirect unauthenticated users to `/login`.
- **Supabase Realtime** — WebSocket-based pub/sub over Postgres changes. Used for syncing session state across host and all players in real time. Enabled on `sessions`, `players`, and `player_answers`.
- **Postgres Functions** — used for logic that must run server-side: session/player creation (with secret generation), host actions (start/advance/close/end), answer submission with scoring, and quiz create/update. All host and player mutations go through security-definer RPCs that verify a secret UUID stored in `localStorage`; no `auth.users` entries are created for players. Key RPCs: `create_session`, `join_session`, `start_game`, `open_next_question`, `close_question`, `end_game`, `submit_answer`, `get_correct_answer_id`, `save_quiz`, `update_quiz`.
- **Supabase Storage** — `images` bucket (public, JPEG, 500 KiB limit) for question images. Upload is restricted to pro users (flagged in `profiles.is_pro`). Images are stored at `{userId}/{questionId}.jpg`.
- **pg_cron** — two scheduled jobs: (1) hourly session cleanup — deletes sessions older than 12 hours (cascade removes players, answers, etc.); (2) daily at 03:00 UTC — calls the `sweep-orphan-images` Edge Function to delete unreferenced objects from the `images` storage bucket.
- **Supabase Edge Functions** — `sweep-orphan-images`: lists all objects in the `images` bucket, compares against `questions.image_url`, and deletes any orphans. Called by pg_cron via `pg_net`.

## Database schema

All tables have RLS enabled. `quizzes`, `questions`, and `answers` are creator-scoped (public quizzes are also readable by everyone). `sessions`, `players`, `player_answers`, and `session_question_answers` are open for anonymous play. `profiles` and `starred_quizzes` are owner-scoped.

### `quizzes`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `title` | text | not null |
| `created_at` | timestamptz | default now() |
| `creator_id` | uuid FK → auth.users | nullable; `on delete set null`; links quiz to its creator |
| `is_public` | boolean | not null; default true; controls visibility to non-owners |
| `language` | text | nullable; BCP-47-style code (e.g. `'en'`, `'de'`); set by creator |
| `topic` | text | nullable; free-form topic tag (e.g. `'Math'`, `'History'`) |

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
| `username` | text | nullable; optional display name |

### `starred_quizzes`
| column | type | notes |
|---|---|---|
| `user_id` | uuid FK → auth.users | PK (composite with `quiz_id`); cascade delete |
| `quiz_id` | uuid FK → quizzes | cascade delete |
| `created_at` | timestamptz | default now() |

## File index

### Planning documents

| File | Purpose |
|---|---|
| `GOAL.md` | Product vision — what we're building and for whom |
| `ARCHITECTURE.md` | Stack decisions, architecture, and full DB schema |
| `TASKS.md` | Technical debt and future ideas |
| `AGENTS.md` | Coding agent instructions and lessons learned (symlinked as `CLAUDE.md`) |

### Page hierarchy and navigation

All routes are static (no dynamic path segments). Session/quiz context is passed via query parameters.

```
/                          Home — join a game (code + nickname) or navigate to host/browse
/login                     Login — email/password auth for quiz creators
/profile                   Profile — view/edit your profile  [protected]
/library                   Library — own quizzes + starred quizzes; start a session  [protected → /login]
/browse                    Browse — public quiz catalogue; start a session (no auth needed)
/host?sessionId=<uuid>     Host — live game management (redirects to /library if no sessionId)
/join?code=<join_code>     Join — join by URL; auto-rejoins if a stored entry exists
/play?code=<join_code>     Play — player game interface (waiting → answering → feedback)
/edit                      Edit — new quiz editor  [protected]
/edit?quizId=<uuid>        Edit — edit existing quiz  [protected]
```

`/create` is not a route — quiz editing lives at `/edit`.

### Static hosting and routing

The app is a standard single-page application. Vite is configured with `base: '/'` so all asset paths are absolute. `public/404.html` is copied verbatim to `dist/404.html` by Vite during the build, so static hosts that serve `404.html` for unknown paths (GitHub Pages, Netlify, etc.) fall back to the SPA shell. React Router handles client-side routing inside the browser.

### Frontend source (`src/`)

| File | Purpose |
|---|---|
| `src/main.jsx` | React entry point; mounts app with `BrowserRouter` |
| `src/App.jsx` | Route definitions: `/`, `/login`, `/library`, `/browse`, `/host`, `/join`, `/play`, `/edit`, `/profile`; wraps tree in `I18nProvider` and `AuthProvider` |
| `src/index.css` | Tailwind CSS import + dark base styles |
| `src/lib/supabase.js` | Supabase client singleton |
| `src/lib/slots.js` | Slot shuffle/color/icon utilities for split-screen answer layout |
| `src/lib/utils.js` | Shared utility helpers |
| `src/lib/imageUpload.js` | Resizes an image file to ≤1500×1000 px, encodes as JPEG, and uploads to the `images` storage bucket; returns the public URL |
| `src/lib/quizExport.js` | `exportQuiz` — serialises a quiz to JSON with base64-embedded images; `importQuiz` — parses JSON, uploads images, and calls `save_quiz` RPC |
| `src/context/AuthContext.jsx` | React context providing `user`, `loading`, and `signOut` from Supabase Auth |
| `src/context/I18nContext.jsx` | Internationalisation context — detects browser language (English/German), exposes `t(key)` translation helper and `setLang`; supported locales live in `src/locales/` |
| `src/locales/en.js` | English UI string table |
| `src/locales/de.js` | German UI string table |
| `src/pages/Home.jsx` | Home — join a game (code + nickname) |
| `src/pages/Login.jsx` | Login — email/password auth |
| `src/pages/Library.jsx` | Library — own quizzes + starred quizzes; protected (redirects to `/login`) |
| `src/pages/Browse.jsx` | Browse — public quiz catalogue with search and starring; no auth required |
| `src/pages/Host.jsx` | Host — thin shell: renders HostSession when `?sessionId` is present, redirects to `/library` otherwise |
| `src/pages/Join.jsx` | Join — join by URL; auto-rejoins if stored credentials exist |
| `src/pages/Play.jsx` | Play — player game interface (waiting → answering → feedback) |
| `src/pages/Edit.jsx` | Edit — create/edit quizzes; protected |
| `src/pages/Profile.jsx` | Profile — view/edit profile; protected |
| `src/components/Header.jsx` | Shared header bar — logo, nav links, language switcher, auth controls |
| `src/components/HostSession.jsx` | Host session shell — orchestrates HostLobby, HostActiveQuestion, HostQuestionReview, and HostResults |
| `src/components/HostLibrary.jsx` | Personal library view — own quizzes + starred quizzes; create, import, export, delete, host |
| `src/components/HostLobby.jsx` | Waiting room — players gather here before the game starts |
| `src/components/HostActiveQuestion.jsx` | Active-question view shown to host during a live question |
| `src/components/HostQuestionReview.jsx` | Between-question review — correct answer highlighted, per-slot response counts, optional top-5 leaderboard |
| `src/components/HostResults.jsx` | Post-session results screen — final leaderboard and per-question breakdown with response distribution and avg time |
| `src/components/FeedbackView.jsx` | Post-answer feedback screen shown to players |
| `src/components/QuestionEditor.jsx` | Question + answer editor sub-component used in Edit |
| `src/components/QuizCard.jsx` | Shared quiz card component (thumbnail, title, tags, actions) and `Section` grid wrapper; used by HostLibrary and Browse |
| `src/components/SlotIcon.jsx` | Renders the colored shape icon for an answer slot |

### Database migrations (`supabase/migrations/`)

Migrations are applied in filename order. Each file is named `<YYYYMMDDHHmmss>_<description>.sql`.

| File | What it does |
|---|---|
| `20260415120000_sweep_orphan_images_cron.sql` | Enables `pg_net`; adds daily pg_cron job to call the `sweep-orphan-images` Edge Function |
| `20260430120000_squash.sql` | Full squashed schema as of 2026-04-30 — replaces all prior individual migrations. Creates all tables, constraints, foreign keys, functions, triggers, RLS policies, realtime publication entries, storage bucket policies, and the hourly session-cleanup cron job |
| `20260501000000_update_quiz_rpc.sql` | Adds `update_quiz(quiz_id, title, is_public, questions jsonb)` RPC for atomic in-place quiz editing |
| `20260502000000_quiz_tags.sql` | Adds `language` and `subject` columns to `quizzes`; updates `save_quiz` and `update_quiz` to accept and persist these fields |
| `20260503000000_rename_subject_to_topic.sql` | Renames `quizzes.subject` → `quizzes.topic`; updates `save_quiz` and `update_quiz` RPC params (`p_subject` → `p_topic`) |

## Quiz export format

Quizzes are exported as `.json` files. The format is self-contained: images are embedded as base64 data URLs so no external requests are needed when importing on another instance.

```json
{
  "version": 1,
  "exported_at": "<ISO 8601 timestamp>",
  "title": "Quiz Title",
  "is_public": true,
  "language": "en",
  "topic": "Math",
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
- `is_public` defaults to `false` on import if absent. `language` and `topic` default to `null`.
- UI: **Export** button per quiz in "My Quizzes" (HostLibrary); **Import** button next to "Create new quiz" (HostLibrary).

## Frontend: React

- **React 19** — UI framework. Supabase Realtime subscriptions integrate naturally with React state via `useEffect`.
- **React Router v7** — client-side routing.
- **Supabase JS client v2** — communicates with Supabase directly from the browser (REST for data, WebSockets for Realtime).
- **Vite 8** — build tool and dev server.
- **Tailwind CSS v4** — utility-first styling via the `@tailwindcss/vite` plugin; no custom CSS infrastructure needed.
