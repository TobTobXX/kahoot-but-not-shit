# kahoot-but-not-shit

A fast, clean, self-hostable real-time quiz platform. No accounts required to play, no artificial limits, no noise in the UI.

**Live instance:** https://kbns.tobtobxx.net/

**Source:** https://github.com/tobtobxx/kahoot-but-not-shit

---

## How it works

Three roles:

- **Quiz creator** — authenticated; creates and manages quizzes with multiple-choice questions, optional images, per-question time limits and point values.
- **Host** — starts a live session from any public quiz; no account needed. Shares a 6-character join code with players. Advances questions manually, sees live response progress, and gets a full breakdown at the end.
- **Player** — joins with just a code and a nickname. No sign-up. Gets immediate feedback after each answer and sees a live leaderboard between questions.

Scoring is time-decayed and computed server-side. Consecutive correct answers earn a streak bonus.

---

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS v4, Vite
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Storage, pg_cron)
- **No dynamic server** — the compiled static app talks directly to Supabase via the JS client.

All authorization is enforced via Postgres Row Level Security. Score calculation runs inside the database as a security-definer Postgres function.

---

## Self-hosting

You need a Supabase project and a static host (Netlify, GitHub Pages, Vercel, etc.).

1. Create a Supabase project.
2. Apply all migrations in `supabase/migrations/` in order (`supabase db push` if you have the CLI linked).
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Build: `npm run build` (or `nix shell nixpkgs#nodejs -c npm run build`).
5. Deploy the `dist/` directory to any static host.

Sessions older than 12 hours are automatically deleted by a pg_cron job.

---

## Quiz import / export

Quizzes can be exported as self-contained `.json` files (images are base64-embedded) and imported on any instance via the host library screen.

---

## Development

```sh
nix shell nixpkgs#nodejs -c npm install
nix shell nixpkgs#nodejs -c npm run dev
```
