# GrillTime — Build Handoff (v0.1.0)

Built **fully autonomously** on 2026-06-20 from your "build it without my intervention" brief.
This file lists every decision I made on your behalf and how to reverse each one.

## What it is
A self-contained, phone-first **back-timed meal planner**. Set a serve time, add dishes
with prep/cook/rest minutes, and it tells you when to start each one so everything is
ready (rest finished) at serve time. No server, no account, no internet.

## How to run it
- **Just open the file:** double-click `web/index.html` (or open it in any phone browser).
  No server needed. That was your #1 requirement and it works.
- **Tests:**
  - Engine: `node --test` (16 unit tests) — from the project root.
  - E2E: `python3 test/e2e.py` (15 Playwright checks over `file://`).

## The big autonomous decision (spec review caught a blocker)
Your original brief said "open the file, any phone" **and** "installable PWA + service worker."
The multi-pass spec review proved these are **mutually exclusive**:
- ES module `<script>`s are blocked over `file://` (CORS, origin `null` — whatwg/html #8121).
- Service workers need a secure context; `file://` is not one (MDN).

**I kept "open the file" (your stated priority) and dropped the installable-PWA/service-worker
claim.** Concretely:
- Browser JS is plain classic `<script>` (no `import`/`export`); `timing.js` carries a guarded
  `module.exports` so Node tests can still import it.
- No `sw.js`. The app still works offline (it's a local file), but it's not a SW-backed
  installable PWA.
- **To reverse** (make it an installable PWA): you must serve it (e.g. `python3 -m http.server`
  in `web/`, or deploy to Netlify/GitHub Pages). Then add a `web/sw.js` (cache-first shell) and
  register it in `app.js`. At that point "double-click the file" no longer works — pick one.

## The 7 forks I hit and resolved (simpler option each, per your instruction)
| # | Fork | What I chose | Reverse by… |
|---|------|--------------|-------------|
| Q1 | Late-recovery advice "push serve later" but serve is today-only | Dropped that advice; offer only "lower cook / remove" | Add a date concept + re-add the copy |
| Q2+Q3 | Plan items as `{dishId}` refs vs inline copies | **Inline copies** — editing a saved dish doesn't change an active plan | Switch plan to store dishId refs in `storage.js`/`app.js` |
| Q4 | Is v1 a live in-kitchen timer? | **No — v1 is a planner** (static schedule) | Build live countdowns/alerts (v2) |
| Q5 | Overnight/brisket cooks crossing midnight | **Out of scope v1** (today-only) | Add a serve-date picker + multi-day timing |
| Q6 | "Nothing to start yet" far-future state | **No special UI** (future time is self-explanatory) | Add a countdown-to-first-action affordance |
| Q8 | Mixed late + on-time board | Per-row red flag; headline "⚠ N behind"; on-time rows stay normal | n/a (this is the sensible behavior) |
| Q-INV1 | Buffer default 0 vs 5 | **0** (matches "rest ends exactly at serve") — user-editable | Change default in `storage.js` `emptyState()` |

## Other auto-applied spec-review fixes (in `docs/spec.md`)
- Input validation: name 1–40 chars, cook 1–1440, prep/rest 0–1440, NaN/negative/decimal handled.
- `lateByMin` formatting: `Nm` / `Hh Mm` / `Dd Hh`.
- Stale serve time: if you reopen the next day, serve time resets to now+1h (doesn't load yesterday's).
- Serve-time-in-past shows a single "already passed" panel, not a wall of red.
- Recompute on delete + a 30s/visibilitychange re-tick so late detection stays fresh.

## Process followed (your instructions)
forge prompt → `lee spec write` → `lee spec review` (lens: all) → Claude local plan →
tests-first (TDD) → execute. **No Ultraplan.** Pre-commit-check + new-project-template-check
ran before commit (the `sw.js` template requirement was overridden with the justification above,
logged in the commit footer).

## Files
```
docs/spec.md          reviewed spec (canonical shape, UX traces, dead-end checklist)
web/timing.js         pure engine + validation (dual: browser global + Node export)
web/storage.js        localStorage load/save, stale-date reset, defaults
web/app.js            DOM wiring, validation, recompute, all states
web/index.html        shell (classic scripts, no modules)
web/style.css         canonical dark :root palette
web/manifest.json     home-screen metadata (theming/name; no SW)
web/icons/            192 + 512 PNG flame icons (generated)
test/timing.test.cjs  node --test unit tests
test/e2e.py           Playwright E2E over file://
```

## Suggested next steps (v2)
1. Grill/burner **contention warning** (the differentiator no competitor ships) — warn when 2+ dishes need the same station at once.
2. **Live countdowns + "start now" alerts** (turns the planner into an in-kitchen assistant).
3. Overnight/multi-day cooks (serve-date picker) — unlocks brisket-style planning.
4. Starter library of common grilled cuts with sensible default times.
