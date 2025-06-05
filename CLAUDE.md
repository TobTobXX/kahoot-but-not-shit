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

- React application built with Vite, using React Router for navigation
- Tailwind CSS for styling
- Components organized in `src/components/`:
  - `Auth.jsx`: Handles user authentication using Supabase Auth UI
  - `AnswerEditor.jsx`: Component for creating and editing quiz answer options with correct answer selection

- Pages in `src/pages/`:
  - `Home.jsx`: Landing page with authentication form
  - `Dashboard.jsx`: Main dashboard for quiz management (create, edit, delete quizzes and questions)

- App Structure:
  - `App.jsx`: Main component with auth state management and protected routes
  - `main.jsx`: Entry point that renders the App component
  - `lib/supabase.js`: Supabase client configuration for database and auth

- State Management:
  - Local component state with React hooks
  - Auth state maintained through Supabase Auth API
  - Form handling with controlled components

### Backend

- Supabase PostgreSQL database with the following main tables:
  - `quizzes`: Stores quiz metadata (title, owner, visibility)
  - `questions`: Stores questions and their answer options
  - `sessions`: Stores quiz session data including state and participant join codes

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

CREATE TYPE session_state AS ENUM ('waiting', 'question', 'answer_reveal', 'scoreboard', 'completed');

CREATE TABLE sessions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	code TEXT NOT NULL UNIQUE, -- Join code for participants
	quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
	host_id UUID NOT NULL REFERENCES auth.users(id), -- Quiz host/owner
	current_state session_state NOT NULL DEFAULT 'waiting',
	current_question_index INTEGER NOT NULL DEFAULT 0, -- Tracks progression through questions
	state_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- When the current state was entered
	created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
	ended_at TIMESTAMP WITH TIME ZONE -- NULL until session completed
);
```

## Session State System

The quiz session follows a state machine pattern with the following states:

### Session States
- `waiting`: Initial lobby state where participants can join before quiz starts
- `question`: Current question is active, participants can submit answers
- `answer_reveal`: Shows correct answer and distribution of participant responses
- `scoreboard`: Displays current rankings between questions
- `completed`: Quiz has ended, final results shown

### State Transitions
- waiting → question (host starts quiz)
- question → answer_reveal (when time expires or host manually advances)
- answer_reveal → scoreboard (host advances)
- scoreboard → question (if more questions remain) or completed (if quiz is done)

### Design Considerations
- Participants can join late at any stage
- Current question index is tracked to manage progression
- Timestamps record when questions are shown and answers submitted for scoring
- Host controls advancement between states
- Real-time synchronization ensures all participants see the same state

## Coding Behaviour for assistants and contributors

### Common commands

Use these commands often during work to improve quality:

```bash
# Build the frontend code (and also check it)
yarn run build

# Create a new db migration
supabase migration new <migration-name>
```

### Workflow

IMPORTANT:
CHANGES SHOULD ALWAYS BE COMMITTED TO GIT. Only omit this step if you are really
sure about that. Otherwise, the git commit has to be done by the user and he
would be annoyed. ALWAYS TRY TO COMMIT}

When database changes were made, run `supabase db push` yourself. The user will
automatically be prompted to confirm/deny.
