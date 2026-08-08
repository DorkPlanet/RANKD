# ⚑ HANDOVER — read this first

**Repo:** `github.com/DorkPlanet/RANKD`, branch `master`, public. App in `rankd-app/`.
Commit identity is `Rankd Dev <dev@rankd.local>` — set locally, never the real email.
Verify with `git log --format='%an <%ae>' | sort -u` before any push.

**Live:** https://rankd-app-eight.vercel.app — deploy with `npx vercel --prod --yes`
from `rankd-app/`. Auth is already in place (`jarradrbishop-2544`, project
`rankd2/rankd-app`, `TMDB_API_KEY` set for Production). Always verify the URL serves a
200 rather than trusting the CLI's success line.

**State:** last commit `fca4308`, pushed, remote in sync. **214 tests, typecheck clean,
lint at 3 problems** — 2 pre-existing `AppShell` set-state-in-effect errors + 1 unused
`tier` in `Rolodex`. **That is the new baseline (it used to be 4). Do not "fix" them.**

---

## Landed since the last handover

Session end screens · Undo in the climb (one step, with log retraction) · rank-face
clipping fix · **Log Film** (nav, replacing Stop) · `/api/search` returning candidates ·
**director/actor ranking, cross-tier** · `/api/person` filmographies · borrowed "guest"
films · one shared `RunBars` across all modes · results feed removed · **remove a film**.

## Decisions taken — do not relitigate

- **Person rankings are cross-tier and write NO scores.** The order is read from belief
  means (one 1–10 scale that never knew about tiers), so `score` and its tier bands stay
  untouched. See the header comment in `src/lib/people.ts`.
- **Guest films** (`Film.guest`) are borrowed for one run and never persisted. Both
  `onFilms` and `onMeta` in `DuelScreen` strip them.
- **Saved lists will freeze their order at save time**, not stay live. (User delegated
  this call.)
- **Removal never touches the evidence log.** Retracting would destroy what a duel says
  about the film on the *other* side. `fitBeliefs` already skips absent ids.
- **The log always records**, whatever a setting says. Settings govern influence only.
- The TMDb key is in public history (`ab25cf58`). **User has declined rotation five
  times — note it if relevant, never argue it.**

## Next, in order

1. **#38 + #37 together.** Person runs should follow King of the Hill ("one climbing till
   I decide what's at the top") and finish on a summary offering a **JPG export** and
   **save as a list**. They must land together — a person climb with nowhere to put its
   answer is worse than the shuffle it replaces.
   - `startRun` needs an `only?: string[]` option so the pile can be an arbitrary film
     set rather than a tier.
   - **The hard part:** `confirm` currently writes a score inside a tier band. A person
     run must not. Proposed: a `crossTier` session flag so `confirm` appends to
     `session.confirmed` (already an ordered id array) *without* writing a score — at
     which point the finished pile IS the ranked list, ready for the summary.
   - `ladder.ts` is the most guarded module in the app (49 behavioural tests, immutable
     in/out). Giving `confirm` a second meaning needs its own test pass.
   - JPG export: posters are remote TMDb images, so **canvas will taint** unless they are
     fetched as blobs or proxied through our own origin. Check this first; it decides the
     whole approach.
2. **#24 — advisory-only switch.** `withdrawSoftLocks()` is built and tested but
   unreachable from the UI. Cheapest real win left.
3. **#14 — design pass.** `SessionEnd`, `PersonSheet`, `LogFilm` and `RunBars` all ship
   marked PROVISIONAL and are overdue the user's eye. The compare screen's own design is
   protected — new UI fits around it.

## Gotchas that have already cost time

- `next build` and `next dev` share `.next` — stop the preview before building.
- `ROW_H = 96` in `ListScreen.tsx` drives section spacers and tier-jump offsets. Nothing
  may change a list row's height, and nothing new goes *inside* the list scroller.
- **The CLIMBING / UN-RNKD pills straddle the bottom edge of their poster**, so the row's
  visible ink ends below its box. Anything placed under the posters needs explicit
  clearance — this caused a real collision when the results feed was removed.
- **Verify by looking at rendered output, not stored state.** Several bugs this project
  passed a storage check and were still broken on screen.
- **The dev console retains stale build errors.** A fixed parse error keeps reappearing in
  `read_console_messages`. Confirm against a fresh fetch and `tsc`, not the console.
- **Never use `s|...|...|` in perl when the pattern contains escaped pipes** — the
  delimiter collides and silently rewrites the wrong line. It cut a type declaration in
  half this session.
- Commit messages: write to a file and use `git commit -F`. PowerShell here-strings mangle
  messages containing quotes.
- The preview pane does not composite: animations never *finish* there. Control-test with
  a plain `element.animate()` before reporting an animation bug.
- `test/fixtures/ratings.csv` is gitignored; `import.test.ts` skips loudly without it.
