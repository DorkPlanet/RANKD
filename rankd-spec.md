# Rankd — Product Spec & Handoff

*Living document. Last updated: v125.*
*This version written explicitly as a handoff — the project is moving from a single long chat conversation to Claude Code. See "Handoff notes" at the bottom for what a fresh session needs to know.*

---

## Vision

A pairwise film ranking tool for cinephiles. Every film has a true ordinal position, not just a star rating bucket. Rankd helps build and maintain that full ranked list.

**North star:** *"Whenever you watch a new movie, you can easily throw it where it belongs in the long list of every movie you've seen."*

---

## Architecture

Single-file HTML/JS/CSS, ~5,300 lines. `localStorage` persistence. TMDb API for film data.
**Storage key:** `rankd-v1` · **TMDb key:** `630395eded5cc3ad09997b49bce640c7`
**Working file:** `rankd-v125.html` → `/mnt/user-data/outputs/rankd.html`

**The single most important architectural gotcha, found twice this project (see Handoff notes):** `loadFilmData()` has a shortcut — if a film already has a `poster` URL, it fabricates a "successful fetch" from whatever fields already exist on the film object, skipping the real TMDb API call entirely. This silently starved genres, tagline, cast, director, and runtime for any film missing that specific field but already possessing a poster. Partially fixed (shortcut now also requires genres to be present), but the underlying pattern — a cache-shortcut that silently prevents real fetches — is worth searching for elsewhere in the codebase.

`persist()` does a full `JSON.stringify` of the entire film library plus three separate storage writes (localStorage main key, localStorage migration-compat key, sessionStorage) on **every single call**. Anything that calls `persist()` in a loop (like the metadata backfill) needs to batch it, not call it per-item — this caused a real, noticeable performance problem once already.

---

## Colour system — Hollywood Golden Age

Gold `--accent` (#DAA520), teal `--green` (#00A3A3), navy `--blue` (#5A82E8), red `--red` (#D81E26), cream `--text`/`--text-hi`. `--dim`/`--dim2` duplication **has been resolved** this session — consolidated to a single `--dim` variable, 53 references updated.

Bottom bar icons: white (`rgba(255,255,255,.92)`), gold on press. Both wordmarks (primary + secondary screens): `#f8de8d` ("popcorn" gold) — deliberately reserved for the wordmark only, not the icons, so it stays one distinct brand moment.

---

## Compare screen

### Mode system
Mode-sheet: **Resume** + **Random** as paired square boxes (teal/blue), then **Tier**, **Film**, and **Tournament** as full-width rows below.

### Tournament mode (new this session)
Start from the lowest-scored film in a chosen tier, climb upward through the rest of that tier (ascending), automatically continuing into the next tier up if the whole starting tier is cleared, using real Log-a-Watch-style tier-promotion mechanics (not a separate scoring path). Winner of *every* match carries forward as champion — including a challenger that just dethroned the previous one, it's a continuous cascade, not "does film X survive." State is `tournamentState`, entirely transient, not persisted. Ends when it runs out of tiers, or when you navigate away (silent cleanup, no "complete" fanfare for an abandoned run).

Champion gets a crown badge + gold poster border (`.cp-champion`) — this same visual treatment is now also applied to the Spotlight pinned film, since both concepts are "stays in place across matches."

**Side stability, fixed this session:** both Tournament and Spotlight had a bug where the "stays in place" film would visually jump sides (always rendering left) regardless of which side you'd actually swiped to select it. Both now track (`championSide`/`pinnedSide`) and preserve the side across renders.

### Director / Actor / Genre ranking (new this session — full 4-stage feature)
Entirely isolated ranking system — **does not touch the main tier scores at all**, structurally, not just by convention. This was the core requirement and needed real care: `cpChoose()` unconditionally calls `updateScores()` and writes directly to film objects before any mode branch runs, so this required an early-return branch at the very top of `cpChoose()`, not a branch added after the normal scoring (which is how Tournament mode is correctly integrated, since Tournament *is* meant to affect the main scores).

- **Search** (`openTopicSearch()`): typed search for director/actor, tappable chip list for genre (built live from whatever genres exist in your library). Debounced (200ms) after an initial slowness report.
- **Background backfill** (`backfillMissingMetadata()`): quietly fetches missing genre/director/cast data at ~350ms intervals when the search opens, batches `persist()` calls (every 8 films) rather than per-film after the same slowness report.
- **Ranking** (`topicRankState`): full round-robin through the filtered pool — every possible pair compared once. Scoring happens in a local `scores` object, seeded at 0, using the same `K` constant as the main system but never touching `S.films`.
- **Completion → save**: prompts for a name, stores to `S.savedTopicLists` (persisted, restored on load).
- **"Your Top"**: new section inside the Stats modal, hidden entirely when there are no saved lists. Tap a list to view it ranked; delete has a real confirmation step (matching the app's other destructive-action confirmations).

**Known open question, unresolved:** full round-robin means an N-film pool needs N×(N-1)/2 comparisons before you ever see a save prompt — 15 films is 105 comparisons. This may be an impractically high bar in practice. Worth revisiting the completion threshold (e.g., stop after each film has been compared some fixed number of times, rather than requiring literally every pair) — flagged, not yet decided.

### Ghost "NEW" badge (new this session)
Shows on a poster when that film has zero total comparisons — confirms visually that the priority-matchmaking system (below) is actually surfacing untouched films, not just trusting it blindly. Cycles through neon marquee colours (pink → cyan → gold → green) via an animated glow around a white base stroke (glow colour animates, not the stroke itself — more reliable cross-browser than animating `-webkit-text-stroke-color` directly). Left/right badges run on independent timing so they don't flash in sync.

### Matchmaking priority (fixed this session)
Untouched films (zero comparisons) get an explicit 85% chance of being prioritized directly in `freshTwoWeighted()`, rather than just being weighted marginally higher within a pool that could contain thousands of other pairs — the old weighting-only approach could leave a single untouched film waiting a long time to surface in a large tier. When multiple untouched films exist, works bottom-up (lowest score first) through them.

### Backgrounds — "clouds"
Genre-based colour lookup (deterministic, no CORS dependency — real-time canvas sampling was tried repeatedly and abandoned, see Handoff notes). Orbs are `position:absolute` inside `overflow:hidden` `#compare-screen`, not `position:fixed` (which ignored all ancestor clipping).

### Titles
Single font (Bebas Neue) for every film, not genre-adaptive. Title container needs explicit `width:100%` or long titles overflow uncontained rather than wrapping.

### Layout
Arena top-anchored, not vertically centered. Hint/progress bar live in the top gap alongside the status indicator. Posters and titles float independently (different keyframe timing).

### Bottom action row — Undo / Save / Skip
Undo permanently visible (simplified from a conditional-show system). `space-evenly` lands exactly 3 items at the 1/4, 2/4, 3/4 marks. **Positioning was shelved mid-session** after repeated blind calibration attempts kept landing "more or less the same" — needs a fresh screenshot to resume, not more guessing.

### Removed
"Not this film" (was already fully orphaned before removal — zero live trigger existed). Compare-layout Vertical/Horizontal toggle (confirmed dead).

---

## List screen

Rank numbers: one static gold colour, no gradient, no top-3 special treatment.
Tier divider: filled-stars-only (`starsStrFilled()`), large and prominent, 20px with glow.
Sticky tier indicator: full-width `#000` bar matching the header exactly (went through several iterations — floating pill, plain centered text — before landing back on "blend in with the top bar" per direct feedback). Its dropdown drawer keeps rounded/pill styling (the one thing explicitly kept from the pill experiment).
Tap-a-tier-to-jump centers the actual tier boundary divider in the visible viewport, accounting for the sticky indicator's real measured height (not the container's raw center, which would land the divider partially hidden behind the indicator).
Autoscroll: 2200ms idle delay, 0.13px/frame. Random start position exactly once, on genuine app open.
Drag-to-reorder scroll: proportional speed from screen midpoint, not binary edge-zone.

---

## Film detail card

Spotlight button (poster-silhouette icon) jumps straight into Focus Film mode via existing `pinFilm()`.

---

## Drawer system

Fully unified: `visibility`+`opacity`+transition (not `display:none`+keyframe), 0.28s `cubic-bezier(.2,.8,.3,1)`, identical for tap/outside-tap/drag-release. `closeAllDrawers()` on every navigation and every drawer-open. Cancel removed except the four genuinely destructive-action confirmations (delete film, delete Log a Watch rating, reset rankings, delete saved topic list) — all four have real "are you sure" steps, nothing else does.

---

## Font system

Source Serif 4 (headings) + Inter (functional UI). Compare screen titles: Bebas Neue, separate system.

---

## Backlog — reprioritized

**Not yet started:**
1. Skip/Save/Undo positioning — shelved, needs a fresh screenshot to resume
2. Reconsider topic-ranking completion threshold (see note above)
3. Remove the orphaned `ranking-screen` — a whole legacy screen (HTML + `renderRanking()` + `renderRankingMap()`) with zero navigation entries anywhere, fully superseded by the current List screen. Found, not yet removed — bigger removal than the two functions cleaned up this session, deserves its own careful pass
4. Performance pass (general, beyond the persist()/debounce fixes already done)
5. Tutorial for first-time users
6. Stats/gamification ideas
7. Multi-medium support (books, music) — large scope, explicitly minimal priority

**On hold, explicit decision:**
- Popcorn logo icon — wordmark + bars only for now

**Known technical debt:**
- Leftover `layout:'v'` field in the persisted state object, dead since the layout-toggle removal earlier this project, never cleaned up
- The orphaned `ranking-screen` (see backlog #3)

---

## Handoff notes — read this before doing anything else

This project has been built entirely in one long chat conversation, without the ability to actually run or render the app. Every visual bug this session — button positioning, centering, missing posters, layout gaps — was only found because the user sent screenshots. **If you're picking this up in an environment that *can* render the app, use that constantly; it would have caught several bugs immediately that took multiple rounds to find blind here.**

Two specific failure patterns recurred enough to be worth naming explicitly:

1. **Silent short-circuit bugs.** Twice, a "smart" caching/shortcut check silently prevented real work from happening (`loadFilmData`'s poster-shortcut skipping the real TMDb fetch; a duplicate function `choose()` vs `cpChoose()` where the wrong one got edited because both existed with near-identical names). When something "should be working but isn't," check for a duplicate/shadow implementation or an overly-eager early-return before assuming the visible code path has a bug.

2. **Automated dead-code scanning is unreliable without real tooling.** A hand-rolled regex script found 101 false positives out of 103 "orphan" candidates in one pass this session, for reasons that weren't fully diagnosed — grep-based direct verification of each candidate was the only thing that actually worked. A real linter/dead-code-analysis tool (ESLint, ts-prune-equivalent, whatever fits) would do this far more reliably than anything hand-rolled in a chat.

**Standing process that worked well and is worth keeping:** confirm scope before building anything nontrivial, show visual mockups for design decisions rather than guessing, verify every fix (syntax check, brace-balance check, direct grep for what changed) before shipping, and — most importantly — when a fix doesn't land correctly on the first or second try, stop patching the same spot and look for a structural cause shared across multiple symptoms instead.
