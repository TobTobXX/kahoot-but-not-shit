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
- **Supabase Realtime** — WebSocket-based pub/sub over Postgres changes. Used for syncing session state across host and all players in real time.
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
| `created_at` | timestamptz | default now() |

### `players`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | stored in client `localStorage` as `player_id` |
| `session_id` | uuid FK → sessions | cascade delete |
| `nickname` | text | not null |
| `score` | integer | not null; default 0 |
| `joined_at` | timestamptz | default now() |

## Frontend: React

- **React** — UI framework. Supabase Realtime subscriptions integrate naturally with React state via `useEffect`.
- **Supabase JS client** — communicates with Supabase directly from the browser (REST for data, WebSockets for Realtime).
- **Vite** — build tool and dev server.
- **Tailwind CSS** — utility-first styling, no custom CSS infrastructure needed.
