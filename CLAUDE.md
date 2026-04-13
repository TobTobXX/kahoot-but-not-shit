# Claude Instructions

## Project overview

This is a self-hostable real-time quiz platform — a better Kahoot. Read the planning documents before doing any work:

- **[GOAL.md](GOAL.md)** — what we're building and for whom (player, host, quiz creator)
- **[TECHNOLOGIES.md](TECHNOLOGIES.md)** — stack decisions and why (React, Supabase, no server)
- **[STEPS.md](STEPS.md)** — nine incremental versions (v0.1–v0.9), each with a checklist
- **[TODOS.md](TODOS.md)** — detailed task list for the current version being worked on

Always read these files at the start of a session to orient yourself before touching any code.

## Workflow

At the start of each session, and before working any new section, follow these steps in order:

1. **Read context** — read GOAL.md, TECHNOLOGIES.md, STEPS.md, and TODOS.md to orient yourself.
2. **Analyse the next section** — identify what the next unchecked section in TODOS.md requires.
3. **Read relevant code** — read whichever existing files are relevant to the upcoming work.
4. **Anticipate challenges** — identify anything that could go wrong, ambiguities in the spec, discrepancies between existing code and the plan, or external dependencies that need user action.
5. **Write a Briefing** — summarise the section goal, the findings from step 4, and explicitly flag every point where the user is required to act (e.g. Supabase dashboard steps, credentials, manual verification).
6. **Write a plan of action** — concrete, ordered steps you will take. Present it to the user and wait for confirmation before touching any code.
7. **Execute** — after confirmation, work through the entire section top to bottom. Check off each task in TODOS.md immediately when done. Commit after every logical unit of work.

## Current focus

Work through TODOS.md top to bottom. When a task is done, check it off in TODOS.md immediately. When all tasks in a section are done, check off the corresponding item in the STEPS.md checklist for the current version.

## Running tools

Most tools are not installed globally. Run them via Nix:

```
nix run nixpkgs#nodejs        -- ...   # node, npm, npx
nix run nixpkgs#supabase-cli  -- ...   # supabase CLI (note: supabase-cli, not supabase)
```

When a command would normally be `npm install`, use `nix run nixpkgs#nodejs -- npm install` (or wrap it in `nix shell nixpkgs#nodejs` for a multi-step workflow). Apply the same pattern for any other tool that may not be on PATH.

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

## Environment

- Supabase credentials are in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never hardcode these.
- `.env` is gitignored — do not commit it.
- There is no dynamic server. The frontend talks directly to Supabase via the JS client.

## Key constraints

- No RLS policies until v0.8 — but do enable RLS on each table in the migration so adding policies later requires no schema change.
- No real-time until v0.4.
- No auth until v0.8.
- Do not add features beyond what the current version's TODOS.md specifies.
