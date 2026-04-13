# TODOS — v0.10 Navigation overhaul ✓

Coherent navigation across all pages. The home page is the reference point — all other pages get a consistent top bar and explicit exit paths. No page should leave the user stranded.

Naming convention used throughout:
- **HostLibrary** — the quiz picker at `/host` (like a library: browse and pick a game)
- **HostLobby** — the waiting room at `/host/:sessionId` while players gather before the game starts

---

## 1. Rename components to match semantics

> **Relevant:** `src/components/HostLobby.jsx` → rename to `HostLibrary.jsx`, `src/components/HostWaiting.jsx` → rename to `HostLobby.jsx`. Update all import sites: `src/pages/Host.jsx`, `src/components/HostSession.jsx`.
> **Watch out:** The rename is mechanical — no logic changes in this section. Do it first so subsequent sections use the correct filenames.

- [ ] Rename `src/components/HostLobby.jsx` → `src/components/HostLibrary.jsx`. Update the component function name inside the file from `HostLobby` to `HostLibrary`.
- [ ] Rename `src/components/HostWaiting.jsx` → `src/components/HostLobby.jsx`. Update the component function name inside the file from `HostWaiting` to `HostLobby`.
- [ ] In `src/pages/Host.jsx`, update imports: `HostLibrary` from `../components/HostLibrary`, `HostSession` unchanged. Update JSX: render `<HostLibrary />` (was `<HostLobby />`).
- [ ] In `src/components/HostSession.jsx`, update import: `HostLobby` from `./HostLobby` (was `HostWaiting`). Update JSX: `<HostLobby ...>` (was `<HostWaiting ...>`).

---

## 2. Merge /library into HostLibrary

The old Library page is redundant — HostLibrary already lists own quizzes. Absorb the missing features (delete, creation date) and retire `/library`.

> **Relevant:** `src/components/HostLibrary.jsx` (add delete + date), `src/pages/Library.jsx` (delete file), `src/App.jsx` (redirect /library → /host, remove Library import), `src/pages/Login.jsx` (post-login redirect is currently `/library`).
> **Watch out:** HostLibrary currently calls `supabase.auth.signOut()` directly — replace with `signOut` from AuthContext for consistency. The `confirm()` dialog for delete is acceptable; reuse the same pattern as Library.

- [ ] In HostLibrary, add `signOut` from `useAuth()`.
- [ ] In HostLibrary, add a `deleting` state and `handleDelete(quizId)` function (`confirm()` → supabase delete → filter from state).
- [ ] In HostLibrary, add a Delete button next to each own quiz row. Also show creation date (add `created_at` to the select query).
- [ ] In Login.jsx, change the post-login redirect (both password sign-in and magic link `emailRedirectTo`) from `/library` to `/host`.
- [ ] In App.jsx, replace the `/library` protected route with `<Route path="/library" element={<Navigate to="/host" replace />} />` and add `Navigate` to the react-router-dom import. Remove the `Library` import.
- [ ] Delete `src/pages/Library.jsx`.

---

## 3. HostLibrary: consistent top bar

Replace the current ad-hoc header with the same top-bar pattern as Home: left = back, right = auth.

> **Relevant:** `src/components/HostLibrary.jsx`.
> **Watch out:** The current header is inline inside the `max-w-md` content column. Pull the top bar out to full-width, then keep the content column below it.

- [ ] Add a full-width top bar at the top of the page (outside the `max-w-md` column):
  - Left: `← Home` button → `navigate('/')`.
  - Right: if `!loading && user`: email (small, slate-400) + Logout button calling `signOut()`; if `!loading && !user`: Sign in button → `navigate('/login')`.
- [ ] Remove the old inline header (`flex items-center justify-between` row with "Host" title and auth links).

---

## 4. HostSession: navigation at each game state

> **Relevant:** `src/components/HostSession.jsx`.
> **Watch out:** `quizId` is already in state — use it directly for "Host again". The `createSession` logic currently lives in HostLibrary; duplicate it inline in HostSession (it's small). After "Host again" creates the session, navigate to `/host/${newId}`. HostSession does not currently import `useNavigate`.

- [ ] Import `useNavigate` in HostSession.jsx.
- [ ] In the lobby (waiting) state: add a top bar with `← Back to library` button → `navigate('/host')`. Keep it outside the card so it doesn't crowd the join code.
- [ ] Replace the finished state (`<p className="text-2xl font-bold">Game over.</p>`) with a proper end screen:
  - "Game over" heading.
  - "Back to library" button → `navigate('/host')`.
  - "Host again" button → generates a new join code → inserts a new session with the same `quizId` → navigates to `/host/${newSessionId}`.
- [ ] Add a `hostAgain` async function (mirror of HostLibrary's `createSession`) that generates a code, inserts the session, and navigates.

---

## 5. Play: end-of-game navigation

> **Relevant:** `src/pages/Play.jsx` — the `sessionState === 'finished'` block.

- [ ] In the finished state block, add a "Back to home" button below the "Thanks for playing" text → `navigate('/')`.

---

## 6. Create/Edit: back button

> **Relevant:** `src/pages/Create.jsx`.
> **Watch out:** Create.jsx has a loading/error guard that returns early. The back button only needs to be in the main render path; optionally also in the `authError` early-return so users aren't stuck.

- [ ] Add a full-width top bar at the top of the main render with a `← Back` button → `navigate('/host')`.
- [ ] Add the same `← Back` button to the `authError` early-return block.

---

## 7. Login: back link

> **Relevant:** `src/pages/Login.jsx` — already imports `useNavigate`.

- [ ] Add a `← Back to home` text button above or below the login card → `navigate('/')`.

---

## 8. Lint + build verification

> **Run after all sections above are complete.**

- [ ] `nix shell nixpkgs#nodejs -c npm run lint` — fix any new lint errors.
- [ ] `nix shell nixpkgs#nodejs -c npm run build` — verify production build succeeds.
- [ ] Manual smoke test:
  - Navigate to /host without auth → Sign in link present, ← Home works.
  - Navigate to /host with auth → Logout/email in top bar, delete a quiz, create a quiz.
  - Navigate to /library → redirects to /host.
  - Start a session (lobby/waiting state) → ← Back to library present, click it.
  - Start + finish a session → end screen shows Game over + both buttons; Host again creates a new session.
  - Play through a game to the end → Back to home button appears.
  - Navigate to /create → ← Back button present, click it → lands at /host.
  - Navigate to /login → Back to home link present.
