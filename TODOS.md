# TODOs — v0.3: Styled player UI

---

## Technical debt

Carried forward — do not work these until the version they are scheduled for:

- [ ] **v0.4** — Host loses session state on page refresh; all session data (session ID, state, question index) lives in component state only. Recovery requires adding URL-based session lookup when real-time is wired up.
- [ ] **v0.5** — Player can re-answer a question by refreshing the page, and currently sees correct/wrong feedback immediately (client-side). Instead: submitted answers should be stored in the DB on selection, and feedback should only be revealed to all players simultaneously when the host closes the question (advances or ends the game). This prevents one player from seeing the correct answer early and sharing it with the group.
- [ ] **v0.6** — `is_correct` is fetched for all answers and visible in the browser network tab before the player answers, making it trivial to cheat. Addressed when score calculation moves server-side (client no longer needs `is_correct` upfront).
- [ ] **v0.8** — Replace open `allow all` RLS policies with proper user-scoped policies (currently every anonymous client can read and write everything).
- [ ] **v0.8** — `player_id` in `localStorage` is unauthenticated; any client can forge a player identity.
- [ ] **future** — Join code collision is unhandled; if a duplicate code is generated the insert fails with a constraint error instead of retrying with a new code.
- [ ] **future** — Stale `waiting` sessions accumulate in the DB with no expiry or cleanup mechanism.

---

## 1. Visual foundation

Small housekeeping and global setup before styling individual screens.

> **Files:** `src/App.css` (delete), `src/index.css` (edit). **Watch out:** This project uses Tailwind v4 (`@tailwindcss/vite` plugin, `@import "tailwindcss"` in `index.css`). Body-level defaults can be added as plain CSS after the import directive, or inside an `@layer base` block — both work in v4. `App.css` is never imported anywhere in the project (only `index.css` is imported in `main.jsx`), so deleting it is safe. **User action:** none.

- [x] Delete `src/App.css` — it is unused Vite scaffold (never imported by any file in the project).
- [x] In `src/index.css`, set a default background colour and text colour on `body` so there is no flash of unstyled white between screen transitions.

## 2. Home page — join form

The join form is the entry point for all players. It must be immediately readable, work well on a small phone screen, and make the next action obvious.

> **Files:** `src/pages/Home.jsx` only. **Watch out:** The form has async Supabase logic in `handleSubmit` — do not touch the JS, only the JSX markup and `className` attributes. The current `style={{ color: 'red' }}` inline style on the error `<p>` should be replaced with a Tailwind class. **User action:** none.

- [x] Wrap the page content in a full-height centred column (`min-h-screen flex flex-col items-center justify-center`) on the same dark background as the rest of the app.
- [x] Add a prominent app title above the form as an `<h1>` — large, bold, centred.
- [x] Wrap the form in a contrasting card with rounded corners, padding, and a subtle box shadow.
- [x] Style each `<label>` as a small, muted block label sitting above its input.
- [x] Style each `<input>`: full-width, bordered, rounded, padded, with a visible focus ring.
- [x] Style the "Join" submit button: full-width, bold, prominent solid colour, large vertical padding, rounded.
- [x] Style the error paragraph: red text, positioned between the last field and the submit button.

## 3. Play page — consistent outer shell

Every post-load Play screen (waiting, active, game-over) should share the same outer container and nickname bar. Restructure `Play.jsx` to render the shell once and switch inner content based on state, rather than repeating the wrapper in every early-return branch.

> **Files:** `src/pages/Play.jsx` only. **Watch out:** The current structure has four early returns once state is resolved. Refactoring to a single return means moving the `if (sessionState === ...)` branches inside a common wrapper — but the loading (`!nickname`) and error early returns must remain above the shell, because `nickname` is not yet available at that point. Do not touch any JS logic or state management; this is purely a structural JSX change. **User action:** none.

- [x] Introduce a single outer container that fills the full viewport: full-height, dark background, with a narrow top bar showing "Playing as **{nickname}**" in small muted text.
- [x] Keep the loading and error early-returns above the shell (they fire before `nickname` is known and must have their own minimal layout).
- [x] All remaining states (waiting, active, active-past-end, finished) render their content inside the shared shell.

## 4. Play page — waiting screen

Players sit here until the host starts. It should feel calm, not frozen.

> **Files:** `src/pages/Play.jsx`. **Watch out:** `animate-pulse` applies a CSS opacity animation — attach it to a small dedicated indicator element (e.g. a `w-2 h-2 rounded-full bg-white`), not directly to the status text (that would make the text flicker in a distracting way). **User action:** none.

- [x] Centred below the nickname bar: a large status line — "Waiting for the host to start…"
- [x] Add a simple CSS pulse animation (Tailwind's `animate-pulse` on a small indicator element) to signal the page is live and not stuck.

## 5. Play page — question and answer layout

The core gameplay screen. Questions must be readable at arm's length; answer buttons must be thumb-friendly.

> **Files:** `src/pages/Play.jsx`. **Watch out:** `question.answers` is already sorted by `order_index` before being stored in state (the `sorted` mapping inside `load()`), so `answer.order_index` can be used directly as the colour-array index. The grid column count should key off `question.answers.length === 2` (not question type — there is no type field in the current schema). **User action:** none.

- [x] Display the question text prominently: large font, centred, with generous vertical padding.
- [x] Lay out the answer buttons using CSS Grid: `grid-cols-2 gap-3` for four answers; `grid-cols-1` when there are exactly two answers (true/false), so long answer text does not overflow a narrow button.
- [x] Give each button substantial height (`min-h-20` or similar) and large centred text — the full area must be an easy tap target on mobile.
- [x] Assign a distinct pre-selection background colour to each button by its `order_index`: 0 → `bg-rose-500`, 1 → `bg-blue-500`, 2 → `bg-amber-400`, 3 → `bg-emerald-500`. Use `text-white` on all four.

## 6. Play page — answer feedback

Replace the current inline `style` object (`answerStyle()`) with Tailwind utility classes so feedback is consistent with the rest of the design.

> **Files:** `src/pages/Play.jsx`. **Watch out:** Keep the `disabled={selectedAnswerId !== null}` prop — it prevents re-answering and must not be removed. The new `className` logic needs to cover all three visual states (unselected, selected-correct, selected-wrong, and dimmed-other) without any `style` prop remaining. Tailwind's `disabled:` variant is available but is not needed here since visual dimming and disabling are handled separately. **User action:** none.

- [x] Remove the `answerStyle()` function and its `style={answerStyle(answer)}` prop entirely.
- [x] Compute a `className` string for each button from `selectedAnswerId`:
  - Nothing selected yet → colour-by-index (section 5).
  - This button selected and `is_correct === true` → `bg-emerald-600 text-white` with a visible emphasis ring.
  - This button selected and `is_correct === false` → `bg-red-600 text-white` with the same emphasis ring.
  - Another button was selected → base colour with `opacity-40 cursor-not-allowed`.
- [x] Ensure the post-selection correct colour (`bg-emerald-600`) is visually distinct from the unselected index-3 colour (`bg-emerald-500`).

## 7. Play page — game-over and waiting-to-end screens

Two short holding states. Both should look like part of the same app.

> **Files:** `src/pages/Play.jsx`. **Watch out:** After section 3's restructuring, `nickname` is available in both branches (they render inside the shared shell). The `animate-pulse` indicator is the same as section 4 — a small local constant in the JSX is fine if the repetition is annoying, but do not extract a shared component for it. **User action:** none.

- [x] Game-over: large centred "Game over" heading; a smaller subtitle such as "Thanks for playing, **{nickname}**!".
- [x] Waiting-to-end (session is `active` but `currentQuestionIndex` is past the last question): centred message "Waiting for the game to end…" with the same `animate-pulse` indicator used on the waiting screen.

## 8. Play page — loading and error states

These appear before `nickname` is known, so they cannot use the full shell. Keep them minimal but not naked.

> **Files:** `src/pages/Play.jsx`. **Watch out:** These early returns fire before `nickname` is resolved, so they need their own `min-h-screen` wrapper with the same dark background — otherwise the page flashes white before state loads. A standard CSS spinner: `w-8 h-8 rounded-full border-4 border-white border-t-transparent animate-spin`. **User action:** none.

- [x] Loading: a centred spinner (`animate-spin` on a border-based div) on the same dark background as the rest of the app.
- [x] Error: centred red heading on the dark background with the error message below it.

## 9. Smoke test

Open the app at 390 px viewport width (browser dev tools or a real phone) and walk through every player-facing screen.

> **Files:** none to edit — run `nix run nixpkgs#nodejs -- npm run dev` and test in the browser. **Watch out:** Tailwind v4 with `@tailwindcss/vite` does JIT class scanning on every hot reload — no separate build step needed. If a utility class appears to have no effect, check for a typo; Tailwind v4 utility names are unchanged from v3. **User action:** none — purely manual visual verification.

- [ ] Home page: form is centred and readable; inputs, button, and error state look polished.
- [ ] Waiting screen: nickname bar visible; status line is large and centred; pulse indicator is present.
- [ ] Question screen at 390 px: question text readable; 2 × 2 grid of coloured answer buttons fills the screen without overflow; each button is large enough to tap comfortably.
- [ ] After clicking an answer: selected button turns green or red with visible emphasis; other buttons dim.
- [ ] Game-over and waiting-to-end screens are visually consistent with the rest of the player screens.
