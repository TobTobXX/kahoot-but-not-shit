# Kahoot but not shit

A simple and clean real-time quiz platform. No accounts required to play, no artificial limits, no noise in the UI.

**Try it:** https://kbns.tobtobxx.net/

## How it works

- **Quiz creator** — needs an account; creates and manages quizzes with multiple-choice questions, optional images, per-question time limits and point values.
- **Host** — starts a live session from any public quiz; no account needed. Shares a 6-character join code with players. Advances questions manually, sees live response progress, and gets a full breakdown at the end.
- **Player** — joins with just a code and a nickname. No sign-up. Gets immediate feedback after each answer and sees a live leaderboard between questions.

Scoring is time-decayed and computed server-side. Consecutive correct answers earn a streak bonus.

## Quiz import / export

Quizzes can be exported as self-contained `.json` files (images are base64-embedded) and imported on any instance via the host library screen.

You can use this script [here](scripts/kahoot.com-export.js) to export your quizzes from kahoot.com.
Just go to https://create.kahoot.it/my-library/kahoots/all, open the developer console with F12, paste this script and press Enter. An "Export All Quizzes" button will appear.

## Technology stack

- **Frontend:** React 19, React Router v7, Tailwind CSS v4, Vite
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Storage, pg_cron)
- **No dynamic server** — the compiled static app talks directly to Supabase via the JS client.

## Self-hosting

You need a Supabase project and a static host (Netlify, GitHub Pages, Vercel, etc.).

1. Create a Supabase project.
2. Apply all migrations in `supabase/migrations/` in order (`supabase db push` if you have the CLI linked).
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Build: `npm run build` (or `nix shell nixpkgs#nodejs -c npm run build`).
5. Deploy the `dist/` directory to any static host.

## Development

```sh
nix shell nixpkgs#nodejs -c npm install
nix shell nixpkgs#nodejs -c npm run dev
```
