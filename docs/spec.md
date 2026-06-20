# GrillTime — Back-Timed Meal Planner (v1 spec)

> Self-contained meal-timing PWA. You set when the meal must be **ready**; the app counts
> backward and tells you when to start each element so everything finishes — rest included —
> at serve time. Phone-first, offline, no server, no account.

## Problem / Goal

Cooking several dishes so they all land hot at the same moment is mental arithmetic done
under pressure — the universal advice from pro kitchens is "work backwards from serve
time" (Serious Eats, catering pros, r/AskCulinary), but home cooks do it on paper or in a
spreadsheet. The one polished app that does this (iOS "Cooking Time Planner") is paid,
single-platform, and aligns to *cook-finish*, leaving rested meat to sit and cool. The big
open-source recipe managers (Mealie #3545, Grocy #1689) have **open, unbuilt** requests for
exactly this. **Done** = a phone web app where you set a serve time, add dishes with
prep/cook/rest minutes, and get a correct "start X at HH:MM" schedule in which each dish's
**rest ends exactly at the effective deadline** (serve time, minus an optional buffer).

> **Architecture note (spec review, product+dev lens, 2026-06-20):** "open the file with no
> server" and "installable PWA / service worker" are **mutually exclusive** — ES module
> scripts are blocked over `file://` (CORS, origin `null`; whatwg/html #8121) and service
> workers require a secure context (MDN), which `file://` is not. The user's #1 stated
> priority is "open the file, any phone." **Resolution: keep the file-openable promise.**
> The browser loads a single classic `<script>` (no `import`/`export`); `timing.js` keeps an
> ESM `export` guarded for Node tests only. **"Installable PWA + service worker" is dropped
> from v1** — the app still works offline (it's a local file needing no network), but it is
> not a SW-backed installable PWA. Recorded in HANDOFF.

## Scope

- **In scope:**
  - Set a target **serve time** (today; native time picker).
  - Add dishes via quick-add: name + prep (opt) + cook (req) + rest (opt) in minutes.
  - Back-timing engine: per dish, compute prep-start → cook-start → rest-start; rest ends at serve time (minus global buffer).
  - **Schedule view**: every dish's actions in chronological order, "start … at HH:MM".
  - Global **buffer** ("finish N minutes early", default 0).
  - **Saved dishes** in `localStorage`, reusable across sessions; edit/remove.
  - **Late-dish flag**: a dish whose total time exceeds time-until-serve is flagged "start now / late".
  - **Empty state** when no dishes.
  - Dark theme, safe-area aware, ≥44px touch targets. Works offline as a local file (no network needed).
- **v1 is a PLANNER, not a stand-at-the-stove assistant** (spec review Q4): it produces the
  static start-time schedule. Live in-kitchen guidance (countdowns, "start now" alerts) is v2.
- **Out of scope (v1):** installable PWA / service worker (incompatible with file:// — see Architecture note); grill/burner contention warnings (v2); live countdowns + "start now" push alerts (v2); cloud sync / accounts; full recipe entry (ingredients/steps); multi-day or non-today serve dates; **overnight/long-cook planning (brisket-style starts that cross midnight) is v2** (Q5); deploy to a public host.

## Approach

Pure vanilla HTML/CSS/JS, no framework, no build step, no server — `web/index.html` opens
directly and works offline on any phone (the user's explicit "open the file, any phone"
choice; deviates from the Python-server template by design — noted in HANDOFF).

Module split (clarity, not architecture astronomy):
- `web/timing.js` — pure functions, **zero DOM**. The engine. Loaded in the browser as a
  **classic `<script>`** (attaches `window.GrillTiming`); also carries a guarded
  `export`/`module.exports` so Node can import it for tests. **No browser `import`/`export`**
  (those break over `file://`). Dual-consumer pattern: `if (typeof module !== 'undefined') module.exports = {...}`.
- `web/storage.js` — `localStorage` load/save of saved dishes + settings. Classic script.
- `web/app.js` — wires DOM ↔ engine ↔ storage; rendering. Classic script.
- `web/style.css` — canonical `:root` dark palette (verbatim from `~/Claude Generic/reference/PWA.md`).
- `web/index.html`, `web/manifest.json`, `web/icons/` — shell (manifest for theming/home-screen
  metadata only; **no `sw.js`** — see Architecture note).
- `test/timing.test.cjs` — Node-run unit tests (`node --test`) requiring `timing.js` via the
  guarded `module.exports`. CommonJS so the dual-pattern is trivial and no `file://` issue exists (Node only).

**Timing model.** Serve time `S`. Effective deadline `D = S − buffer`. For a dish with
durations `prep, cook, rest` (minutes): `restStart = D − rest`, `cookStart = restStart − cook`,
`prepStart = cookStart − prep`, `firstAction = prepStart`. Rest therefore *ends* at `D`
(= serve time when buffer is 0; `buffer` minutes before serve otherwise). A dish is **late**
if `firstAction < now`. `mealStart` = earliest `firstAction` across dishes.

**Past serve time (M2/H2/Q1).** If `S ≤ now`, the engine returns a distinct
`serveInPast: true` flag. The UI shows a single "Serve time has already passed — pick a
later time" state (NOT a wall of red late-rows). Recovery copy offers only **"lower a cook
time"** or **"remove a dish"** — it does **not** advertise "push serve later" across midnight
(today-only; Q1). All times are today; an action time computed before midnight today is
simply in the past and contributes to `serveInPast`/late, never silently a different day.

**`lateByMin` formatting (M1).** Engine returns raw `int` minutes. Renderer formats:
`< 60` → `"Nm"`; `60–1439` → `"Hh Mm"` (e.g. "3h 55m"); `≥ 1440` → `"Dd Hh"`. `lateByMin`
is `0` for on-time dishes (never negative; time-to-spare is not shown in v1). The exact
boundary `firstAction == now` is **not** late (strict `<`).

*Alternative rejected:* aligning cook-finish to serve time (the iOS app's model) — rejected
because it makes rested meat sit and cool, contradicting the chef sources and the user's
explicit "everything READY at serve time" choice.

## UX / Interaction — MANDATORY

### Happy-path trace

- User opens GrillTime → system shows serve-time picker (default: now + 1h), buffer field
  (0), empty dish area with "Add your first dish" → user taps **Add dish**, types
  "Ribeye", prep 5, cook 12, rest 8, taps **Save** → system stores the dish, recomputes,
  and renders it in the plan → user sees the **schedule**: "Ribeye — prep 5:43, cook 5:48,
  **rest done / serve 6:00**" with a one-line "Start cooking at 5:43" headline → user **adds a
  second dish** "Asparagus" (cook 6, rest 0) → schedule **merges both in chronological order**
  ("5:43 Ribeye prep … 5:54 Asparagus … 6:00 serve") → user can add more, edit serve time
  (recomputes live), adjust buffer, edit/remove any row, or delete a dish (headline recomputes).

### Error / no-op / dead-end trace

- User sets serve time to **5 minutes from now** and adds "Brisket" (cook 240) → dish's
  `firstAction` is in the past (but serve itself is still future) → system renders the Brisket
  row **red** with badge **"Start now — running late by 3h 55m"** and the meal headline shows
  **"⚠ 1 dish behind"** while any on-time dishes stay normal → user sees *which* dish and *by
  how much* → user can **recover**: tap the dish to lower its cook time, or remove it (the app
  does NOT tell them to "push serve later" — today-only can't honor a midnight-crossing push).
- User sets serve time to **earlier than now** → engine returns `serveInPast` → system shows a
  single **"Serve time has already passed — pick a later time"** panel (not a wall of red rows)
  → user can edit the serve-time picker; schedule recomputes. (No silent wrong-day plan.)
- User reopens the app **the next day** → stored `serveDate ≠ today` → system resets serve time
  to default (now+60m) instead of loading yesterday's time → user sees a fresh, valid default.
- No-op state: user opens app with **zero dishes** → system shows empty state "No dishes
  yet — add one to build your schedule" + an **Add dish** button → user can act (add). The
  schedule area never shows a blank, actionless panel.

### Dead-end checklist — MANDATORY

| System shows… | User can act via… | Dead end? |
|---|---|---|
| Serve-time picker | edit it; schedule recomputes live | no |
| Buffer field | edit it; schedule recomputes | no |
| Empty state ("no dishes") | **Add dish** button | no |
| A dish row in the plan | tap → edit / remove | no |
| The computed schedule (start times) | re-edit any input; it recomputes | no |
| Late-dish red flag + reason (formatted h/m) | tap dish to lower cook or remove it | no |
| "Serve time has already passed" state | edit serve-time picker to a later time | no |
| "Start cooking at HH:MM" headline | informational; derived from editable inputs | no (reflects actionable inputs) |
| Mixed board: meal headline "⚠ N behind" + on-time rows normal | per-row flags identify which dish; act on the late one | no |
| Saved-dish list (reuse) | tap to add to plan; **always-visible ≥44px delete button** (long-press is at most an enhancement) | no |
| Inline field validation error (e.g. "cook must be 1–1440") | correct the field; save unblocks | no |

No unjustified dead ends.

## Data / Contracts

`localStorage` key `grilltime.v1`:
```
{
  "savedDishes": [ { "id": str, "name": str, "prep": int, "cook": int, "rest": int } ],
  "plan":        [ { "id": str, "name": str, "prep": int, "cook": int, "rest": int } ],
  "settings":    { "serveTime": "HH:MM", "serveDate": "YYYY-MM-DD", "bufferMin": int }
}
```
- **Plan items are always inline copies (Q2+Q3), never `{dishId}` references.** Adding a saved
  dish snapshots its fields into the plan. Editing a saved dish later does **not** change an
  active plan item (copy semantics — predictable, no spooky-action-at-a-distance). This kills
  the dual-shape union the original draft had.
- `id` — set on create (`Date.now()`+counter), never null; identifies a row for edit/remove.
- `serveTime` "HH:MM" + `serveDate` "YYYY-MM-DD" — **on load, if `serveDate ≠ today`, reset to
  default now+60m (and rewrite serveDate)** so a stale yesterday time never loads as today (H1).
  `null`/absent → default now+60m.
- **Validation (blocks save; security/robustness — closes the 8 input holes):** `name`
  required, trimmed, 1–40 chars; `cook` integer `1–1440`; `prep`/`rest` integer `0–1440`.
  Non-numeric/NaN → field shows inline error, save blocked. Decimals rounded to nearest int.
  Negatives rejected. No field may be empty except prep/rest (which coerce empty → 0).

Engine contract (`timing.js`, pure):
```
computeSchedule({ serveTime: Date, bufferMin: int, dishes: Dish[] , now: Date })
  → { deadline: Date,             // serveTime − bufferMin
      mealStart: Date|null,       // earliest firstAction (null if no dishes)
      serveInPast: bool,          // serveTime ≤ now
      lateCount: int,             // number of dishes with firstAction < now
      rows: [ { id, name, prepStart|null, cookStart, restStart, firstAction: Date,
                serveAt: Date, late: bool, lateByMin: int } ]  // sorted by firstAction asc
      }
```
`now` is injected (not read from clock inside the engine) so tests are deterministic. `serveAt`
reports the **effective deadline `D`** (when rest ends), not raw serve `S`, so a buffered plan
shows the true plating moment. Rows are returned pre-sorted by `firstAction` (chronological).

## Build order

1. `timing.js` pure engine + `test/timing.test.cjs` (tests written FIRST, must fail then pass).
   Cover: rest ends at D; buffer shifts D; `serveInPast`; late detection + `lateByMin`; multi-dish
   `mealStart` = earliest + chronological sort; empty-dishes (`mealStart: null`).
2. `storage.js` load/save + defaults + `serveDate≠today` reset + validation helpers.
3. `index.html` + `style.css` (canonical palette) — static shell, dark, safe-area, 44px targets,
   all JS as **classic `<script>`** (no modules).
4. `app.js` — add/edit/remove/delete dish (inline copies), serve-time + buffer inputs, inline
   field validation, **live recompute on every change incl. delete + `now` re-tick on
   visibilitychange/30s interval**, render schedule / empty / serve-in-past / mixed-late states.
5. `manifest.json` + **PNG** icons (home-screen metadata + theming; no `sw.js`).
6. Headless-browser verification of the flows below; fix; re-run until green.
7. Commit + tag `v0.1.0`; write `HANDOFF.md`.

## Definition of done

- `node --test` exits 0 — all engine tests green, including: rest ends at deadline `D`;
  buffer shifts `D`; `serveInPast` flag; late detection + `lateByMin` formatting boundaries
  (0 / <60 / 60–1439 / ≥1440); multi-dish `mealStart` = earliest + chronological row sort;
  empty-dishes → `mealStart: null`; input-validation helpers reject NaN/negative/out-of-range.
- Headless browser (loaded via `file://` AND `http://localhost` to prove the no-server promise):
  add dish → schedule renders correct HH:MM; add a **second** dish → rows merge chronologically;
  zero-dish empty state shows; over-long dish shows red late flag with formatted reason;
  serve-time-in-past shows the "already passed" panel (not a wall of red).
- `web/index.html` opens by **double-click (`file://`)** and renders the schedule (no blank
  page, no module CORS error in console).
- `git tag` shows `v0.1.0`; `docs/spec.md` + `HANDOFF.md` exist; HANDOFF lists every autonomous
  decision (incl. the file:// architecture resolution and the 7 walk picks) and how to reverse.

## Open / confirm at build time

- Icon assets: generate simple flame/clock **PNG** icons in-repo (no external fetch; PNG is
  required for home-screen metadata — SVG-only is rejected by iOS). 192px + 512px.
- Time picker: native `<input type="time">` (locale handles 12/24h) — confirmed default.
