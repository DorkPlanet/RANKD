# ⚑ HANDOVER — read this first

**Repo:** `github.com/DorkPlanet/RANKD`, branch `master`, public. App in `rankd-app/`.
Commit identity is `Rankd Dev <dev@rankd.local>` — set locally, never the real email.
Verify with `git log --format='%an <%ae>' | sort -u` before any push.

**Live:** https://rankd-app-eight.vercel.app — deploy with `npx vercel --prod --yes`
from `rankd-app/`. Auth is already in place (`jarradrbishop-2544`, project
`rankd2/rankd-app`, `TMDB_API_KEY` set for Production). Always verify the URL serves a
200 rather than trusting the CLI's success line.

**State:** **240 tests, typecheck clean, lint unchanged at 3 problems in `src`** — 2
pre-existing `AppShell` set-state-in-effect errors + 1 unused `tier` in `Rolodex`. **That
is the baseline (it used to be 4). Do not "fix" them, and do not add a fourth** — the
person-run effect needed rewriting to derive its title instead of setting state, which is
the better shape anyway.

---

## Landed since the last handover

Session end screens · Undo in the climb (one step, with log retraction) · rank-face
clipping fix · **Log Film** (nav, replacing Stop) · `/api/search` returning candidates ·
**director/actor ranking, cross-tier** · `/api/person` filmographies · borrowed "guest"
films · one shared `RunBars` across all modes · results feed removed · **remove a film** ·
**#38 + #37: person runs are a cross-tier King of the Hill climb ending on a summary with
JPG export and save-as-list.**

## Decisions taken — do not relitigate

- **Person rankings are cross-tier and write NO scores.** The order is read from belief
  means (one 1–10 scale that never knew about tiers), so `score` and its tier bands stay
  untouched. See the header comment in `src/lib/people.ts`.
- **The export card is 4:5 (1080×1350) and stays a CARD.** It was briefly 9:16, by copying
  Wrapped's slides literally — the wrong lesson. Wrapped is a full-screen story you swipe;
  this is one image posted to a feed, and a 9:16 feed post is a long thin sliver. 4:5 is
  the tallest Instagram shows uncropped and Twitter renders it whole. **A short card is the
  point, not a limitation** — it shows the top handful and says how many it left out.
  (User's call: "a clean card not a long one".)
- **The hero numeral is set in the DISPLAY face (Bebas), never the serif.** Source Serif's
  "1" is fine at 19px in a list row and genuinely ugly at 100px, where its bracketed base
  reads as a stray bar. User flagged it; don't reintroduce it by making the card's type
  "consistent".
- **No gradients on the card.** Wrapped 2024's vibrant-gradient era would look borrowed on
  a dark/gold/serif app; the reference is Wrapped 2025's restraint. Colour IS pulled from
  the winning poster (`accentFrom`), but spent only on two hairlines and the hero ring.
  (User's call, agreed explicitly.)
- **Guest films** (`Film.guest`) are borrowed for one run and never persisted. This is now
  enforced in ONE place: `saveFilms` filters them, so no write path can leak one whatever
  it does upstream. `AppShell` derives a guest-free `library` for every screen except the
  duel, so they are also never *shown* outside the run that borrowed them.
- **Saved lists freeze their order at save time**, not stay live — built that way in
  `lib/lists.ts`, with the reasoning in its header. (User delegated this call.)
- **Removal never touches the evidence log.** Retracting would destroy what a duel says
  about the film on the *other* side. `fitBeliefs` already skips absent ids.
- **The log always records**, whatever a setting says. Settings govern influence only —
  **with exactly one exception, below.**
- **A person run records NOTHING. Not a score, not a lock, not a log row, not a duel
  count.** It is the only game in the app that leaves no trace whatever. The reasoning:
  it is not a claim about your library at all — it is a list you build to look at and to
  share, over a pile that can include films you have never seen, answering "which Nolan is
  better" rather than "where does this belong". `settle` and `confirm` in `ladder.ts` both
  branch on `session.crossTier`.
  - **The cost, accepted knowingly (user's explicit call): every person climb is a cold
    start.** Its opening order comes from belief means that its own duels will never
    improve. Do not "fix" that by quietly re-enabling the log.
  - **Watch the undo path if you touch this.** `commit` in `DuelScreen` reads an empty
    journal as "no judgement happened — a confirm or a flick" and drops the undo step.
    That was true until a run started answering duels without logging them, so
    `commitUndoable` now sets its step AFTER committing rather than before. Without that,
    person runs lose undo entirely.
- The TMDb key is in public history (`ab25cf58`). **User has declined rotation five
  times — note it if relevant, never argue it.**

## Next, in order

1. **Saved lists have nowhere to be read.** `lib/lists.ts` stores them and the summary
   saves to it, but nothing in the app lists them back — the only way to see one is
   `localStorage`. Finishing #37 properly means a shelf: probably on the profile, since
   the list screen's scroller may not gain anything new (see `ROW_H` below).
2. **BUG — a person's film list is incomplete until you've scrolled past the films.**
   Reported: opening a director or actor sometimes omits films you *have* seen, as if you
   hadn't; going to the list and looking at it directly fixes it.
   - **Theory, evidence gathered, not yet reproduced live.** `director` and `cast` only
     land on a `Film` when its meta has been fetched — `withMeta` in `lib/meta.ts`. Nothing
     fetches meta for the whole library. The only two things that do it are
     `useVisiblePosters` (ListScreen, driven by the *viewport*: `[data-film-id]` rows
     within `600px` of the scroller) and `backfillPosters` from the duel screens. So a film
     you have never scrolled to carries no credits, `filmsBy` matches on
     `f.director === name` / `f.cast.includes(name)` and cannot see it. Scrolling it into
     view backfills and persists the credits — which is exactly the "going back to the list
     fixes it" the user describes.
   - Same root cause makes `peopleIn` under-count, so the person list itself is
     incomplete, and a `count` shown next to a name can be wrong.
   - Fix directions, cheapest first: (a) drive a background credits-only sweep on idle so
     the library converges without needing the viewport; (b) on opening a `PersonSheet`,
     fetch meta for films still missing credits before rendering `mine`. (b) alone is a
     band-aid — it cannot find a film it doesn't know is theirs. **(a) is the real fix**;
     (b) only narrows an already-narrowed set. Verify against rendered output, not stored
     state.
3. **Fast Shuffle doesn't share the climb's animation.** KotH and Spotlight fly the winning
   poster into the climbing seat (`flyPosterAcross` / `fadeLoserOut` in `PosterCard`);
   Fast Shuffle just swaps. User noticed. `ShuffleDuel` is a separate component with its own
   render, which is why it never inherited it — the animation helpers are already exported
   and take two `<img>` elements, so this is mostly wiring, not new work.
4. **Feedback review.** A pass through the app with the user, collecting what does and
   doesn't land, rather than shipping the next feature blind. Overlaps #14 but is not the
   same job: #14 is styling the PROVISIONAL screens, this is finding out what's wrong.
5. **#24 — advisory-only switch.** `withdrawSoftLocks()` is built and tested but
   unreachable from the UI. Cheapest real win left.
6. **#14 — design pass.** `SessionEnd`, `PersonSheet`, `LogFilm` and `RunBars` all ship
   marked PROVISIONAL and are overdue the user's eye. The compare screen's own design is
   protected — new UI fits around it.

## Pinned — decide later, don't act yet

- **Finishing a run doesn't feel like anything happened.** User's words, about `SessionEnd`
  as it stands. **Pinned deliberately against the JPG export in #37**: a thing you can take
  away and show someone may be the payoff the screen is missing, so build that first and
  re-judge the feeling afterwards. Do not design a separate celebration in the meantime.
- **Fast Shuffle may not deserve to exist.** From watching real people use the app: they
  "hardly like the idea of something else shuffling their list for them". The mode may need
  removing or rethinking outright. **Explicitly deferred — not this session, and to be
  taken up at the very end**, since it is a question about what the app is for rather than
  a bug, and answering it early would block work that doesn't depend on it. Note that the
  person run no longer relies on it (it is a climb now), so Fast Shuffle is already less
  load-bearing than it was.

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
- **A `setState` updater runs TWICE in dev.** The person run merged its borrowed films
  with a plain concat, and React's double-invoke turned a 19-film filmography into a
  35-film climb against duplicates of itself. Any updater that derives from previous state
  must be idempotent — merge by id, never append.
- **TMDb images do NOT taint a canvas — the browser cache does.** `image.tmdb.org` sends
  `Access-Control-Allow-Origin: *`, but a poster the app has already shown via a plain
  `<img>` is cached WITHOUT CORS, and every later CORS request for that exact URL fails
  outright. `lib/card.ts` requests each poster with an extra query parameter so it gets its
  own cache entry. Verified live: same URL, cached-plain then CORS = LOAD FAILED; untouched
  then CORS = draws and exports clean.
