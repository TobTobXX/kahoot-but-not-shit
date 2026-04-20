# Coding Agent Instructions

## Project overview

This is a self-hostable real-time quiz platform — a better Kahoot. Read the planning documents before doing any work:

- **[GOAL.md](GOAL.md)** — what we're building and for whom (player, host, quiz creator)
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — full architecture reference: tech stack, backend services, DB schema, file index, routing, migrations log, and quiz export format.
- **[TASKS.md](TASKS.md)** — Technical debt and outstanding tasks: Get a bigger view of the project trajectory

Always read these files at the start of a session to orient yourself before touching any code.

(by the way, CLAUDE.md is just a symlink to AGENTS.md. NEVER edit CLAUDE.md.)

## Workflow

Use this workflow when working on anything beyond a single-line mechanical fix (renaming a variable, fixing a typo, etc.). When in doubt, use the full workflow.

1. **Read context** — read GOAL.md, ARCHITECTURE.md, and TASKS.md to orient yourself.
2. **Analyse request** — identify what the user wants. Prepare questions if things are unclear.
3. **Read relevant code** — read whichever existing files are relevant to the upcoming work.
4. **Draft a plan of action** — concrete, ordered steps you will take. Use the TaskCreate or todowrite (or other applicable) tools.
5. **Anticipate challenges** — identify anything that could go wrong, ambiguities in the spec, discrepancies between existing code and the plan, or external dependencies that need user action.
6. **Write a Briefing** — summarise the goal, the findings from step 5, the planned steps from step 4, and explicitly flag every point where the user is required to act (e.g. Supabase dashboard steps, credentials, manual verification). If steps 2–5 surfaced unclear details, ask the user for clarification here.
7. **Get approval** — present the briefing and plan to the user and wait for explicit approval before proceeding.
> **HARD GATE: do not create or edit any file until the user approves the plan in step 7.** Presenting the plan and immediately executing it is a workflow violation.

8. **Execute** — work through all tasks. Use TaskUpdate to mark progress. Commit after every logical unit of work.
9. **Review for technical debt** — after the session's work is done, reflect on anything deferred, worked around, or left imperfect. Present candidate debt items to the user and ask whether any should be added to the technical debt section of TASKS.md.
10. **Review for lessons learned** — reflect on anything non-obvious that came up during the session (API quirks, tooling gotchas, React patterns, etc.). Present candidate lessons to the user and ask whether any should be added to the "Lessons learned" section of AGENTS.md.

## Running tools

Most tools are not installed globally. Run them via Nix:

```
nix run nixpkgs#nodejs                                      -- ...   # node, npm, npx
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- ...   # supabase CLI (use unstable for current version)
```

When a command would normally be `npm install`, use `nix run nixpkgs#nodejs -- npm install` (or wrap it in `nix shell nixpkgs#nodejs` for a multi-step workflow). Apply the same pattern for any other tool that may not be on PATH.

### Key gotchas for npm/vite in this project

- `nix run nixpkgs#nodejs -- npm run build` fails with "Cannot find module 'npm'" — use `nix shell nixpkgs#nodejs -c npm run build` instead (the double-dash form breaks when the command itself is a wrapper script).
- `npx vite build` fails because npx isn't on PATH — use `nix shell nixpkgs#nodejs -c npx vite build`.
- `npm run lint` works fine via `nix shell nixpkgs#nodejs -c npm run lint`.

## Supabase CLI

The CLI is aliased as `nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli --` throughout this section.

### Local development

If using **Podman** instead of Docker Desktop, export the socket before running any Supabase CLI commands:

```bash
export DOCKER_HOST=unix:///run/user/1000/podman/podman.sock
```

Start the full Supabase stack (Postgres, Auth, Storage, Realtime, Studio, Edge Runtime):

```bash
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- start
```

On first run this pulls Docker images and applies all migrations automatically.
Studio is at http://localhost:54323. The output includes the local anon key — copy it into `.env.local`.

Key local commands:

```bash
# Start (preserves existing DB data between restarts)
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- start

# Stop
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- stop

# Reset DB: drops everything, reruns all migrations + supabase/seed.sql
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- db reset

# Serve Edge Functions locally with dev secrets
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- functions serve --env-file supabase/functions/.env
```

#### Known local limitations

- **Cron job** (`20260415120000_sweep_orphan_images_cron.sql`) hardcodes the production Edge Function URL. The job registers in the local DB but is harmless — it fires at 03:00 UTC and calls the production cleanup endpoint.
- The seed data doesn't include accounts and the stripe FDW. Warn the user before resetting the db.

### Remote (production)

The project is linked to a remote Supabase instance (credentials stored in `supabase/.temp/`). Key commands:

```bash
# Apply pending migrations to the remote DB
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- db push

# Pull the current remote schema as a migration (useful after dashboard changes)
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- db pull

# Diff local migrations vs remote DB schema
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- db diff

# Deploy an Edge Function
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- functions deploy <function-name>

# Set a production secret (do this before deploying a function that reads it)
nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli -- secrets set KEY=value
```

Migration files live in `supabase/migrations/` and are named `<YYYYMMDDHHmmss>_<description>.sql`.
Seed data (`supabase/seed.sql`) is local-only — it runs on `db reset` but is never pushed to production.

## Git discipline

Commit frequently — after every logical unit of work (a new file, a working feature, a schema change). Do not batch unrelated changes into one commit. Commit messages should be short and describe what changed, not just which files were touched.

Example cadence:
- Add Vite + React project scaffold → commit
- Add Tailwind → commit
- Add Supabase client → commit
- Add DB migration → commit
- Implement host page → commit
- Implement home page → commit
- etc.

### Git commands

The shell working directory is the project root, so plain `git` commands work with no flags needed. Always specify explicit file paths in `git add` — never use `git add -A` or `git add .` as these can accidentally stage untracked or sensitive files.

```bash
# Stage specific files, then commit
git add src/pages/Host.jsx supabase/migrations/xyz.sql
git commit -m "short description\n\nAssisted-by: Claude Code:claude-sonnet-4-6"

# For changes to already-tracked files only (no new files), shorthand:
git commit -am "short description\n\nAssisted-by: Opencode:gemma-4"

# With AI attribution (use a heredoc to keep the trailer on its own line)
# More detailed commits
git commit -m "$(cat <<'EOF'
Implement quiz editor

This commit implements the quiz editor, but doesn't do authentication.
In the quiz editor you can do:
 - This
 - That
...

Assisted-by: Opencode:minimax-m2.7
EOF
)"
```

### Git tags

Tag each version when all boxes in TASKS.md are checked. Always pass `-m` — omitting it opens an interactive editor:

```bash
git tag v0.9 -m "v0.9"
```

You may add update notes to the tag.

### AI attribution

When AI tools contribute to a commit, include an `Assisted-by: AGENT_NAME:MODEL_VERSION` trailer in the commit message body.
AGENT_NAME is the name of the agent harness (eg. "Claude Code" or "Opencode", ...)
MODEL_VERSION is what model YOU are (eg. "Claude Sonnet 4.6", "Minimax M2.7", "Gemma 4", ...)

## Environment

There is no dynamic server. The frontend talks directly to Supabase via the JS client.

### Frontend env files

| File | Contents | Committed? |
|---|---|---|
| `.env` | Production `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | No |
| `.env.local` | Local dev overrides — same keys pointing at `http://127.0.0.1:54321` | No |

Vite loads `.env.local` with higher priority than `.env`, so local overrides never affect production builds. See `.env.example` for the full template.

Never hardcode Supabase credentials.

### Edge Function secrets

| Location | Used when | Committed? |
|---|---|---|
| `supabase/functions/.env` | `functions serve` (local dev) | No |
| Supabase dashboard / `supabase secrets set` | Production Edge Functions | N/A |

`supabase/functions/.env` holds dev Stripe credentials (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`). See `supabase/functions/.env.example`.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the local runtime — do not put them in `.env`.

## Lessons learned

### Supabase realtime

- **Scope of a realtime channel filter** — Supabase realtime uses Postgres-level filters (`id=eq.xxx`). The `filter` option in `postgres_changes` must use Postgres syntax (`id=eq.${id}`), not the Supabase JS client syntax.
- **Async callbacks** — Do not use `async` on the realtime `on('UPDATE')` callback. It can cause state update ordering issues (stale closures, race conditions). Instead, fire off non-blocking DB calls with `.then()` inside the synchronous callback.
- **Filter column naming** — The realtime filter key uses Postgres column names with underscores, not camelCase JS keys. Use `join_code=eq.${code}`, not `joinCode=eq.${code}`.
- **Enabling realtime** — `supabase db push` only handles SQL migrations. Enabling realtime on a table requires either the Supabase dashboard or a raw SQL migration (`ALTER PUBLICATION supabase_realtime ADD TABLE <name>`). The CLI has no `realtime enable` command.

### Supabase CLI versioning

- **`schedule` in `config.toml` is not supported** — even in v2.90.0, the `[functions.<name>]` block does not accept a `schedule` key; the CLI rejects it with "invalid keys". To schedule an Edge Function, use a pg_cron migration with `net.http_post` instead (see `supabase/migrations/20260415120000_sweep_orphan_images_cron.sql`).
- **Use nixpkgs-unstable for a newer CLI** — `nix run nixpkgs#supabase-cli` gives v2.60.0. Use `nix run github:nixos/nixpkgs/nixpkgs-unstable#supabase-cli` to get v2.90.0 (the current latest). Apply the same pattern for other tools that need a newer version than what stable nixpkgs provides.
- **Secrets are baked in at deploy time** — `supabase secrets set` does not hot-reload running Edge Functions. If secrets are set after a function is deployed, the function must be redeployed (`supabase functions deploy <name>`) before it can read them. Always set secrets before the first deploy, or redeploy immediately after.

### Supabase Edge Function CORS

- **Use a shared `_shared/cors.ts` for CORS headers** — the Supabase JS client sends `authorization`, `x-client-info`, `apikey`, and `content-type` on every request. The canonical pattern (per Supabase docs) is a shared file at `supabase/functions/_shared/cors.ts` exporting `corsHeaders` with those four headers, imported by every browser-facing function. Do not use `*` and do not list headers inline per-function.

### React patterns

- **Async functions with side effects** — Placing `return () => {...}` inside an `async` function makes the cleanup function a dead code path. Move side effects (realtime subscriptions, event listeners) into `useEffect` with proper cleanup returns.

### Generic UI errors

 Never show only a generic error message to the user without also logging the actual error. Always `console.error(actualError)` before displaying a vague UI message.
**Why:** User called this out directly: "I HATE the 'something went wrong' error message. At least print the error in the console."
**How to apply:** Any catch block or error handler that shows a generic string to the user must also log the raw error object to the console.

### Supabase Edge Function JWT

- **New browser-facing Edge Functions need `verify_jwt = false`** — Every new browser-facing Edge Function must have a `[functions.<name>]` block with `verify_jwt = false` in `supabase/config.toml`. Supabase's platform-level JWT verification doesn't support ES256. All functions in this project authenticate in code via `AuthMiddleware` (`_shared/jwt.ts`). Without this flag, the platform rejects requests before function code runs with `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM: Unsupported JWT algorithm ES256`. Add the entry to `config.toml` alongside the function code, before deploying.

