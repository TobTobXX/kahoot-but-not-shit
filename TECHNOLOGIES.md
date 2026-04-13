# Technologies

## Architecture

There is no dynamic server. The app consists of two parts:

- **Supabase** — the entire backend: database, auth, real-time, and server-side logic.
- **Static host** — serves the compiled React app (HTML/CSS/JS). Any static host works (Vercel, Netlify, GitHub Pages, etc.).

All authorization is enforced via Postgres Row Level Security (RLS) policies. Business logic that must be tamper-proof (e.g. score calculation) runs inside the database as Postgres functions, invoked by the client but executed server-side within Supabase.

## Backend: Supabase

- **PostgreSQL** — primary data store for quizzes, questions, sessions, answers, and scores.
- **Row Level Security (RLS)** — enforces who can read and write what, directly at the database level.
- **Supabase Auth** — handles quiz creator accounts (email/password). Players do not need an account. Auth state is exposed app-wide via `AuthContext`; protected routes (`/create`, `/edit/:quizId`) redirect unauthenticated users to `/login`.
- **Supabase Realtime** — WebSocket-based pub/sub over Postgres changes. Used for syncing session state across host and all players in real time. Enabled on `sessions`, `players`, and `player_answers`.
- **Postgres Functions** — used for logic that must run server-side, most importantly score calculation on answer submission.

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

### Page hierarchy and navigation

```
/                   Home — join a game (code + nickname) or navigate to host
├── /login          Login — email/password auth for quiz creators
├── /host           HostLibrary — browse quizzes, pick one to host (creator hub)
│   └── /host/:id   HostSession — live game management
│                     ├── waiting   HostLobby — players gather, host starts game
│                     ├── active    HostActiveQuestion — question in progress
│                     └── finished  end screen (back to library or host again)
├── /join/:code     Join — join by URL; auto-rejoins if a stored entry exists
├── /play/:code     Play — player game interface (waiting → answering → feedback)
├── /create         Create — new quiz editor  [protected]
└── /edit/:quizId   Create — edit existing quiz  [protected]
```

`/library` redirects to `/host`.

### Frontend source (`src/`)

| File | Purpose |
|---|---|
| `src/main.jsx` | React entry point; mounts app with `BrowserRouter` |
| `src/App.jsx` | Route definitions: `/`, `/login`, `/host`, `/host/:sessionId`, `/join/:code`, `/play/:code`, `/create`, `/edit/:quizId`; `/library` redirects to `/host` |
| `src/index.css` | Tailwind CSS import + dark base styles |
| `src/lib/supabase.js` | Supabase client singleton |
| `src/lib/slots.js` | Slot shuffle/color/icon utilities for split-screen answer layout |
| `src/lib/utils.js` | Shared utility helpers |
| `src/context/AuthContext.jsx` | React context providing `user`, `loading`, and `signOut` from Supabase Auth |
| `src/pages/Home.jsx` | Landing page — join a game by code, or navigate to host/login |
| `src/pages/Login.jsx` | Auth page — email/password login for quiz creators |
| `src/pages/Host.jsx` | Thin router — renders `HostLibrary` or `HostSession` depending on URL |
| `src/pages/Join.jsx` | Join page — join by URL; handles auto-rejoin and fresh join |
| `src/pages/Create.jsx` | Quiz editor — create and edit quizzes and their questions |
| `src/pages/Play.jsx` | Player interface — answer questions, see feedback + leaderboard |
| `src/components/HostSession.jsx` | Host session shell — wraps HostLobby, and active-question views |
| `src/components/HostLibrary.jsx` | Quiz picker — browse own and public quizzes, start a session |
| `src/components/HostLobby.jsx` | Waiting room — players gather here before the game starts |
| `src/components/HostActiveQuestion.jsx` | Active-question view shown to host during a live question |
| `src/components/FeedbackView.jsx` | Post-answer feedback screen shown to players |
| `src/components/QuestionEditor.jsx` | Question + answer editor sub-component used in Create |
| `src/components/SlotIcon.jsx` | Renders the colored shape icon for an answer slot |

### Database migrations (`supabase/migrations/`)

| File | What it does |
|---|---|
| `20260413123158_initial.sql` | Creates core schema: `quizzes`, `questions`, `answers`, `sessions`, `players` |
| `20260413123159_seed.sql` | Inserts sample quiz "General Knowledge" with 3 questions |
| `20260413123160_open_policies.sql` | Open `allow all` RLS policies for all 5 core tables |
| `20260413130000_enable_realtime_sessions.sql` | Adds `sessions` to the Supabase realtime publication |
| `20260414000000_player_answers.sql` | Adds `player_answers` table + `question_open` on `sessions`; enables realtime on `player_answers` and `players` |
| `20260414000001_player_answers_policy.sql` | Open `allow all` RLS policy for `player_answers` |
| `20260415000000_server_side_scoring.sql` | Tightens RLS on `players`/`player_answers`; adds `submit_answer` security-definer function |
| `20260416000000_time_based_scoring.sql` | Adds `question_opened_at` on `sessions`, `points_earned` on `player_answers`; updates `submit_answer` with time-decay scoring |
| `20260417000000_split_screen.sql` | Adds `session_question_answers` table, `current_question_slots` on `sessions`; shuffle/open question flow; updates `submit_answer` to validate slot membership |
| `20260413195737_auth_quizzes.sql` | Adds `creator_id` + `is_public` to `quizzes`; enables realtime on `session_question_answers` |
| `20260413195738_rls_auth.sql` | Replaces open policies with user-scoped RLS for `quizzes`, `questions`, `answers` |
| `20260413195739_submit_answer_gate.sql` | Adds auth-uid gate to `submit_answer` (later superseded) |
| `20260413195740_fix_submit_answer_gate.sql` | Removes incorrect auth gate from `submit_answer` (player IDs are not auth UIDs) |

## Frontend: React

- **React 19** — UI framework. Supabase Realtime subscriptions integrate naturally with React state via `useEffect`.
- **React Router v7** — client-side routing.
- **Supabase JS client v2** — communicates with Supabase directly from the browser (REST for data, WebSockets for Realtime).
- **Vite 8** — build tool and dev server.
- **Tailwind CSS v4** — utility-first styling via the `@tailwindcss/vite` plugin; no custom CSS infrastructure needed.
