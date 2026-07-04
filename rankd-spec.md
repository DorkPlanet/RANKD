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

*Reconsolidated after a dedicated backlog-building + fresh-eyes new-user UX review pass. Items below are grounded against the actual code (function/line references given where relevant), not restated from memory.*

**Needs a design discussion first (not ready to just implement):**
1. **Compare screen becomes the home/landing screen**, replacing List as the entry point, with a popup button menu shown on arrival (candidate buttons: Spotlight, Tournament, Recent additions, Director/Actor, Resume, List, Add film — open to combination). An IA change, not a small tweak: needs a decision on primary-vs-secondary button hierarchy (mirroring the current mode-sheet's square/full-width-row split), what "Recent additions" means as a mode, and List's role once it's no longer the landing screen.
2. **Color palette feels too dark.** Current dark palette (`--bg:#150F24`, `--card:#1C1432`, `--card2:#100B21`) needs a few concrete "elegant, not-too-dark, not-light-mode" alternatives proposed and discussed, not a unilateral swap.
3. **Core ranking mechanic needs re-examination — hasn't been touched since near the start of the project.** `clampScore()` clamps every score to stay strictly within its own tier's range regardless of comparison outcome, so a 2★-vs-5★ comparison (which Random mode can absolutely generate) updates both scores but can *never* move either film's tier — tier changes only happen through the separate Log-a-Watch promotion flow. Nothing in the UI explains this. Bundle with the "confidence" stat below: `confidencePct()` = `tierPairwisePct()` = same-tier pairs completed ÷ same-tier pairs possible — never involves cross-tier comparisons at all, which doesn't match the user's current mental model of what it measures. Needs a real look at whether the mechanic is still right and how to surface it, not a quick patch.
4. **Director/Actor/Genre mode's real goal is a true "best of" ranking for that person/genre, scoped by tier — not a comparison-count cap.** Clarified user intent (2026-07-04): the point of full round-robin is correctness — finding the actual best film for that title/person — so capping comparisons per film would just produce a sloppier ranking, not a better-feeling one. The actual fix is scoping the comparison *pool*: only include films from the tier(s) relevant to the search, not the entire matching library regardless of rating. A smaller, tier-scoped pool makes full round-robin naturally tractable (5 films in a tier = 10 comparisons, not 105) while staying a true, uncompromised ranking. Also needs to support incremental addition: when a new film matching an existing saved topic list arrives (newly logged or newly imported), it should get compared against the existing list members to slot in — reusing the same "slot-in provisional placement" pattern the main tier system already has — rather than forcing the whole round-robin to restart from scratch.

**Ready to implement — grounded, no open design questions:**
5. **VS badge positioning is a real bug, not just taste.** `.cp-vs` is centered on `.cp-stage` at flat `top:50%/left:50%`, but the two poster cards are offset asymmetrically (`translateX(-98%)` / `translateX(-2%)`) for the fanned look — so stage-center ≠ where the cards visually meet. Recalculate the badge's position to match the real overlap point; make it a touch smaller; give it more visual interest.
6. **Recent-picks timeline doesn't stay centered with sparse data.** Root cause: `.cp-timeline-row` uses `justify-content:center`, so the "now" divider's screen position shifts with how much recent-pick content exists (0–3 items). Fix: reserve fixed-width slots on the recent side (even empty ones) so "now" anchors at a consistent position regardless of session history.
7. **"NEW" badge logic is misleading.** Keys off `film.comparisons===0` globally, not scoped to the current mode/tier — a film can show "NEW" in Random mode after being thoroughly compared within its own tier via Tier mode. Recalculate to mean "hasn't been paired against anything in the *currently selected mode/tier scope* yet," using `hasCompared()`/`comparedPairs` scoped correctly per mode.
8. **Achievements are stale.** All 10 existing achievements (`getAchievements()`) are comparison-count or tier-coverage based — none reward Tournament runs, Spotlight sessions, or Director/Actor/Genre lists. Expand so achievements reflect the app's actual current breadth, doubling as gentle mode-discovery.
9. **Empty stars should never render.** `starsStr()` pads to 5 chars with hollow `☆` for empty slots, used at 15 call sites; `starsStrFilled()` already exists and does this correctly (filled-only) but is only used for tier dividers. Fix: make `starsStr()` stop emitting `☆` — fixes all 15 call sites at once. Check afterward for any layout relying on the fixed 5-character width for alignment.

**From the fresh new-user UX review (new findings, not previously tracked):**
- No feedback after a choice beyond moving to the next pair — no visible score nudge or confirmation of what just happened. Compounds item 3's "can't tell how this ranks things" feeling. Deliberately parked until item 3 above is resolved — whatever feedback we show should reflect the real mechanic, not be designed in isolation from it.
- Log-a-Watch is a 6-step flow for "I watched a thing, rate it" — worth a pass on whether every step needs to be sequential for the common case. Not yet traced through `lwShowStep()` in detail, so no concrete fix proposed yet.
- Stats modal shows full density (hero metrics, confidence, tier breakdown, achievements, most-compared, Your Top) identically whether the user has ranked 2 films or 200 — worth a simpler first-visit state (e.g. hide tier breakdown/achievements/most-compared until there's enough data to make them meaningful).

**Carried forward, not yet started:**
10. Remove the orphaned `ranking-screen` — a whole legacy screen (HTML + `renderRanking()` + `renderRankingMap()`) with zero navigation entries anywhere, fully superseded by the current List screen. Found, not yet removed — bigger removal than the two functions cleaned up earlier, deserves its own careful pass
11. Performance pass (general, beyond the persist()/debounce fixes already done)
12. Tutorial for first-time users — partially addressed by the Mode Sheet "start here" highlight below, but no broader onboarding exists yet
13. Multi-medium support (books, music) — large scope, explicitly minimal priority

**Resolved since this backlog was last written:**
- Skip/Save/Undo positioning — action row repositioned, session timeline panel built.
- "Up next" preview groundwork — recent-picks half shipped (see below for what's still deferred).
- No onboarding/no steer on where to start — Mode Sheet's Tournament option now gets a gold-glow "START HERE" badge whenever the user has made zero comparisons yet (`openModeSheet()`, `.msheet-opt.recommended`/`.msheet-top-btn.recommended` — shared treatment, works on both the square top boxes and full-width rows), clearing the moment they've made a real choice. Tournament was picked over Resume/Random as the recommended first move since it gives a clearer beginning/middle/end structure than open-ended comparing. Doesn't replace a full tutorial (backlog #12 above still open) but directly resolves the "six equal-weight modes, no signal" problem cheaply.
- **Random mode removed entirely** — button, `msheetPickRandom()`, the `S.mode==='chaos'` branch in `pickPair()`, and related dead labels/CSS all deleted (not just hidden). Random was the one mode that produced fully cross-tier pairs; removing it also means every remaining mode is inherently same-tier-scoped, which incidentally simplifies backlog item 3 above (no more "why did my 2★ face my 5★" case to explain away). Resume/"Start Ranking" now takes the full-width top slot alone.

**Deferred, partially built:**
- "Up next" lookahead engine + tier-end star marker for the compare-screen timeline strip — the recent-picks half is live and wired into `renderPair()`; the upcoming-films half is still a placeholder approximation (grabs same-tier films directly rather than a real lookahead), since accurate prediction requires restructuring `pickPair()` to pre-compute one pair ahead instead of re-rolling fresh each call.

**On hold, explicit decision:**
- Popcorn logo icon — wordmark + bars only for now

**Known technical debt:**
- Leftover `layout:'v'` field in the persisted state object, dead since the layout-toggle removal earlier this project, never cleaned up
- The orphaned `ranking-screen` (see backlog #10)

---

## Handoff notes — read this before doing anything else

This project has been built entirely in one long chat conversation, without the ability to actually run or render the app. Every visual bug this session — button positioning, centering, missing posters, layout gaps — was only found because the user sent screenshots. **If you're picking this up in an environment that *can* render the app, use that constantly; it would have caught several bugs immediately that took multiple rounds to find blind here.**

Two specific failure patterns recurred enough to be worth naming explicitly:

1. **Silent short-circuit bugs.** Twice, a "smart" caching/shortcut check silently prevented real work from happening (`loadFilmData`'s poster-shortcut skipping the real TMDb fetch; a duplicate function `choose()` vs `cpChoose()` where the wrong one got edited because both existed with near-identical names). When something "should be working but isn't," check for a duplicate/shadow implementation or an overly-eager early-return before assuming the visible code path has a bug.

2. **Automated dead-code scanning is unreliable without real tooling.** A hand-rolled regex script found 101 false positives out of 103 "orphan" candidates in one pass this session, for reasons that weren't fully diagnosed — grep-based direct verification of each candidate was the only thing that actually worked. A real linter/dead-code-analysis tool (ESLint, ts-prune-equivalent, whatever fits) would do this far more reliably than anything hand-rolled in a chat.

**Standing process that worked well and is worth keeping:** confirm scope before building anything nontrivial, show visual mockups for design decisions rather than guessing, verify every fix (syntax check, brace-balance check, direct grep for what changed) before shipping, and — most importantly — when a fix doesn't land correctly on the first or second try, stop patching the same spot and look for a structural cause shared across multiple symptoms instead.
