# Goal

A fast, clean, self-hostable real-time quiz platform. No accounts required to play, no artificial limits, no noise in the UI.

Primary target: classroom use. The host is typically a teacher; the quiz creator is a teacher (the same or another) or occasionally a student. Leisure use is welcome but not the design priority.

## Roles

Three distinct roles with different authentication requirements.

### Quiz Creator (authenticated)

- Create and edit quizzes with an arbitrary number of questions.
- Each question has 2–4 answer options, with one or more marked correct.
- Supported question types: multiple choice (2–4 options); true/false is just multiple choice locked to 2 options.
- Set per-question time limits and point values.
- Attach images to questions.
- Manage a personal library of quizzes.
- Mark quizzes as public (browsable by all hosts) or private (only they can host).

### Host (may be unauthenticated)

- Browse public quizzes and start a live session — **no account needed**.
- When logged in, additionally manage a personal library (own quizzes + starred quizzes from the public catalogue).
- Share a short join code with participants — no app or account needed on their end.
- Sessions advance linearly — questions play in order, one at a time.
- See a live participant list and per-question response progress during the game.
- Questions close automatically when the timer expires or all players have answered; the host can also close a question early. After closing, a leaderboard is shown and the host manually advances — useful for discussing the answer before moving on.
- Per-question timer is configurable; a question can also have no time limit.
- End the session early.

### Player (always unauthenticated)

- Join a session with just a code and a chosen nickname — **no sign-up, no account**.
- See questions and answer options clearly on any device.
- Get immediate feedback after each answer (correct/incorrect, points earned).
- Track their current rank on a live leaderboard between questions.

## Results

After a session, the host sees:
- Final leaderboard with scores.
- Per-question breakdown: response distribution, average response time, and % correct.
- Ability to export or share the summary.
