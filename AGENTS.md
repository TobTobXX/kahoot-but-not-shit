# Coding Agent Instructions

## Project overview

This is a self-hostable real-time quiz platform — a better Kahoot. Read the planning documents before doing any work:

- **[GOAL.md](GOAL.md)** — what we're building and for whom (player, host, quiz creator)
- **[TECHNOLOGIES.md](TECHNOLOGIES.md)** — stack decisions and why (React, Supabase, no server)
- **[STEPS.md](STEPS.md)** — nine incremental versions (v0.1–v0.9), each with a checklist
- **[TODOS.md](TODOS.md)** — detailed task list for the current version being worked on

Always read these files at the start of a session to orient yourself before touching any code.

## Workflows

There are two distinct workflows. Use the right one depending on whether TODOS.md already exists for the current version.

### Workflow A — Writing TODOS for a new version

Use this when TODOS.md is stale (still shows the previous version) and needs to be recreated for the next version.

1. **Read context** — read GOAL.md, TECHNOLOGIES.md, STEPS.md, and TODOS.md to orient yourself.
2. **Identify the next version** — find the first unchecked version in STEPS.md and read its description and checklist items carefully.
3. **Read relevant code** — read all existing source files that are relevant to the upcoming version's scope.
4. **Draft sections** — break the version's checklist into concrete, ordered implementation sections. Each section should be a logical unit of work (one screen, one feature area, one schema change, etc.).
5. **Write TODOS.md** — replace the file with the new version's task list. Each section must include:
   - A short prose description of the goal.
   - A `> blockquote` briefing stating: which files are relevant, specific things to watch out for (API quirks, constraints from earlier versions, ordering dependencies), and whether user action is required.
   - A checklist of concrete, granular tasks — each task is one actionable step, not a summary.
6. **Carry forward technical debt** — technical debt lives permanently in STEPS.md (see there), not in TODOS.md. Do not copy it into TODOS.md on each new version.

### Workflow B — Implementing a section

Use this at the start of each session when TODOS.md already reflects the current version.

1. **Read context** — read GOAL.md, TECHNOLOGIES.md, STEPS.md, and TODOS.md to orient yourself.
2. **Analyse the next section** — identify what the next unchecked section in TODOS.md requires.
3. **Read relevant code** — read whichever existing files are relevant to the upcoming work.
4. **Anticipate challenges** — identify anything that could go wrong, ambiguities in the spec, discrepancies between existing code and the plan, or external dependencies that need user action.
5. **Write a Briefing** — summarise the section goal, the findings from step 4, and explicitly flag every point where the user is required to act (e.g. Supabase dashboard steps, credentials, manual verification).
6. **Write a plan of action** — concrete, ordered steps you will take. Present it to the user and wait for confirmation before touching any code.
7. **Execute** — after confirmation, work through the entire section top to bottom. Check off each task in TODOS.md immediately when done. Commit after every logical unit of work.
8. **Review for technical debt** — after the session's work is done, reflect on anything deferred, worked around, or left imperfect. Present candidate debt items to the user and ask whether any should be added to the technical debt section of STEPS.md.
9. **Review for lessons learned** — reflect on anything non-obvious that came up during the session (API quirks, tooling gotchas, React patterns, etc.). Present candidate lessons to the user and ask whether any should be added to the "Lessons learned" section of AGENTS.md (not CLAUDE.md — AGENTS.md is the file for this).

## Current focus

Work through TODOS.md top to bottom. When a task is done, check it off in TODOS.md immediately. When all tasks in a section are done, check off the corresponding item in the STEPS.md checklist for the current version.

## Running tools

Most tools are not installed globally. Run them via Nix:

```
nix run nixpkgs#nodejs        -- ...   # node, npm, npx
nix run nixpkgs#supabase-cli  -- ...   # supabase CLI (note: supabase-cli, not supabase)
```

When a command would normally be `npm install`, use `nix run nixpkgs#nodejs -- npm install` (or wrap it in `nix shell nixpkgs#nodejs` for a multi-step workflow). Apply the same pattern for any other tool that may not be on PATH.

### Key gotchas for npm/vite in this project

- `nix run nixpkgs#nodejs -- npm run build` fails with "Cannot find module 'npm'" — use `nix shell nixpkgs#nodejs -c npm run build` instead (the double-dash form breaks when the command itself is a wrapper script).
- `npx vite build` fails because npx isn't on PATH — use `nix shell nixpkgs#nodejs -c npx vite build`.
- `npm run lint` works fine via `nix shell nixpkgs#nodejs -c npm run lint`.

## Supabase CLI

The project is linked to a remote Supabase instance (credentials stored in `supabase/.temp/`). Key commands:

```
# Apply pending migrations to the remote DB (run after writing a new migration file)
nix run nixpkgs#supabase-cli -- db push

# Pull the current remote schema as a migration (useful after dashboard changes)
nix run nixpkgs#supabase-cli -- db pull

# Diff local migrations vs remote DB schema
nix run nixpkgs#supabase-cli -- db diff
```

Migration files live in `supabase/migrations/` and are named `<YYYYMMDDHHmmss>_<description>.sql`. Seed data is also a migration (`..._seed.sql`) since the CLI has no separate `db seed` command for remote projects.

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
git commit -m "short description"

# For changes to already-tracked files only (no new files), shorthand:
git commit -am "short description"
```

### Git tags

Tag each version. The moment you should tag is when you check off all the boxes in STEPS.md.

## Environment

- Supabase credentials are in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never hardcode these.
- `.env` is gitignored — do not commit it.
- There is no dynamic server. The frontend talks directly to Supabase via the JS client.

## Key constraints

- No RLS policies until v0.8 — but do enable RLS on each table in the migration so adding policies later requires no schema change.
- No real-time until v0.4.
- No auth until v0.8.
- Do not add features beyond what the current version's TODOS.md specifies.

## Lessons learned

### `git tag` opens interactive editor

`git tag <name>` without `-m` opens the default editor. Always use `git tag <name> -m "message"` to avoid this.

### Supabase realtime

- **Scope of a realtime channel filter** — Supabase realtime uses Postgres-level filters (`id=eq.xxx`). The `filter` option in `postgres_changes` must use Postgres syntax (`id=eq.${id}`), not the Supabase JS client syntax.
- **Async callbacks** — Do not use `async` on the realtime `on('UPDATE')` callback. It can cause state update ordering issues (stale closures, race conditions). Instead, fire off non-blocking DB calls with `.then()` inside the synchronous callback.
- **Filter column naming** — The realtime filter key uses Postgres column names with underscores, not camelCase JS keys. Use `join_code=eq.${code}`, not `joinCode=eq.${code}`.
- **Enabling realtime** — `supabase db push` only handles SQL migrations. Enabling realtime on a table requires either the Supabase dashboard or a raw SQL migration (`ALTER PUBLICATION supabase_realtime ADD TABLE <name>`). The CLI has no `realtime enable` command.

### React patterns

- **Async functions with side effects** — Placing `return () => {...}` inside an `async` function makes the cleanup function a dead code path. Move side effects (realtime subscriptions, event listeners) into `useEffect` with proper cleanup returns.
