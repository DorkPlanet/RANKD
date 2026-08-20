# Rankd — Product Spec & Handoff (ARCHIVE)

> **Read this first, then mostly read something else.**
>
> This document describes the **original single-file HTML prototype**. That
> prototype is gone. Its function names, CSS classes, storage keys, colour
> variables and screen structure exist nowhere in the codebase — do not go
> looking for `loadFilmData`, `persist`, `pickPair`, `--card2`, `rankd-v1` or
> `ranking-screen`. They were real once and they are not now.
>
> **Where the live truth lives, as of 17 Aug 2026:**
>
> | Question | File |
> |---|---|
> | What is built, what broke, what not to touch | `HANDOVER.md` |
> | What is deliberately NOT built, and why | `POTENTIAL-FEATURES.md` |
> | How the ranking actually works | `rankd-app/src/lib/ladder.ts` (61 tests) |
> | What a duel is evidence of | `rankd-app/src/lib/log.ts`, `bayes.ts` |
> | How to work on this | `CLAUDE.md` |
>
> **Why this file is kept.** The ranking mechanic it describes is the direct
> ancestor of the live engine: the floor/cap window collapsing onto a single
> placement is what `spotLo`/`spotHi` do in `ladder.ts` today, arrived at
> independently and for the same reasons. Read it for *why* the ranking works
> the way it does. Read the code for *how*.
>
> **The backlog below is prototype-era and has been reconciled** — see
> "What happened to the old backlog" at the bottom. Nothing in it should be
> picked up without checking there first; most of it is either built,
> impossible against the current code, or answered differently.

*Frozen as an archive on 17 Aug 2026. Last live update: v125.*
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
5. ~~VS badge~~ — **removed entirely.** Originally flagged as a positioning bug; corrected that claim after direct measurement showed it was never actually off-center (the -98%/-2% card offsets are exactly self-cancelling). Briefly resized/re-animated instead, then the user decided to just cut the badge altogether — HTML element and all associated CSS (`.cp-vs`, `.cp-vs::before`, `vsGlimmer`/`vsRotate` keyframes) removed, no dangling references, verified clean in the live preview.
6. ~~Recent-picks timeline doesn't stay centered with sparse data~~ — **done.** Both the recent side and the upcoming side now always render 3 slots (invisible `visibility:hidden` placeholders filling in when there's less real content), so "now" stays exactly centered regardless of session history. Verified: 0/1/2/3 recent picks all measure zero pixel offset from row-center.
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

---

## What happened to the old backlog

Reconciled 17 Aug 2026, item by item, against the live app. Recorded because an
un-reconciled backlog is worse than no backlog: it looks like work waiting to be
done and is mostly work that is finished, impossible, or was answered
differently. **Nothing above should be picked up without reading this.**

### Built, differently and better

| Old item | What actually happened |
|---|---|
| 1. Compare screen becomes the landing screen | Answered the other way. The **profile** is the landing screen once anything is placed (`openingScreen` in `AppShell.tsx`); the duel is where a new library lands. The popup button menu became the Play sheet. |
| 4. Director/Actor/Genre as a true "best of", tier-scoped | Built as **curated runs** — a King of the Hill climb over an explicit pile, `crossTier`, writing no score and no lock. Not tier-scoped: it spans tiers deliberately, which is the whole point of ranking a director against themselves. `lib/curated.ts`. |
| 8. Achievements are stale | Rebuilt. `lib/achievements.ts`, 34 badges, with a trophy case on the profile. |
| 9. Empty stars should never render | Done. `starsFor` in `tiers.ts` emits filled stars and a half, never hollow. The one remaining `☆` is the *locked badge* marker in `Trophies.tsx`, which is deliberate. |
| 12. Tutorial for first-time users | Built as **coach marks** over the live UI, per screen, revisitable from Settings. `lib/tour.ts`, `Coach.tsx`. |
| No feedback after a choice | Answered with motion rather than numbers: the card follows the thumb, the loser fades, the winner flies, the rank face lifts. Deliberately not a score readout — see the decision block in `HANDOVER.md`. |
| Palette too dark | Superseded entirely. The purple prototype palette is gone; the app is navy `#040c1a` with a brightness slider the user controls. |

### Dead — the code it describes no longer exists

- **3. Core ranking mechanic re-examination / `clampScore` / `confidencePct`.** The mechanic was rebuilt around an evidence log and a Bayesian fit (`log.ts`, `bayes.ts`, `beliefs.ts`). Cross-tier comparison now exists on purpose, via curated runs. Confidence is `confidenceFromSpread`, computed from belief spread rather than pair counts.
- **5, 6.** VS badge and recent-picks timeline — both resolved in the prototype.
- **7. "NEW" badge scoping.** That badge does not exist. The duel screen shows `UN-RNKD` / `CLIMBING` pills, which are about the run, not a global count.
- **10. Orphaned `ranking-screen`.** Deleted with the prototype.
- **11. Performance pass.** Superseded by specific, measured work: interned log rows, `content-visibility` on list rows, a content hash so an unchanged library is never re-uploaded, batched sweep writes.
- **Known technical debt** (`layout:'v'`, the orphan screen) — both gone with the prototype.

### Still genuinely open, and now tracked properly

These were the only ideas here with nothing equivalent in the live app. They have
been **moved into `POTENTIAL-FEATURES.md`** so they are tracked where the rest of
the unbuilt work is, rather than stranded in an archive:

- Log a film is still a multi-step flow for "I watched a thing, rate it".
- The profile shows full density whether you have ranked 2 films or 200.
- The film strip's "up next" is still an approximation rather than a real lookahead.
- Multi-medium support (books, music).
