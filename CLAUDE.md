# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This project is a Kahoot-like quiz application built with:
- React frontend (Vite)
- Supabase backend for:
  - PostgreSQL database
  - Authentication
  - Realtime functionality

The tech stack is chosen to be relatively boring and stable (react, postgresql, ...)

The application allows users to:
- Create accounts via Supabase Auth
- Create and manage quizzes with questions and answers
- Host quiz sessions with real-time participation
- Join quiz sessions using a generated code (without account)

## Architecture

### Frontend

- React application with React Router for navigation
- Components organized in `src/components/`
- Pages in `src/pages/`
- Supabase client configuration in `src/lib/supabase.js`

### Backend

- Supabase PostgreSQL database with the following main tables:
  - `quizzes`: Stores quiz metadata (title, owner, visibility)
  - `questions`: Stores questions and their answer options

- Security implemented through Row Level Security (RLS) policies:
  - Users can only modify their own quizzes and questions
  - Private quizzes are only visible to their owners
  - Public and unlisted quizzes can be viewed by anyone

Schemas:

```sql
CREATE TYPE quiz_visibility AS ENUM ('private', 'unlisted', 'public');

CREATE TABLE quizzes (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	visibility quiz_visibility NOT NULL DEFAULT 'private',
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE questions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
	question_text TEXT NOT NULL,
	answers JSONB NOT NULL,
	max_time INTEGER NOT NULL DEFAULT 30, -- time in seconds
	points INTEGER NOT NULL DEFAULT 1000
);
```

## Behaviour

### Common commands

Use these commands often during work to improve quality:

```bash
# Build the frontend code (and also check it)
yarn run build

# Run a dev server so the user can test functionality.
yarn run dev

# Create a new db migration
supabase migration new <migration-name>
```

### Workflow

Important:
Changes should almost always be commited to git. Only omit this step if you are
really sure.

When database changes were made, run `supabase db push` yourself. The user will
automatically be prompted to confirm/deny.
