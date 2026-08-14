# ⚑ HANDOVER — read this first

**Repo:** `github.com/DorkPlanet/RANKD`, branch `master`, public. App in `rankd-app/`.
Commit identity is `Rankd Dev <dev@rankd.local>` — set locally, never the real email.
Verify with `git log --format='%an <%ae>' | sort -u` before any push.

**Live:** https://rankd-app-eight.vercel.app — deploy with
`npx vercel --prod --yes --scope rankd2` from `rankd-app/`. **The `--scope rankd2` is
required**: without it Vercel answers "Not authorized" even though `vercel whoami`
succeeds, which reads like an expired login and is not. **Verify a deploy by grepping the
live JS bundle for a string you just added — a 200 proves nothing**, and "committed" is not
"deployed" (that mistake cost the user a session; see below).

**State (14 Aug 2026):** Session G is in the working tree — **uncommitted, unpushed and
UNDEPLOYED.** Everything up to `0b615a9` is pushed AND deployed AND verified against the
live bundle. **Accounts live on the `accounts` branch (`8c2e3f8`), deliberately unmerged
and undeployed** (see Pinned). **321 tests (307 + 14 from Session G), typecheck clean,
`next build` clean, lint at 3 problems in `src`** — 2 pre-existing `AppShell`
set-state-in-effect errors + 1 unused `tier` in `Rolodex`. **That is the baseline. Do not
"fix" them, and do not add a fourth.** The `accounts` branch adds 24 tests of its own on
top.

**One thing in the tree is written, tested and wired to nothing.** Finish it or delete
it; do not leave a second:
- `leastRanked` in `progress.ts` — no callers. Left over from a tier map that was built
  twice and rejected twice. It is the ingredient a resume selector would want.
- ~~`lib/visit.ts`~~ — wired in Session G. The recap is on the profile.

## How to get oriented in five minutes

- **The app is a ranking game.** You rate films 1–5★ on import; the game is deciding the
  ORDER within and across those ratings, by head-to-head duels. `lib/ladder.ts` is the
  engine and the most guarded module here (61 behavioural tests, immutable in and out).
- **There are two kinds of ranking, and keeping them apart is the load-bearing idea.**
  The MASTER list — King of the Hill over a tier, Spotlight, Fast Shuffle — writes `score`
  and `lock` and is the app's real opinion of your library. CURATED lists — a director, an
  actor, a genre, reached through the **Curator** — write *nothing at all* and exist to be
  looked at and shared. Every decision below follows from that split.
- **The user's real 861-film library is at `rankd-app/test/fixtures/ratings.csv`** and is
  gitignored. `import.test.ts` runs against it. Use it: bugs that only appear at 861 films
  (see the sweep's batching) do not appear at the 10-film seed.
- **Read `CLAUDE.md`.** Form a theory, get evidence, then fix. This project has repeatedly
  punished guess-and-patch — see the gotchas at the bottom, most of which are cases where
  something *looked* fixed and was not.

---

## Landed

**Session A (`c31416d`) — a director's work as a climb.**
`startRun` gained `only?: string[]` (an arbitrary pile, not a tier) and sessions gained
`crossTier`. A person run is a King of the Hill climb over their filmography in belief
order, and it **records nothing at all** — no score, no lock, no evidence row, no duel
count. Borrowed "guest" films can join it. It ends on `RunSummary`.

**Session B (`c4cff13`, `92d03dd`) — three share cards.**
Named Classic, Marquee and Paul Allen. Marquee's colour block comes from the five brand
bars (poster colour washed out to off-white on muted posters); saving downloads the file
rather than opening a share sheet.
`card.ts` became `card/` (`canvas`, `types`, `render`, `data`, `share` + one file per
design). Three designs, swipeable via `CardPicker`, downloaded individually, all
1920×1080. A personalised insight engine (`lib/insight.ts`, 15 tests). Director/actor
portraits from `/api/person?portrait=1`.

**Session C (`c85d60e`) — the credits sweep.** The library now walks itself on a
timer and fills in missing `director` / `cast` / `genres`, so a filmography no longer
depends on which rows you happened to scroll past.

**Session D (`62f2ab3`) — the Curator.** "Curator" in the Play sheet covers director,
actor and genre. Director/actor hand to `PersonSheet`; genre is new (`lib/genres.ts`,
`CuratedPicker.tsx`), ranks the library only, and defaults to the whole genre with
Top 50/25/10 offered when it is bigger.

**Session E (branch `accounts`, NOT merged) — Google sign-in and a server mirror.**
Auth.js, Postgres via Drizzle, and a mirror of the library. **Kept off master on
purpose:** `vercel` deploys the working directory rather than git, so merging it would
put a "Continue with Google" button on production that errors — there is no
`AUTH_GOOGLE_ID` or `DATABASE_URL` in the Vercel environment. `lib/auth.ts` is the
single session seam, `lib/sync.ts` the mirror, `lib/reconcile.ts` the conflict decision.
Sign-in, push, pull and the conflict chooser are **unrun** — they need a database.
Full plan: `C:\Users\jarra\.claude\plans\foamy-painting-hammock.md`.

**Session F (`1221e4b` … `0b615a9`) — the big one. Read the decision blocks below.**
Eleven pieces of feedback from real use, worked through in order, then Rough Cut, then
five more bugs found by using the app while building it.

Landed: the duel screen's top zone rewritten · the review card's frequency fixed · reset
with granularity · 11 → 34 badges · antiphase float · **Rough Cut** (a new mode) · a
ghost-click bug that had been silently closing the setup panel · and the `band`
constraint that stops ranking a pile from destroying the cut that made it.

`RunBars` is now `RunStatus` — one bar, not bars.

**Session G — opening and returning (roadmap #2, all three parts).** The recap, the
splash, and the profile as the landing screen. Motion first, landing second, as agreed.

## Decisions taken — do not relitigate

- **Curated lists are INDEPENDENT of the master scoring system.** Director, actor and
  (later) genre rankings exist to be looked at and shared. `settle` and `confirm` in
  `ladder.ts` both branch on `session.crossTier`.
  - **The cost, accepted knowingly: every person climb is a cold start.** Its opening
    order comes from belief means its own duels will never improve. Do not "fix" that by
    quietly re-enabling the log.
  - **Watch the undo path.** `commit` in `DuelScreen` reads an empty journal as "no
    judgement happened" and drops the undo step. `commitUndoable` therefore sets its step
    AFTER committing. Without that, person runs lose undo entirely.
- **The log always records — with that one exception.** Settings govern influence only.
- **Guest films are never persisted and never shown outside their run.** Enforced in one
  place each: `saveFilms` filters them, and `AppShell` derives a guest-free `library` for
  every screen but the duel.
- **Cards are 16:9 (1920×1080).** Not 9:16 — that was copying Wrapped's slides literally,
  and Wrapped is a full-screen story you swipe while this is one image in a feed.
- **The hero numeral is set in the DISPLAY face (Bebas), never the serif**, and positioned
  by `actualBoundingBoxLeft` so the *stroke* lands on the margin rather than the glyph box.
- **No gradients.** Colour comes from the artwork as an accent only.
- **A portrait complements, never competes**: a small circle beside the name; the big image
  stays the winning film.
- **Insight preconditions are COUNTS, never vibes.** ≥4 rated films for any rating claim; a
  genre needs ≥3 entries AND ≥40% of the list; ≥60% coverage for optional fields. A guest's
  seed 3★ is never counted as an opinion. **A bare genre count is the weakest claim
  available** — most directors have a genre, so naming it reports the obvious back.
- **Stats are drawn from two populations, deliberately.** The AVERAGE is about you (seen
  films only); GENRE and DECADE are about the list (everything in it). Getting this wrong
  put `GENRE: ACTION` beside "10 of these 19 are drama" on the same picture.
- **Saved lists freeze their order at save time.** See the header of `lib/lists.ts`.
- **Removal never touches the evidence log.**
- The TMDb key is in public history (`ab25cf58`). **User has declined rotation five times —
  note it if relevant, never argue it.**

### Rough Cut, and the sorting problem it answers (Session F)

- **`ladder.ts` costs n(n-1)/2 duels to rank a tier, and 3★ holds 185 films.** Several
  thousand comparisons. Every gesture proposed to make that bearable — lock-at-the-bottom,
  a reverse climb, armed taps on the film strip, batch-the-tail — was a constant-factor
  patch on a quadratic sort. **They were all dropped.** If someone asks for another
  shortcut through a big tier, the answer is almost certainly bucketing, not a gesture.
- **Rough Cut is bucketing:** one pass, one decision per film, upper/middle/lower third.
  No comparisons. It **writes scores and nothing else** — no log rows (no pair was
  compared, and every belief and badge rests on the log being literally true) and no
  locks (coarse is not a commitment).
- **It needed no new engine because `poolFor` sorts the pile BY SCORE.** The climb is
  expensive precisely because that order starts arbitrary. Better scores ⇒ a nearly
  sorted pile ⇒ insertion sort close to linear.
- **`writeScores` now honours `session.band`, and this is load-bearing.** It spreads a
  run's films across the whole tier band, which is right when the run IS the tier and
  destructive when it is a slice: confirming one film of a four-film pile used to
  re-spread those four from `tierMin` to `tierMax`, scattering them back through the two
  piles they had just been separated from. `startRun` sets `band` from the pile's own
  current scores for an `only` run that is not cross-tier. **Do not remove this without
  re-reading `test/roughCut.test.ts` — a whole feature silently undoes itself.**
- **The piles are not stored and must never be.** A film's score IS which third it sits
  in, so `bandsOf` derives them from the library as it stands. That is why "go back to
  the split I did yesterday" survives closing the app, restoring a backup, and ranking one
  of the piles.

### Onboarding (Session G)

- **The tour is not playable, and that is the point.** The scrim swallows every tap,
  including on the control it is highlighting. `settle` cannot tell a demonstration duel
  from a real one, and every belief, badge and score rests on the log being literally
  true — so a tutorial that let you "try it" would write judgements nobody made. Verified:
  a full five-step run left the log at exactly the row count it started with.
- **One tour per screen: `TOURS.duel` (5 steps) and `TOURS.list` (3).** The duel carries
  most of the teaching because that is where the game is; the list gets its own because it
  holds the one genuinely unguessable idea in the app — **a rating is not a position**,
  which is what the UN-RNKD divider means and what nothing on screen says. The profile has
  none: it is labels next to numbers, which is the one kind of screen that explains itself.
- **It auto-runs only when nothing is placed** — the same predicate as the landing rule.
  Somebody with a ranked library is never ambushed; Settings → **Show me around** is their
  route in, and that half was explicitly asked for. Settings forgets BOTH tours and sets a
  session-only `replaying` flag, which is what lets them run on a ranked library at all.
- **Every screen change goes through `go()` in `AppShell`, which defers the tour by a
  tick.** `Coach` resolves its targets as it RENDERS, so mounting it in the same commit as
  a screen change measures the screen the user is leaving and resolves to almost nothing.
  The landing screen is the one exception and needs no deferral, because the splash has
  held it for the better part of a second. **Do not add a new `setScreen` call site.**
- **A tutorial is a held moment: nothing behind it may move.** `ListScreen` takes a
  `frozen` prop that switches `useDriftScroll` off while the marks are up. The list drifts
  at 20px/s after 2.5s of quiet and a tutorial holds the reader far longer, so the page
  crept downward and the spotlight — which re-measures its target — faithfully followed
  the row off the screen. **The mark was doing its job; the page was not supposed to be
  moving.** The drift's own input listeners sit on the scroller, BEHIND the overlay, so
  nothing the reader does can bump it back to idle either. Any future overlay that holds
  someone still on the list has to do the same. Verified both ways: frozen for 5.4s with
  zero pixels of movement, and drifting again within 4.5s of the tour closing.
- **A step whose target is absent is dropped, and that is load-bearing, not defensive.**
  The strip is not in every mode, and the UN-RNKD divider does not exist once a tier is
  finished. `resolveSteps` filters and the counter adjusts.
- **The mark's position is written to the DOM, not held in state.** Coordinates come from
  `getBoundingClientRect` on a live element — a reading of the DOM, not a fact React owns.
  State would mean measure → setState → re-render on every step, resize and scroll.
- **The caption's height is measured, never estimated.** A constant was close enough to
  look right and wrong enough to matter: the copy sets the height, the longest step ran
  ~12px past the guess, and the gap under the bottom-nav step collapsed from 16px to 4.
- **The spotlight is clamped to the viewport.** The nav sits flush to the bottom edge, so
  its padded box ran 8px off-screen and the gold ring came out as a three-sided bracket.
- **Arming is a timestamp, not a flag.** Ghost clicks are real here — a full-screen layer
  mounting under a finger that has just tapped is exactly the shape that cost a session
  before. An `armed` boolean needed clearing each step, which is a setState inside an
  effect; elapsed time answers the question at the moment it is asked. **A synthetic click
  cannot catch a regression here** — test it by tapping within 400ms of a step appearing.
- **Copy rule: the app records a PREFERENCE, not a verdict.** The first step said "Tap the
  better film" and the user corrected it: "which is better" asserts a fact about the
  films, while the library is an account of what one person would rather watch. There is a
  test guarding it. Do not reintroduce comparative-quality language anywhere user-facing.
- **Copy rule: no em dashes in user-facing text.** The user's words: "it's clean but
  obviously AI". Tested across every step of both tours. **The rest of the app's existing
  copy still uses them freely and was NOT swept** — that is a bigger, separate edit to
  text the user has lived with, and it needs asking first.
- **`rankd-tour-v1` holds a JSON list of finished tours,** not a flag, because the two are
  reached at different moments and a boolean would have swallowed the second. A bare `"1"`
  is the original single-tour value and still reads as `["duel"]`.
- **It IS in `backup.ts`'s `KEYS`,** knowing the restore loop `removeItem`s absent keys. Restoring a pre-Session-G backup therefore offers the tour again — which is
  what happened on every backup before the line existed, so nothing regressed. It must not
  become the reason the per-format key set gets rushed: its worst case is one tutorial
  shown twice, while `rankd-lists-v1`'s is a ranking somebody cannot get back.

### Opening and returning (Session G)

- **The recap counts duels from the LOG, not from `fingerprint().duels`.** `settle`
  increments the per-film `duels` counter on BOTH sides of every duel, so summing it
  double-counts. The number the recap reports has to be the one the player watched go up
  — `RunStatus` says "24 duels this sitting" from log rows, so the recap says "last time —
  24 duels" from the same place. **`ProfileScreen`'s DUELS stat still shows the doubled
  figure** (861-film library: it read 20 against 10 real duels). Left alone deliberately —
  it is a displayed number the user has been looking at, so changing it is their call, not
  a silent fix. `Settings` already shows the true count.
- **`openVisit` is called from `AppShell`'s mount effect, never from `ProfileScreen`.**
  The marker must advance when the APP opens, once, before any duel of this sitting. On
  the profile it would look equivalent and would instead erase its own subject on arrival,
  now that the profile IS the landing screen.
- **The splash is not a loading screen and must never be built as one.** The library loads
  in under 92ms. `SPLASH_HOLD_MS` is a FLOOR — the splash leaves when the hold has elapsed
  AND the library is in hand — so its length never depends on how fast the phone is. A
  splash whose duration is a symptom rather than a decision is a bug.
  - Measured: the wordmark settles by ~360ms, the last of the five bars lands at 540ms,
    the hold ends at 620ms, the fade takes 280ms. **Anything added to the intro has to fit
    under 620ms or the mark is still arriving as it starts to leave.**
- **Landing on the profile is conditional on something being placed** (`openingScreen` in
  `AppShell`). With no locks there is no hero, therefore no COLLECTIONS row, and no recap
  either — a new user would land on empty sections instead of a playable duel. Same rule
  as `pickOpeningTier` refusing an empty tier, one level up. Derived, never stored, so
  clearing the ranking sends you back to the duel where the work is.
- **The veil fires only on arriving AT the duel, and only from elsewhere.** Going back to
  the list or the profile is returning to a page you were reading; the duel is the only
  switch that changes what the app asks of you. `key={veil}` is load-bearing — a finished
  CSS animation does not replay because the component re-rendered.

### Motion (Session F)

- **Nothing that floats may share a beat.** There were four fixed float classes, and a
  poster and its own title shared a `0s` delay while Fast Shuffle's two cards — neither
  of which is a `pick` — fell through to the *same* class and bobbed in perfect lockstep.
  Phase is now per-element, hashed from the film id (`floatPhase` in `PosterCard`), with
  the duration jittered so anything that starts together drifts apart. **Never go back to
  a shared delay.**
- **Use `Math.imul` for hashing, not `*`.** A 32-bit multiply overflows to a float and
  drops the low bits, which washed the seed out — the first attempt handed a poster and
  its title 0.336 and 0.331 and they bobbed together anyway.
- **`side` is not `pick`.** Lean belongs to the PAIR, gold belongs to the STATE. Fast
  Shuffle has no pick, so before this both cards leaned the same way.

### The duel screen's top zone (Session F)

- **This app speaks in TYPE, not graphics.** A tier map was built twice — ten rounded
  columns, then a 2px segmented hairline — and rejected both times ("chunky", "the app
  is eloquent film not Chungo bar"). The only non-type elements here are hairline
  SEPARATORS and the brand rules, and neither carries data. **Before drawing a chart in
  this app, check whether a number in an existing control would do.** It did: tier
  progress now reads `77/134` in the Jump menu, which is zero new furniture and appears
  exactly when you are choosing where to go.
- **`tierProgress` / `leastRanked` in `progress.ts` are kept and tested.** `leastRanked`
  currently has no caller — deliberate, it is the ingredient an opening/resume selector
  (#10) would want.
- **A progress bar must be able to move.** The library bars were true and useless: 204px
  of track over 861 films is a quarter-pixel per duel. If a readout cannot respond to
  the thing the user just did, it is furniture — scope it to the sitting or cut it.

### Accounts (Session E)

- **localStorage stays the source of truth; the server is a mirror.** This is the whole
  constraint. It is what keeps sync out of `ladder.ts` and off the duel path, where a
  failed request must never cost somebody a judgement they already made. `saveFilms`
  therefore stays SYNCHRONOUS — each writer calls `markDirty()` (one line, `syncState.ts`)
  and `sync.ts` notices, rather than any caller awaiting a network round trip.
- **Sync never merges, and that is not a shortfall.** Two libraries cannot be combined
  without inventing judgements nobody made: `score` and `lock` are derived from a
  particular sequence of duels, and interleaving two sequences yields an order neither
  device ever showed anyone. `reconcile.ts` asks instead. **Do not "improve" it into a
  merge.**
- **The library is one opaque blob; saved lists are rows.** A list is what someone could
  one day follow, like or comment on, and each of those needs a stable row to point at.
  The library is read by exactly one person — its owner — and never appears on a social
  read path, which is what makes the blob permanently safe.
- **The profile must leave the blob when social arrives.** `rankd-profile-v1` is inside
  the payload today, which is right while it is private — but a profile CARD is rendered
  for a viewer who must never see the library, so it cannot stay sealed in an opaque
  blob. It becomes columns on `user`, plus a small stat snapshot the client computes on
  push (`fingerprint`/`topPeople` derive from the whole library; the server can't). Not
  done now because, unlike `handle` and `visibility`, extracting it later is an additive
  migration plus one push per device — not a rewrite.
- **The file backup stays first-class.** It is the path that works with no account, no
  network and no trust in anyone else's uptime, and it is how you leave.

## Next, in order

**Renumbered again 14 Aug 2026 (Session G),** after opening-and-returning landed and left
a hole at 2. Before that, everything that was 1–7 landed — progress bars, review card,
reset, shuffle animation, badges, and Rough Cut, which absorbed the whole
lock-at-the-bottom family. Reasoning at
`C:\Users\jarra\.claude\plans\foamy-painting-hammock.md` (Parts Two–Four); the older plan
at `distributed-conjuring-oasis.md` still holds for item 3 below.

1. **Onboarding.** A new user is told nothing and infers everything. The user supplied
   reference screenshots, all of one kind: **coach marks over the live UI**, dismissible,
   with a step counter — not a carousel of pictures. First run, skippable, and
   **revisitable from Settings** (that half was asked for explicitly and is what stops it
   being a one-shot nobody can re-read). Cover the core loop first — tap to pick, flick
   up/down, hold for detail, the strip — then Rough Cut, which is now the thing a new user
   should reach for on a big tier.
   - Its "seen" flag must ride in `backupFormat.ts`'s key set, or restoring a backup
     re-runs the tutorial at someone who finished it months ago.
   - **Do this after the mechanics settle.** A tutorial written against a screen that is
     about to change gets written twice.

2. **Fast reorder and lock/unlock from the list view.** The dragging is not the hard part.
   **`ROW_H = 96` drives section spacers and tier-jump offsets, nothing may change a row's
   height, and nothing new goes inside the list scroller** — drag handles and lock toggles
   want to violate both. That constraint IS this item.
3. **Tier cards, and the `runRequest` collapse.** A tier card is a live view over
   `rankedFilms(films).slice(0,10)` — NOT a curated run, because a KotH tier run already
   writes scores and a second cross-tier order would contradict it. **This is also the
   Profile Card's "Top 10" slot** (#11), described from the other direction. Do the prop
   collapse with it: `personRun` / `personGuests` / `personPortrait` plus the genre run are
   already two effects reaching for `state.session`, and resume would make it three. They
   cannot race today because only one is ever set at a time, but that is a property nobody
   is enforcing.
4. **Profile card slots + persistence + JPG re-export.** Empty slots for Top 10, favourite
    actor, favourite director and so on, filled by making a list, persisted, viewable
    socially later, and re-exportable as the JPG. Absorbs the old #2 (profile library +
    auto-save): needs `SavedEntry` to gain `rating`/`genres`/`director` (**without `rating`
    a saved list cannot re-render its own card — an existing bug**), a `{v:2, lists}`
    payload with in-memory migration, auto-save with a floor (complete, or ≥half the pile
    confirmed), and a "YOUR RANKINGS" shelf on `ProfileScreen`.
    - **`backup.ts` trap:** its restore loop `removeItem`s any key absent from the file.
      Adding `rankd-lists-v1` to `KEYS` naively means **restoring an older backup deletes
      every saved ranking**. Needs a per-format key set. `rankd-review-dismissed-v1` is
      also missing from the manifest.
5. **Profile page redesign**, toward what the JPG export looks like. Wants #10's answer
    and #11's structures first.
6. **Upload a profile picture.** The one item genuinely blocked: `profile.ts` deliberately
    stores NO images — a banner is a film id and a still URL, so the whole profile costs a
    few hundred bytes. Real uploads need server storage, which needs the pinned accounts
    work. **An unblocked version exists now:** choose an avatar from artwork already in the
    library, exactly as `bannerStill` already works.
7. **Resume an in-progress curated run.** `lib/runs.ts` (`rankd-runs-v1`) holding subject,
    session and **`guests: Film[]` in full** — ids alone lose every unseen film.
    `adoptRun(films, session)` belongs in `ladder.ts` with its own tests. Stays device-local
    forever; it is deliberately excluded from the synced payload.
8. **#14 design pass** — `SessionEnd`, `PersonSheet`, `LogFilm`, `RunBars` ship PROVISIONAL.

## Pinned — built but not shipped

- **Accounts (Session E).** On branch `accounts`, written and tested. Needs a Neon database
  (**use the POOLED connection string**) and a Google OAuth client with redirect URIs
  `http://localhost:3000/api/auth/callback/google` and
  `https://rankd-app-eight.vercel.app/api/auth/callback/google`. Then `npm run db:migrate`
  and the four end-to-end checks. Neon recommended because the social model — lists and
  profile cards, never a whole library — puts every social read on small indexed rows and
  leaves the blob off the hot path; the connection pooler matters more than the storage
  tier once API routes run as serverless functions.
- **Known wart:** a brand-new phone hits the conflict chooser rather than a silent pull,
  because the credits sweep writes the seed library within seconds of first load and marks
  the browser dirty. Safe, and the choice reads "10 films, 0 duels" against "861 films,
  1,204 duels" — but noisier than it should be on the most common path. Fix if wanted:
  treat a library still exactly equal to `SEED_FILMS` as absent.

## Backlog — captured, not scheduled

- **A switch to turn Fast Shuffle off entirely.** The user is cooling on it and wants to opt
  out rather than have it removed for everyone.
- **Subgenre runs** — "zombie films" rather than "horror". A keyword is narrow enough to
  have a real edge, so unlike a genre it could borrow unseen films the way a director run
  does. `topPeople` in `profile.ts` already derives subgenres from `f.keywords`.

## Pinned — decide later, don't act yet

- **Fast Shuffle may not deserve to exist.** From watching real people use the app: they
  "hardly like the idea of something else shuffling their list for them." **Deferred to the
  very end deliberately** — it is a question about what the app is for, not a bug. The person
  run no longer depends on it.
- **"Finishing a run doesn't feel like anything."** Partly answered now that the cards exist
  — re-judge once they are on a phone.

## Gotchas that have already cost time

- **"Committed" is not "deployed".** Three card designs sat pushed-but-unshipped while the
  user tried to use them and got the old export. Deploy, then grep the live bundle.
- **A synthetic `.click()` does not drive `PosterCard`.** It listens for pointer events, so
  scripted tests must dispatch `pointerdown`/`pointerup`. Without that the duel looks frozen
  and you will hunt a bug that isn't there.
- **GHOST CLICKS. A browser fires a synthesised `click` ~300ms after a finger lifts, at the
  coordinates it lifted from.** Choosing a tier appeared to select it and then dismiss the
  whole setup panel: the picker closed, the panel reopened, and the delayed click landed on
  the panel's newly-mounted BACKDROP, whose handler is `close`. The logic was correct
  throughout. `Sheet` now arms its backdrop 400ms after mount. **This class of bug is
  invisible to synthetic clicks, which fire once and immediately** — every test of that flow
  passed. If a touch interaction "doesn't take", check what `elementFromPoint` returns at the
  tap position two frames later.
- **`writeScores` spreads a run across the WHOLE tier band unless `session.band` says
  otherwise.** Correct when the run is the tier; destructive when it is a slice of one. This
  silently undid Rough Cut: ranking a four-film pile re-spread it from `tierMin` to `tierMax`
  and scattered it back through the piles it had just been separated from. Any future feature
  that climbs part of a tier must set `band`.
- **The dev console retains stale errors.** A `BARS is not defined` from a hot-reload kept
  reappearing long after the header rendered correctly on screen. Confirm against rendered
  output and `tsc`, never the console.
- **A `setState` updater runs TWICE in dev.** A blind concat of borrowed films turned a
  19-film filmography into a 35-film climb against duplicates of itself. Merge by id.
- **TMDb images do NOT taint a canvas — the browser cache does.** A poster already shown via
  a plain `<img>` is cached WITHOUT CORS, and every later CORS request for that exact URL
  fails. `card/canvas.ts` adds a query parameter so the card gets its own cache entry.
- **Canvas does not trigger font loading.** An unloaded face falls back silently and the card
  ships in Times, on some machines only. Each renderer declares its own font specs; never
  hard-code one list in the loader.
- `next build` and `next dev` share `.next` — stop the preview before building.
- `ROW_H = 96` in `ListScreen.tsx` drives section spacers and tier-jump offsets. Nothing may
  change a list row's height, and nothing new goes *inside* the list scroller.
- **The CLIMBING / UN-RNKD pills straddle the bottom edge of their poster**, so a row's
  visible ink ends below its box. Anything placed underneath needs explicit clearance.
- **Reading a session must never open a database connection.** `lib/auth.ts` defers its
  `users.ts` import into the two functions that need it for exactly this reason. With a
  static import, `/api/auth/session` 500s on any deployment without `DATABASE_URL` — on a
  screen whose whole promise is that the app works without an account.
- **Verify by looking at rendered output, not stored state.** Every card defect this project
  has had — a row through the footer, a label through a name, a stat contradicting its own
  insight — passed typecheck and tests and was only visible in the exported JPEG.
- Commit messages: write to a file and use `git commit -F`. PowerShell here-strings mangle
  quotes.
- The preview pane does not composite: animations never *finish* there.
- `test/fixtures/ratings.csv` is gitignored; `import.test.ts` skips loudly without it.
- **To drive the app against the real 861 films**, parse that fixture with
  `parseLetterboxdCsv`, write the result somewhere the preview can fetch, and **delete it
  afterwards — it is the user's real ratings and `public/` deploys.**
- **The app now owns ten storage keys and `backupFormat.ts` backs up five.**
  `rankd-sitting-v1` and `rankd-visit-sitting-v1` are sessionStorage and correctly excluded.
  But `rankd-lists-v1` (saved rankings) and `rankd-review-dismissed-v1` are localStorage and
  **are not in any backup** — a restore silently loses both. Fixing it needs the per-format
  key set described in roadmap item 4, because the restore loop `removeItem`s any key absent
  from the file.
  - `rankd-visit-v1` joined them in Session G — it is written for the first time now that
    the recap exists. **Leave it out of the manifest deliberately**: it describes sittings
    on THIS device, and its worst case is one missing recap that heals itself on the next
    open. Do not let it get swept into the fix for the other two, which lose real work.
