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

`.claude/settings.local.json` allows `npx vercel --prod *`, `deploy *`, `env ls *` and
`whoami *`, added in Session I. Deliberately NOT `npx vercel *`, which would also cover
`env rm`, `blob delete-store` and `project rm`. **The permission file cannot be edited by
Claude** — self-granting is refused, correctly — so any change to that list is the user's.

**State (31 Aug 2026):** Session N, closed. Everything is committed, pushed and deployed.
Deploy verified against the live bundle, never by a 200.

**THE BRANCH IS NO LONGER `master`.** Work is on **`social-phase-1-handles`**, and that is
what is deployed — Vercel is *not* git-connected, so `git push` ships nothing on its own and
`npx vercel --prod --yes --scope rankd2` from `rankd-app/` is what makes a change live.
Head of that branch at close: `44ef500`.

**1,372 tests (2 skipped), typecheck clean, lint at 2 errors in `src`, `next build` clean.**
The two lint errors are still the `AppShell` set-state-in-effect pair described below —
unchanged baseline. Session N tripped three *new* lint rules worth knowing about, each
caught by `npx eslint src/` and none by `tsc`:

- **`Date.now()` in the render body is impure**, even inside a function only ever reached
  from a handler. Use a counter you increment instead — twice, in two files.
- **Writing a ref during render** is rejected. Assign it in an effect.
- **Hooks after an early return** are rejected, which matters here because `DuelScreen`
  and `ListScreen` both return early for empty states.

**A parallel session was working in the same tree for part of Session N** — the tier cut,
CSV export and Fast Shuffle's bidirectional re-rate are all its work, landed in `25f340c`
on the user's explicit instruction to ship everything together. It is **untested by the
session that shipped it**. See "Not verified" below.

**FOUR NEW DOCUMENTS, and one of them is the important one.**
- **`REGISTER.md`** — every open idea, complaint and piece of parked work, including the
  competitive research. **It used to live outside the repo** in a plans directory,
  unversioned, while three lesser documents sat in git. Moved in at the close of Session M.
  If you are looking for what to do next, it is there and not here.
- **`VOICE.md`** — how the app talks. Thirteen rules, derived from the user's own copy
  rather than from a style opinion. Read it before writing a user-facing string.
- **`COPY.md`** — all 506 user-facing strings, grouped by screen, with the diagnosis of why
  they read as machine-written at the top. Roughly 460 are still unreviewed.
- **`HOW-IT-WORKS.md`** — the five things the app never explains to anybody.

**THE APP IS NOW GATED BEHIND SIGN-IN.** `SignInGate.tsx`, rendered by `AppShell` before
any screen. This reverses the oldest assumption in the codebase — that the app works fully
with no account — and a lot of comments still describe the old world. **Nothing
signed-out was deleted**, deliberately: the gate is one line, and lifting it stays one
line. Read `SignInGate.tsx`'s header before arguing with it, and
"Remove the signed-out code paths" in `POTENTIAL-FEATURES.md` before deleting anything.

**476 tests, typecheck clean, `next build` clean, lint at 2 problems in `src`** — both are
`AppShell` set-state-in-effect errors. **That is the baseline. Do not "fix" them, and do
not add a third.** They read `localStorage`, which does not exist on the server, so moving
them into `useState` initialisers passes lint and silently tears hydration. The comment
above the effect says so; leave it there.

**A new library is EMPTY.** `loadFilms` used to return ten sample films, so a first open
handed you somebody else's taste and no way to tell which part was yours. `lib/seed.ts` is
gone. The only trace is `LEGACY_SEED_IDS` in `store.ts`, which exists purely so a device
still holding the old ten is not offered a conflict chooser on sign-in. **Every screen now
has a zero-film state and they are load-bearing, not defensive** — that is what a new user
sees.

**`POTENTIAL-FEATURES.md` is new, at the repo root.** Ideas thought through and
deliberately not built, each with why it is parked and what has to be true first. Put
things there rather than in this file's backlog when they are a design argument rather
than a scheduled task.

The old baseline was 3 — the extra was an unused `tier` in `Rolodex`, which turned out to
be a prop threaded through two components and read by neither. Deleted in the triage.

Test count fell from 386 to 356 because Spotlight was removed with its suites. Not a
regression; nothing that still exists lost coverage.

**Env vars, all set in Vercel and all failing loudly rather than silently when absent:**
`RESEND_API_KEY` + `SUPPORT_EMAIL` (feedback form) and the Blob store's `BLOB_STORE_ID`
(avatar uploads). See `.env.example`, which documents the Resend shared-sender catch and
the two ways Blob authenticates.

**Nothing in the tree is now written-and-wired-to-nothing.** Keep it that way.
- ~~`lib/visit.ts`~~ — wired in Session G. The recap is on the profile.
- ~~`leastRanked`~~ — deleted in `cf1444a`, briefly restored for a screen that was then
  cut, and deleted again. **This entry claimed it was in the tree for two sessions while it
  was not: check a claim like this against the code before acting on it.**

## How to get oriented in five minutes

- **Which file answers which question.**

  | Question | File |
  |---|---|
  | What is built, what broke, what must not be touched | `HANDOVER.md` — this file |
  | What to do next, and every open idea | `REGISTER.md` |
  | What is deliberately NOT built, and why | `POTENTIAL-FEATURES.md` |
  | How the app is allowed to talk | `VOICE.md` |
  | Every user-facing string, by screen | `COPY.md` |
  | What the app never explains to anyone | `HOW-IT-WORKS.md` |
  | How the ranking actually works | `lib/ladder.ts` (61 tests) |
  | How to work on this | `CLAUDE.md` |

- **The app is a ranking game.** You rate films 1–5★ on import; the game is deciding the
  ORDER within and across those ratings, by head-to-head duels. `lib/ladder.ts` is the
  engine and the most guarded module here (61 behavioural tests, immutable in and out).
- **There are two kinds of ranking, and keeping them apart is the load-bearing idea.**
  The MASTER list — King of the Hill over a tier, Rough Cut, Fast Shuffle — writes `score`
  and `lock` and is the app's real opinion of your library. CURATED lists — a director, an
  actor, a genre, reached through the **Curator** — write *nothing at all* and exist to be
  looked at and shared. Every decision below follows from that split.
  (Spotlight was a fourth master mode until Session I removed it.)
- **The user's real 861-film library is at `rankd-app/test/fixtures/ratings.csv`** and is
  gitignored. `import.test.ts` runs against it. Use it: bugs that only appear at 861 films
  (see the sweep's batching) do not appear at the 10-film seed.
- **Read `CLAUDE.md`.** Form a theory, get evidence, then fix. This project has repeatedly
  punished guess-and-patch — see the gotchas at the bottom, most of which are cases where
  something *looked* fixed and was not.
- **Comments here are dense on purpose, and that is not licence to write history.**
  `roughCut.ts` is 56% comment and `ladder.ts` 31%; this handover leans on those headers by
  name. Keep writing the WHY — the traps, the invariants, the reason a thing must not be
  changed back. **Do not write the changelog**: rejected versions, quoted feedback and
  "v1 did X, v2 did Y" belong in git and in this file, not in three source files as well.
  A comment pass in Session G removed exactly that and left the reasoning intact.
- **Two copy rules, both the user's, both tested.** The app records a PREFERENCE, never a
  verdict — "which you'd rather watch", not "which is better". And **no em dashes in
  user-facing text**; the user's words were "it's clean but obviously AI". The rest of the
  app's older copy still uses them and was deliberately NOT swept — that is a separate edit
  to text the user has lived with, and it needs asking first.

---

## Landed

**Session N — the climb learns to read its own evidence, and the app starts having an
opinion.** Eight commits, `3d70b3f` → `44ef500`, all deployed and each verified against the
live bundle. The theme, if there is one: **the app already knew far more than it said.**
Every feature below is a read of data that was being written and thrown away.

### The big one: the climb stops asking twice

King of the Hill cost **exactly `n(n-1)/2` duels**, provably, independent of the answers —
`refresh` always aims at the film directly above, and every settle drops the climbing
film's index by one. A 185-film tier is **17,020 comparisons**; `roughCut.ts` said "several
thousand" and undersold it threefold. Meanwhile every duel ever answered was in the
evidence log and `ladder.ts` never read one back.

`src/lib/relations.ts` (new) is the deductive half of that log: a bitset transitive closure
that answers "have you already decided this?" and refuses whenever the honest answer is
anything short of yes — a contradiction, a cycle, or a pair judged both ways. Measured in
`test/climbCost.test.ts` (opt-in, `COST=1`):

| n | seed | before | after |
|---|---|---|---|
| 200 | already sorted | 19,900 | **199** |
| 200 | Rough Cut seeded | 19,900 | **3,390** |
| 200 | unseeded | 19,900 | **9,798** |

Asserted across every size and seed: **the finished order is identical with the oracle on
and off.** That is the hard stop and it holds.

### And then it was wrong, and had to be rebuilt

The first version resolved every known duel in **one atomic engine call before the screen
rendered**. Correct, fast, and the wrong shape: the pile leapt several places between taps
with nothing to watch. Reported as *"I am jumping places without knowing why or what it's
jumping."*

`advance()` was deleted and replaced with `peekKnown` + `replayStep` — one step at a time,
so the screen can **play each remembered duel back**: blue rings, "YOU PICKED THIS IN NOV
23", the normal poster animation, and a tap stops it dead. Pacing is measured, not guessed:
half of all replay streaks are a single duel, but p95 is 28 and the longest seen is 69, so
it accelerates through a long carry. `Prefs.replay` offers watch / quick / silent.

**Lesson worth keeping:** the numbers said the feature was a success and the user said it
was a failure, and they were both right. Optimising for "fewest duels" was the wrong
objective; it is "least tedium *while still following what is happening*".

### Everything else

- **Clusters** — gather films in the strip and carry them up as one block. A user
  assertion, so only the block's face is journalled.
- **Placement by hand** — `confirmLast` (the pile now fills from **both ends** via
  `confirmedTail`), `placeAt`, `settledPrefix`/`confirmPrefix`, `reopenConfirmed`.
- **`src/lib/stage.ts`** — the home screen stopped asking "which of four games?" and now
  says what to do next. Derived, never stored, from `libraryProgress` which had been built,
  tested and rendered **nowhere**.
- **`src/lib/uncertain.ts`** — "8 close calls waiting": adjacent pairs in your ranking the
  record does not settle. The suggested climb runs over just those films.
- **A live data-corruption bug on the list.** A hold armed during a scroll, and `dropAt`
  writes judgements, **changes the film's star rating**, and re-spreads bands — with no undo
  on that screen. Fixed by cancelling the hold on any scroll, plus a move confirmation with
  Undo.
- **Grid view** on the list, and the strip now **opens by default**.

**Session M — the competition, the voice, the profile, and a lockup that took four tries.**
Everything below is deployed. The open ideas are in `REGISTER.md`, not here.

**It began with research, not code.** ~25 apps the user had found. Nine are genuinely in
this lane, and the finding that shaped the rest of the session is that **the mechanic is
commoditised and nobody has won**: 134 App Store ratings is the ceiling of the entire new
wave. Rankd's moat is the big-library problem — Rough Cut, tier bands — which no
competitor has hit, and which was invisible on Rankd's own surface. Letterboxd has still
not shipped ranking. Full write-up in `REGISTER.md` sections D and K.

**The voice.** The user: "everything feels like it's written by AI." The obvious tells were
absent — no marketing adjectives, no "not just X but Y". The problem was **uniformity**, and
under it one thing: every string was EXPLAINING and none was RECOGNISING. Flickchart's front
page beats Rankd's whole app with one sentence because it hands the reader a question they
already ask themselves. The headline is now "Everyone has a favourite. What's yours?"

- **Every em dash in user-facing copy is gone.** Eight of them, against a rule that already
  existed and had drifted. `test/tour.test.ts` guarded the tours; nothing guarded the rest.
- Contractions throughout. Developer-facing errors (`TMDB_API_KEY`, `DATABASE_URL`) are
  deliberately exempt, and so is the tour title "UN-RNKD is not unrated", where the emphasis
  is the whole point.
- **Two factual errors in copy, both long-standing.** The list tour said the rank number was
  on the LEFT; it renders last in the row. The duel tour claimed Rough Cut is "100 taps,
  about two minutes"; Split again means more than one pass and 100 decisions is not two
  minutes. Both had survived every review because nobody checked a claim against the screen.
  Rules 3 and 4 in `VOICE.md` exist because of them.

**The taste chart, and the trap under it.** Built from SETTLED POSITIONS, never win rates:
the duel log is not a sample of taste, it is a record of what the matchmaker asked. It draws
your order and Rankd's over the same films, with a before/after from the sitting's start.
- **Cross-tier belief means are not calibrated and must never be printed as a position.**
  `PRIOR_SPREAD` is wide enough that a much-duelled film out-means a whole tier above it,
  while `shuffle.ts` never lets a band be escaped. Shipped for one afternoon on the film
  card and printed a 1.5★ film at #391. Any surface comparing the model's answer with the
  user's meets this.

**The film card says who placed a film.** Gold padlock and a number for a hard lock,
"Rankd placed it at #42" for a soft one, and "Rankd says #38" beside your own number.
That distinction lived in a `title` attribute — **a hover tooltip, on a phone.**

**The profile was rebuilt.** Two swipeable panels, **Your taste** and **Your results** —
data versus what you chose. Boxes became hairlines almost everywhere. Percentage stats
became named observations, because a percentage names nothing and there is nothing to
argue with. A genre ring with every genre reachable, a passport of countries, three
directors and four actors as rows.

**And the lockup.** Fast Shuffle froze the whole HANDSET after a couple of hundred duels.
Three theories died first — the engine measures flat at 0.6ms per duel over 300, and a DOM
count of 121 during a freeze killed the leak theory. The cause was `backfillPosters`
skipping its yield on a cache hit while reporting a "find" for every film that already had
its artwork: hundreds of half-megabyte `localStorage` writes, back to back, nothing
yielding. See the gotchas.

**Not done, deliberately:** the world map. Real public-domain geometry exists and was
fetched to confirm it (Natural Earth via `world-atlas`, 107KB of TopoJSON); it needs an arc
decoder, a projection and a build step. `Passport` already computes what it would draw.
`REGISTER.md` P1.


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

**Session E (branch `accounts`, MERGED in Session H) — Google sign-in and a server mirror.**
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

**Session G — the opening.** Roadmap #2 in full (recap, splash, profile as the landing
screen), then roadmap #1 (onboarding coach marks, one pass per screen), then two bugs from
real use: a Rough Cut was invisible in the list, and the app opened inside a game nobody
had chosen. Read the decision blocks below.

**Session I — Spotlight removed, and six things around it.**
The user's call: "I think that spotlight should be removed. Completely. I've never used it
and seen a user use it. It's clutter." Everything below followed from working out what was
actually attached to it.

Landed: **Spotlight gone** from `ladder.ts`, `DuelScreen`, `types.ts`, `runs.ts` and the
tests · **the review card gone with it** · **tier promotion rebuilt on King of the Hill** ·
Done always visible and landing on the empty screen · a PWA manifest and icons · an in-app
feedback form · avatar uploads with a **cropper** · Rough Cut's first motion pass · the
profile restructured into zones · sheets **hinged to the nav and toggled by it** · a dead
code triage · **four bugs found by using it** (below).

`SpotlightPicker` became `FilmPicker` — the profile always used it as a generic film
picker, so the component outlived the mode it was named after.

**The triage, at the end of the session.** Every export was walked and asked who
references it. Eleven functions had no caller anywhere (`forgetBeliefs`, `jumpToTop`,
`isRanked`, `pickFilm`, `favouriteFilms`, `resetFilms`, `resetStartupSync`, `hasPortrait`,
`syncEnabled`, `stopSync`, `clampScore`), as did two `Profile` fields (`avatarFilmId`,
which predates `avatarUrl`; `favouriteIds`, read only by `favouriteFilms`), a `tier` prop
threaded through two components and read by neither, and four CSS blocks. All gone.
- **`stopSync` is the one worth understanding.** It was `startSync`'s symmetric teardown
  and nothing called it. Signing out submits a form to Auth.js — a full navigation — so
  the document and every listener go with it. **There is deliberately no teardown now**;
  the comment in `sync.ts` says why, so nobody re-adds one.
- **Comments were trimmed to the WHY.** This session had been breaking the rule below by
  narrating at length what code used to do. Those headers are cut to the trap and the
  invariant. The older "don't change this back" notes are guardrails and were LEFT.

**Session J (`890d3f0` … `54885b5`) — onboarding, Rough Cut, and three data bugs.**
Two rounds of feedback from real use. Everything deployed.

Landed, roughly in the order it was found:

- **Rough Cut: the third pile disappeared** after ranking two of three. `bandsOf` skipped
  hard locks, so a ranked pile read as an empty band and the "already split" test then saw
  a tier that was never cut. **Reproduced with a failing test before the fix.**
- **Rough Cut resumes.** Placements were always kept — the scores ARE the piles — but the
  queue position was not, so you were asked to redo what you had already filed.
  `lib/roughCutRun.ts`, ids only, refuses rather than repairs.
- **Rough Cut got a tour, hold-to-open, a countdown, pile counts, Skip, and first place in
  the mode list.** It had no tutorial at all and the duel tour could never have fired on it
  (gated on a session it deliberately lacks). **Skip defers rather than discards** — sends
  the film to the back so the tier can reveal itself first.
- **Wrong posters.** `/api/film` took `results[0]` blind, so a title TMDb does not hold
  returned whatever popular film shared a word. `lib/tmdbMatch.ts` scores candidates on
  title with the year as tie-breaker and returns nothing when the best is weak. The year is
  **no longer sent to TMDb**, where it is a hard filter that emptied legitimate searches.
- **And people can now fix one by hand.** "Wrong film?" on the info card. Two halves and
  broken without either: the correction REPLACES rather than fills gaps, and `pinnedMeta`
  takes the film out of every fetch queue for good — without it the sweep re-asks by title
  next pass and the fix evaporates.
- **Import takes the `.zip` whole** (`lib/zip.ts`, no dependency —
  `DecompressionStream("deflate-raw")`). Extracting `ratings.csv` on a phone was the step
  people abandon. Plus a four-step guide on the empty screen and beside the control.
- **Sync stopped re-uploading an unchanged library.** 468KB went up whenever the dirty flag
  was set, and many writes are re-writes. Content-hashed now.
- **The avatar updates immediately.** The blob key is fixed and overwritten, so every
  upload returned an identical URL and the device served its own cached copy. The URL
  carries a version.
- **`h-dvh` → `.h-app` (svh).** Every `main` clips its overflow and pins the nav at its
  foot, so an over-estimated height pushes the bar off screen.
- Profile: picture centred and overlapping the banner by a third; **cards and badges
  surfaced** (a "Card" chip on shelf tiles, earned badges as their own TROPHY CASE row).
- Fast Shuffle got the countdown too; float travel nearly doubled (9px over 6.5s was
  invisible).
- **"Delete everything and start fresh"** in Settings → Start again (`wipeEverything` in
  `reset.ts`). Every other reset keeps your library, which is right for fixing a ranking
  and useless for seeing the app as a new user does. Clears all `rankd-` keys plus the
  per-tab sitting, then reloads.
- **The empty screen's import is a real file picker.** It opened Settings, where every row
  is collapsed — so the one button on a new user's only screen led to a list of shut rows
  with no import control in sight. `filmsFromFile` in `importCsv.ts` is now shared by both
  controls; the zip handling must never be on only one of them. Settings also opens on the
  library row when the library is empty.

**Session K — the wipe that undid itself, and four layering bugs.**
Seven user reports, four root causes. Plan at
`C:\Users\jarra\.claude\plans\okay-good-now-linked-hanrahan.md`.

- **"Delete everything" now reaches the ACCOUNT.** It cleared this browser and left the
  server row, so the reload looked to `reconcile.ts` exactly like a new phone — no local
  library, no `lastSeenServerAt` — and it pulled the whole thing back, then reloaded a
  second time. `/api/library` gained `DELETE`; `/api/lists` gained `?all=1` (a separate
  spelling from the per-id path on purpose: an empty id list must stay an error, not
  silently mean everything). `wipeAccount()` runs FIRST and **the local wipe does not
  happen if it fails** — a browser emptied while the mirror survives is precisely the state
  that restores itself. 401 counts as success: signed out means there is nothing to delete.
- **Background writes were refilling storage during the reload.** `location.reload()` does
  not stop the page. The credits sweep's `.finally(flush)` and the duel screen's poster
  backfill both resolve afterwards holding the PRE-wipe library and write it back through
  `saveFilms`; the sweep's own stop flag is set by an effect cleanup a reload never runs.
  **This one bit signed-OUT users too.** `lib/wiped.ts` is a one-way flag checked by
  `saveFilms`, `markDirty`, `push` and `pull`. It is its own four-line module because
  `syncState.ts` imports nothing — read by the four modules that write, anything it
  imported back would be a cycle. Do not move the flag into `reset.ts`.
- **One overlay at a time.** `AppShell` had five independent booleans and nothing stopped
  them all being true; two call sites had grown ad-hoc pairwise closes to patch the worst
  pair. Now a single `Overlay` union — `info | person | settings | trophies | log` — so
  replacing is the only thing the slot can do. **`go()` empties it**, which is what makes a
  bottom-bar press close the sheet over it (it changed `screen` and nothing else, and
  overlays render outside the screen branch, so Settings simply re-parented itself over
  wherever you had navigated to). `CollectionSheet` now closes itself before delegating to
  `onInfo`; a screen handing off to the shell was where the rule was still being broken.
  DuelScreen's setup states were already exclusive by hand and were left alone.
- **The Log drawer was rendered INSIDE `<nav>`.** The nav is `relative z-40`, which is a
  stacking context, so its `z-30` sheet was ordered *within* the nav and painted over the
  bar — the only mis-layered overlay in the app. Its state moved to `AppShell` with the
  rest; `BottomNav` keeps `logging` and `onToggleLog`. **Nothing renders inside that nav
  now, and nothing should.** Bonus: it survives a tab press long enough to animate out,
  which it could not when a screen change unmounted the nav under it.
- **`--nav-h` is a POSITION now, not a height.** It was `offsetHeight`, which assumes the
  bar's bottom edge is the bottom of the screen. `main` is `100svh` and the nav is pinned
  at its foot, but a sheet is `position: fixed` and measures the REAL viewport — so with
  the URL bar retracted the two disagreed by exactly the slack `svh` was erring by, and
  that slack was the gap under every drawer. Now `visualViewport.height + offsetTop -
  nav.getBoundingClientRect().top`, republished on `visualViewport` resize/scroll as well
  as the `ResizeObserver`. In a fullscreen PWA it is still `offsetHeight`.
- **The seam at the bottom of the screen** is the same cause seen from the other side: the
  shortfall below `main` was painted by `body` (`--bg` navy) against a nav painted
  `--header-bg` black. `body::after` fills everything below `100svh` with the bar's colour
  at `z-index: -1`. **Do not give it a positive z-index** — `main` is `relative` with no
  z-index, which is enough to sit over this and not enough to make a stacking context, and
  the nav's `z-40` beating the sheet scrim depends on that.
- **`.h-app` was NOT touched**, and must not be. See its comment in `globals.css`.
- **The tutorial replaying after a wipe needed no code.** `rankd-tour-v1` was already
  removed by the wipe and is correctly absent from `SYNC_KEYS`; what came back was the
  LIBRARY, and tours only fire on a library with nothing placed. Verified live: wiped key
  plus unplaced films fires the list coach mark.
**Session K, part two — item 3: tier cards and the `runRequest` collapse.**

- **The app's own answer was write-only.** Every duel feeds the master order, and the only
  way to LOOK at that order as a shareable thing was to finish a King of the Hill run and
  catch the card on the summary before dismissing it. Miss it and your top ten existed
  nowhere you could point at. `lib/card/live.ts` projects `rankedFilms` into `liveViews` —
  the overall Top 10 plus one per tier — and the profile shows them in a
  **STRAIGHT FROM YOUR LIST** shelf ABOVE the saved one, because they are the thing the
  app is building and a saved ranking is a side quest off it. `LiveCardSheet` reads one
  back and offers the three designs.
- **`RankSubject` gained `{ kind: "overall" }`**, and `isLiveSubject` is now the single
  place the rule lives: a live subject may be DRAWN and may never be saved, resumed or
  pushed. Saving one would freeze a copy at today, and the next duel would leave it
  asserting a top ten that is no longer yours while looking exactly like one that is.
  `poolForSubject` returns nothing for both live kinds, so no run can start over one — a
  tier run already writes scores, and a second cross-tier order would contradict it.
  That switch is exhaustive on purpose: a new kind must fail the build there.
- **`runRequest` replaced three props and a fourth code path.** `personRun` /
  `personGuests` / `personPortrait` were separate, set together, cleared together, and
  kept consistent by nothing; genre runs bypassed all three and started themselves. The
  handover flagged that "only one is ever set" was true only because nothing had yet set
  two, and that resume would make it three. Now one object, one pool selector
  (`poolForSubject`), one pile builder (`pileFor`, which owns the merge-by-id that a blind
  concat once turned into a 19-film climb against 35 duplicates), and one start.
  **Two pending requests are unrepresentable rather than merely unlikely.**
- Verified live end to end: genre run and person run both start, carry their subject to
  the summary, draw their card, and leave `score`, `duels` and the evidence log untouched
  with no guest leaked into the library.

**Session K, part three — the front door, and a reversal.**

- **The app is gated behind sign-in.** The user's call, against my initial recommendation,
  and they were right on the decisive point: the friction is smaller than it looks because
  the step immediately after it is exporting a CSV out of Letterboxd. Anyone who will do
  that will not be stopped by a Google button. The real argument for it is that an
  anonymous library lived in exactly ONE browser — clear it, lose the phone, switch
  devices, and an 861-film ranking was gone with no recovery and nothing the app could say
  afterwards.
- **The trap, and it is the important part of this entry.** `fetchAccount` answered `null`
  for both "signed out" and "could not ask". Harmless while it only decided whether to
  draw an avatar; **catastrophic as a gate** — it would wall a signed-in reader off from
  their own library the moment they lost signal, which is precisely the failure the
  local-first design exists to prevent, aimed at the people most invested in the app.
  `fetchSession` now returns `in` / `out` / `unknown`, a 5xx counts as `unknown` because a
  server failing to answer is not a claim about the reader, and `unknown` falls back to
  `rankd-signed-in-v1`. **A definite `out` clears that flag**, so a browser signed out
  elsewhere cannot let itself back in by going offline. Verified live by forging the flag
  against a real session: the server's no wins and the flag is wiped.
- The flag is **not a credential** and must never be treated as one. Every route re-checks
  the real session server-side (`requireUser`); the worst a forged flag buys is a look at
  a library already sitting on the device that forged it. It is in neither backup set.
- **Nothing signed-out was deleted.** The user asked for the removal to be written down as
  a job with conditions rather than done. It is, in `POTENTIAL-FEATURES.md`, with the
  recommendation to wait until an account buys something beyond sync — and with the note
  that two of the four items should probably survive regardless, because making sign-in
  mandatory makes the offline problem worse, not better.

**Session L, part two — Rough Cut gets a range, and two bugs that came with it.**

- **Rough Cut was the one mode locked to a single tier.** The climb and Fast Shuffle both
  had a range; Rough Cut did not, which made it useless for the case it is best at — two
  thin neighbouring tiers that together are worth one pass. Same `RangeSlider`.
- **`applyRoughCut` had to change first, and this is the part worth reading.** It took ONE
  tier's band bounds (`tierMin(tier)`/`tierMax(tier)`) and scored every film against them.
  Correct while a pass could only cover one tier; **silently re-rating the moment it
  cannot**, because a score inside a band IS the star rating to everything downstream — a
  3★ film sorted during a 4★-anchored pass would have been written a 4★ score. It now
  bands each film by its OWN rating, grouped by (rating, bucket). A single-tier pass is
  byte-identical, which is what the existing tests prove.
- **Rough Cut had no artwork fetch of its own.** The duel screen's backfill is gated on
  `state.session`, and Rough Cut deliberately has none — no pile, no climb, no confirm. So
  it was the only mode left waiting on the credits sweep, which walks the whole library at
  one film per 400ms. On an unswept library that is a placeholder on every card, on the
  screen most exposed to it: one film at a time, and you are asked to judge it. The range
  made it visible rather than causing it. It now runs the same fetch, in view order,
  scoped to the pass's pool.
- **And that fix was still only half of it.** The posters were arriving and landing in
  `state.films` — but `RoughCut` captures its pool once when the pass starts and drew the
  card straight out of that snapshot, so **every card kept the placeholder it was born
  with** however many posters turned up behind it. The queue still decides which film and
  in what order; the card is now looked up in the live library by id. **Two symptoms, two
  causes, and fixing the first one alone looked like the fix had failed** — a pattern this
  file has now recorded three times.

**Session L — sync was barely running, and the chooser was answering the wrong question.**
Plan at `C:\Users\jarra\.claude\plans\okay-good-now-linked-hanrahan.md`.

- **THE BIG ONE: no background push was happening at all.** `startSync` is the only thing
  that sets `enabled`, and `push`/`schedule` both return early without it. `startSync` was
  called from exactly two places, both in `Account.tsx` — which mounts only when the
  settings sheet is opened. **So on any session where the reader never opened Settings,
  nothing was ever pushed**: no debounce, no flush on backgrounding. An evening of duels
  sat in localStorage until the next app open. That is a durability hole on an app that
  now gates behind sign-in *precisely* so a ranking is safe, and it is why the conflict
  chooser was routine rather than rare — a browser holding a session of unsent work will
  of course disagree with the account. `AppShell` now starts the watcher off
  `syncOnOpen`'s outcome, **never on `conflict` or `offline`**; that guard is the one
  `Account.tsx` documents as having already cost a real library.
- **A failed push had no retry.** Both failure paths said "retried on the next tick" and
  there was no next tick: `schedule` is armed from `notify`, and `markDirty` only notifies
  on the clean→dirty TRANSITION, so an already-dirty browser generates no further
  notifications however many more duels are fought. One bad request stranded the session.
  Bounded backoff now, 10s → 30s → 2m → 10m.
- **The chooser now MERGES rather than asking.** `reconcile.ts`'s founding claim — two
  libraries cannot be combined "without inventing judgements the user never made" — is
  correct about the DERIVED state and wrong about the EVIDENCE. Every row in a union of
  two logs is a duel somebody really fought, and `fitBeliefs` maximises a strictly concave
  posterior, so it has one maximum and the merged answer does not depend on how the two
  histories interleave. `mergeLibrary.ts` unions the evidence and the authored fields
  (`rating`, `pinnedMeta`, hard locks), discards everything derived, and re-derives it from
  the union. **A hard lock from either side survives** — a confirm is a commitment.
- **Tombstones, because undo exists.** `retractJudgements` removes a row locally; the other
  device still holds it, and a naive union hands the mis-tap straight back. The log's
  stored shape gained an optional `x: string[]`, so a retraction survives the round trip.
  Optional, so `v` did not change and older readers decode these files unchanged.
- **Judgement ids are device-scoped now.** They were `time + a counter that resets every
  page load`, so two devices whose first duel landed in the same millisecond minted
  identical ids — and a union-by-id would have silently dropped one of two real
  judgements. Four characters off `deviceId()`.
- **`canMerge` refuses exactly one case**: an empty log on one side only. That is the
  signature of "Clear my ranking", which throws the log away *on purpose* so the model
  cannot re-place everything from the same duels. Merging would undo the reset. That is
  the one question left worth asking, and the chooser stays for it.
- **The prefs in `SYNC_KEYS` now mark dirty.** `rankd-prefs-v1`, `rankd-brightness` and
  `rankd-strip-open` were synced but never marked, so they reached the account only as
  passengers — which is what produced the brightness false-conflict in Session K.
- **`PUT /api/lists` is authoritative.** It was an upsert, so a deleted list arrived as an
  absence and an absence meant nothing: the row survived and the next pull handed it back.
  It now deletes what it was not sent. **Only safe because the client always sends the
  complete shelf** — if an incremental push is ever added, this must change with it.
- **`deviceId()` touched `localStorage` unguarded** — a real bug with no caller until
  judgement ids started using it, at which point 53 tests went red at once.
- **NOT done, deliberately, against the plan:** logging confirm and promotion events. The
  plan wanted them so a merged log could rebuild hard locks from evidence alone. Building
  the merge showed they buy nothing here — hard locks are unioned straight from the two
  film records, which is simpler and works retroactively. Adding them would have been a log
  format change for a capability nothing uses. Revisit only if a full rebuild-from-log-alone
  is ever needed.

**Session K, part four — two bugs the phone found that the desktop could not.**

- **The chooser asked which of two IDENTICAL libraries to destroy, and it took THREE
  goes to actually kill.** Screenshotted twice by the user: "864 films, 949 duels" against
  "864 films, 949 duels". Worth reading in full, because each fix was correct and none of
  the first two was sufficient — a good example of stopping at the first true cause.
  - **Cause 1, the trigger.** `reconcile` is pure and sees three booleans — has a library,
    is dirty, has the server moved — and **all three are true on an ordinary single
    device**, because the credits sweep marks the browser dirty every few minutes whether
    or not anything changed and any push moves the stamp past `lastSeenServerAt`. So it
    correctly returned `conflict` for a disagreement that did not exist.
  - **Cause 2, why comparing payloads was not enough.** The first fix compared the two
    sides on `contentHash` over all of `SYNC_KEYS` — which carries **brightness, the strip
    state and display prefs** alongside the work. Nudging the brightness slider therefore
    made the payloads genuinely differ while films and duels, the only numbers the chooser
    prints, stayed identical. **A preference is not a library.** The question is now asked
    about `WORK_KEYS` alone (`rankd-app-v1`, `rankd-log-v1`) — the things that cannot be
    merged without inventing duels nobody fought. Everything else is a setting and either
    side's value will do.
  - **Cause 3, and the nastiest.** `push()` returned early unless `enabled`, and `enabled`
    is only set by `startSync`, which runs when the **Account panel mounts**.
    Reconciliation happens at **boot**. So every push `reconcileWithAccount` decided —
    including the long-standing `case "push"` — landed on a closed gate and returned
    silently, while the outcome still reported `"pushed"`. Nothing looked wrong; the
    browser simply stayed dirty and reconciled to the same answer on every open, forever.
    Decided pushes now pass `force`; the background watcher deliberately does not, because
    it must stay off until somebody has agreed there is nothing to argue about.
  - **The chooser also replaced the entire panel**, so while it was up there was no email,
    no "Back up now", and **no way to sign out** — the user was stuck behind a question
    they did not want to answer. It is a banner above the account block now, and every
    control underneath stays reachable.
  - **Why it hid so well:** answering it either way was a no-op, because the two sides
    held the same work. The bug had no consequence except the question, so nothing was
    ever corrupted to point at it. `test/falseConflict.test.ts` pins all of it, including
    that the browser must end CLEAN — asserting the outcome string alone would have passed
    against cause 3.
- **`Account` also reconciled on every mount**, and it mounts whenever the settings sheet
  opens — so the app asked at boot and asked again on each open, against a browser the
  sweep had since marked dirty. `syncOnOpen` caches its promise now and `Account` reads
  that: one question per page load, one answer, shared.
- **`--nav-h` was measured against the wrong viewport.** It is consumed as a `bottom` on
  `position: fixed` elements, whose containing block is the LAYOUT viewport
  (`document.documentElement.clientHeight`). It was measured against
  `visualViewport.height`, which shrinks by the height of the URL bar when chrome is on
  screen and agrees with the layout viewport only when chrome is hidden. **So it was right
  on every desktop and on a phone mid-scroll, and wrong the rest of the time** — the worst
  available failure mode, and why the Settings sheet still showed a gap after the others
  looked fixed. `visualViewport` is still listened to; it is the signal that chrome moved,
  not the thing to measure.
- **Measuring lesson, for the browser tools:** a Browser-pane tab that is not FRONTED does
  not advance CSS animations. A sheet measured in a background tab reads as stuck at
  `translateY(100%)` with `animationPlayState: running`, which looks exactly like a real
  layout bug. `tabs_select` first, then measure.

- **localStorage stays.** The user asked whether to remove it. Local-first with a server
  mirror is standard for an offline-capable PWA and is the only reason the signed-out app
  works at all. `backupFormat.ts` gained the **index of all 14 keys** and who owns each,
  since there is no single `KEYS` constant. `rankd-review-dismissed-v1` is dead but stays
  listed, and its existing comment already says why — ownership is what gives a restore
  permission to clear it, so dropping it strands the value on old devices forever.
  The stale `rankd-synced-at` reference is now `rankd-sync-v1`.

**A tutorial sandbox was built and then deleted in the same session.** It ran the real
screens over sample films with every write guarded. The user's call, and the right one:
import-first dissolves the problem it solved, and the perimeter — a flag, five guarded
write paths, a scratch React state — only ever served playing with films nobody owns.
**Do not rebuild it.** Four tours now fire where they live (list, KotH, Rough Cut, logging
a film) and Settings' "Refresh me" makes every screen new again.

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

### Saved rankings are readable at last (Session G)

`saveList` had written `rankd-lists-v1` since the share cards landed and **`loadLists` and
`hydrate` had no callers anywhere**: you could make a ranking, save it, and never see it
again. The user found this, not a test.

- **`SavedEntry` carries `rating`, `genres` and `director` now.** Without `rating`,
  `statsFor` and `pickInsight` have nothing to work from and a saved list **cannot redraw
  its own card** — which is exactly why re-export was never possible.
- **Storage is `{v:2, lists}`, migrated in memory from the bare v1 array** and rewritten on
  the next save. A v1 entry has no rating until its film is found in the library.
- **`filmsOf` never invents a rating.** A v1 entry whose film has ALSO left the library
  cannot be reconstructed, so it is dropped from the card and the count is shown to the
  user rather than the card quietly coming up short.
- **Pinned rankings are ids on the profile, capped at `MAX_PINNED` = 3.** A pin naming a
  deleted list simply matches nothing when rendering, so `deleteList` never has to tidy up.

### backup.ts owns keys PER FORMAT now (Session G)

The restore loop clears any key it owns that the file does not carry, which is right — a
restore replaces state wholesale. It turns destructive the moment a key is added, because a
backup written earlier cannot mention it and its absence reads as "delete this".

**`rankd-lists-v1` was in no backup at all, so a restore would have destroyed every saved
ranking.** Ownership is now recorded per format: a restore clears only what its OWN format
knew about, and anything introduced later is left alone. Format 2 adds `rankd-lists-v1`,
`rankd-tour-v1` and `rankd-review-dismissed-v1`; format 1 files still restore.

**`test/backup.test.ts` is new and guards the destructive case directly.** `backup.ts` had
no tests before. `rankd-run-v1` is deliberately excluded: a backup carries what you
decided, and an unfinished climb is what you had not decided yet.

### Accounts, and the two ways sync nearly destroyed a library (Session H)

Sign-in, push, pull and the conflict chooser are live and verified against production. Neon
is in Sydney on the **pooled** endpoint (`-pooler` in the host); the direct endpoint runs
out of connections once serverless functions scale.

**Both of the following were found by RUNNING it, not by reading it. Neither has a unit
test that would have caught it, because both are about ordering rather than logic.**

- **`startSync()` ran before reconciliation, and destroyed the thing the chooser was
  asking about.** It is not passive: it watches for local changes and pushes them on a
  debounce. A browser cleared to stand in for a second device seeded its ten starter films,
  the credits sweep marked it dirty, and the debounced push replaced 861 films on the
  server with 10 — while the chooser was still on screen offering the choice. Pressing
  "keep the account" then pulled the wrong library, because a race had already settled it.
  **Reconcile first; start the watcher only when there is nothing left to argue about.**
  An `offline` result starts nothing either: pushing at a server you could not read is how
  you overwrite a copy you never saw.
- **"Has a local library" was `getItem(...) !== null`, which is always true.** A fresh
  install shows the seed immediately and the sweep writes it within seconds, so a new phone
  counted as holding a real library and was offered "10 films" against "861 films" — a
  frightening question with an obvious answer, asked on the one device with nothing to
  lose. `isUntouchedSeed` in `store.ts` answers it honestly: ids still exactly the seed's,
  nothing placed, nothing duelled. **A library stops being disposable the moment any
  judgement lands on it.**

**`SYNC_KEYS` and `FILE_KEYS` are different sets and must stay that way.** The file backup
carries saved rankings; the wire must not, because those sync as their own rows (a list is
the thing another person could one day follow, so it needs a stable row rather than being
sealed in an opaque blob). `applyBackup` CLEARS any key in the set it is handed that the
payload lacks — so one shared set would mean **every pull deleting every saved ranking**.
Both `collectBackup` and `applyBackup` take the set explicitly rather than defaulting.

**`startupSync.ts` reconciles once per page load** so a signed-in visitor's library follows
them without opening settings. It acts only on the unambiguous outcomes and deliberately
does NOT start the sync watcher — opening the app should be able to fetch your library
without volunteering to overwrite it. A conflict is left for the chooser in settings,
because a question that destroys one of two libraries belongs on a screen somebody opened
on purpose.

**Testing sync costs libraries.** The 861-film library was recovered from a snapshot taken
minutes earlier, twice over. Snapshot before touching these paths, every time.

### A goals screen was built and deleted. Do not rebuild it (Session G)

`lib/goals.ts` derived a generated to-do list — every tier, plus personal ones (favourite
director, best genre) — with completion read off saved lists. It worked, had 17 tests, and
was **cut**, because the premise was wrong rather than the execution.

Kept here because the idea will occur to somebody again, and because two of its findings
survive the deletion:

- **The Rough Cut suggestion cannot be a sentence.** As a note under each row it repeated
  on seven of ten tiers and became wallpaper.
- **"Has this tier been cut" must be a SHARE, not a presence.** Testing `bands.top.length >
  0` meant nine dealt films out of 185 counted as cut, so the app stopped suggesting the
  very thing the user had started — while every untouched tier shouted it.
- **A curated goal has to be finishable.** Uncapped, "your best Horror" proposed ranking 320
  films by hand: the quadratic problem Rough Cut exists to avoid, wearing a hat.

Why it was cut: the user's actual complaint was never "which tier?" but *"I dont like just
going to the tab and seeing an inprogress game without a prompt or reminder of where I am"*.
Four separate screens were built to answer that and all four were rejected. The answer was a
LAYER over the game, not a page in front of it. See below.

### The RNK entry is an OVERLAY, not a screen (Session G)

Four screens were built for this and all four were rejected. The premise was wrong, not
the layouts. The user diagnosed it: *"I dont like just going to the tab and seeing an
inprogress game without a prompt or reminder of where I am and what I was doing... maybe
thats okay if a frosted transparent overlay sits over the top asking to continue or select
something else."*

- **The game in progress was never yours.** Sessions lived in memory and died with the tab,
  so the app started a BRAND NEW run on `pickOpeningTier` every open. It felt arbitrary
  because it was. `lib/runs.ts` persists the climb, so Continue now genuinely resumes:
  verified across a full reload, same pair back on the table.
- **Tier climbs only, and a server would not change that.** A curated run borrows guest
  films that exist nowhere else, so it needs whole `Film` objects; Fast Shuffle has no pile
  to resume. The key is device-local forever and excluded from sync — an unfinished pile is
  working state, not a judgement, and `reconcile.ts` refuses to merge.
- **It is a LAYER so the game shows through.** A screen could describe your run; this shows
  it to you, which is the reacclimation. **The backdrop must never dim to opaque** — at 82%
  the duel was invisible and it read as a dialog over a void. 58% + blur is the setting.
- **The overlay sits at z-25, BELOW the sheets, and that is load-bearing.** Above them it
  had to unmount to open the tier picker, which showed the bare duel for a frame — the app
  visibly jumping between screens. Underneath, the frost simply stays put while a sheet
  opens over it and is still there when the sheet closes, so there is nothing to flash and
  nowhere to land in between. **`onTier` and `onModes` therefore do NOT dismiss the
  greeting.**
- **`TierPicker` returns to whoever opened it** (`fromOverlay`). It always handed back to
  the Play sheet on close, which is right from Play and wrong from the overlay — dismissing
  the picker raised a second sheet you had to dismiss as well. Picking a tier FROM the
  overlay STARTS it; from inside Play it stays a setting.
- **Tapping the backdrop resumes.** It was a hard gate first, on the grounds that falling
  into a duel by mis-tapping is what this prevents — but the game is visible behind the
  glass, so reaching past it reads as "yes, that one" rather than as a slip.
- **Abandon goes to the empty screen, not a session report.** `commit` records the ended
  tier so a run that FINISHES gets its summary; throwing one away must not be met with a
  congratulation for work just discarded.
- **A junction, not a control panel.** Tiers and modes are not rebuilt: `TierPicker` and
  `ModePanel` already do that. Picking a tier FROM the overlay starts it (`fromOverlay`);
  from inside Play it stays a setting.
- **Not dismissible by tapping away**, by request: a decision point, not a notification.
- **`greet` is a counter, bumped on every arrival at RNK**, compared against the last
  dismissed. AppShell passes 0 while the splash is up so the two layers never stack.

### Sheets must be rendered by every branch (Session G)

`ModePanel`, `TierPicker` and `CuratedPicker` are built once into `sheets` and rendered by
every return path. They used to hang off the main return only, so any early return above
silently killed them and "Something else" did nothing. **A new full-surface early return
must render `sheets` or its buttons are dead.**

### "Something else" did nothing, and why that class of bug recurs (Session G)

`RunStart` returns early, and `{modeOpen && <ModePanel/>}` was mounted ~200 lines below
that return. The button set state nothing rendered. **Every sheet this screen can raise has
to be reachable from whichever branch returns first** — the early-return path now renders a
fragment carrying `ModePanel`, `TierPicker` and `CuratedPicker` itself. Adding a new
full-surface early return means auditing the sheets again.

### RunStart: the app no longer opens in a game (Session G)

The user: "it feels awkward sometimes to just load into an already selected game. It
shouldn't be video game menu like but it should be like a quick resume or maybe even a
this is what you have left kinda idea."

- **`AppShell` no longer knows how to start a run.** It used to open with
  `startRun(films, pickOpeningTier(films))`, so the first thing anyone saw was a climb
  already in progress. The problem was never which tier got picked; it was that a
  judgement was being asked for before anything had been offered. The shell now opens with
  `session: null` and `DuelScreen` renders `RunStart`. Importing a CSV lands there too.
- **The FIRST version of this screen was rejected, and how.** It was a dashboard: a
  `WHERE YOU STAND` eyebrow over a count, a bordered box, and a list of tiers with `0/185`
  right-aligned down the side. Every number on it was correct and the whole thing read as
  a settings panel. Two faults, both named by the user:
  - **No presence.** This is the door into a game about films, so a film should be on it.
    The artwork says what the app is before a word is read; a bigger heading could not.
  - **Labels instead of sentences.** `WHERE YOU STAND / 1 of 861` is a readout. "You've
    ranked 1 of your 861 films" is the app talking to the person whose library it is,
    which is the voice the rest of it already uses.
  Rebuilt as a title card: poster behind, serif prose over the fade, the standing demoted
  to one quiet line beneath the offer, the tier list reduced to a single row of type.
- **A poster here, even though `ProfileScreen` deliberately refuses one.** That refusal —
  "posters are the library's currency and one more of them at the top of your own profile
  goes stale" — is reasoning about the PROFILE, which is about you. This screen is about
  the films, and it is the threshold of the game where posters are the pieces you are
  about to move, so the currency belongs. It also costs no request; the profile has to
  fetch a still.
- **4:5, and `.poster-fade` rather than `.banner-fade`.** A poster is 2:3, so the profile's
  16:9 window throws away nearly half of it and takes the printed title with it; 4:5 loses
  about a sixth, evenly off the top and bottom. And a poster arrives saturated where a TMDb
  backdrop arrives dim, so the banner's gradient left it blazing directly under the header,
  fighting the wordmark. The new scrim is heavy at the top, open through the middle where
  the artwork earns its place, and solid at the foot so the offer reads at a glance.
- **It draws no chart.** The counts ARE the readout here: `13 of 14 still to rank`.
  This is about THIS screen, where the fact is a number. The blanket "no charts anywhere"
  rule that used to sit behind it was lifted on 20 Aug 2026 — see the Motion section.
- **The standing line is allowed to be static**, unlike the library bars `RunStatus` had
  to drop. Nothing is happening on this screen — it is a position, not a progress bar.
- **`lastTier` derives the resume from the newest row in the LOG,** not from stored state,
  for the same reason `bandsOf` derives Rough Cut's piles. It survives a restore, a second
  device and a reset, and it falls back to the `b` side when the contender has since been
  removed (removal never touches the log).
- **`RunStart` takes the whole surface via an early return, like Rough Cut.** Rendering it
  inside the duel chrome drew two headers, the outer one reading "0 TO RANK" above a
  screen whose entire job is to say what there is to rank.
- **`endedTier` fixes a pre-existing bug found on the way.** `endRun` nulls the session,
  and `TierComplete` then read `session?.tier ?? DEFAULT_TIER` — at exactly the moment
  session was null. **Finishing a half-star climb showed FOUR-STAR's films, count and
  duels under "Session done".** The transition is now caught in `commit`, which sees both
  ways a run ends (Done, and `confirm` emptying the pile), so the natural completion
  cannot be the path that forgets. Cross-tier runs are excluded: `RunSummary` owns those.
- **The duel tour fires on `onRunBegan`, not on arriving at the screen.** Caught only by
  looking at the deployed first-run: RNK now opens on `RunStart`, where none of the tour's
  targets exist, so the tour resolved down to its single Rough Cut step and marked itself
  seen. **The one user who needed it was the one guaranteed not to get it.** Two features
  shipped the same day, each correct alone. If you add a screen in front of another, check
  what the tour resolves to on it.
- **Known, not fixed:** `TierComplete`'s "duels" stat sums the per-film counter, so it
  double-counts exactly like the profile's DUELS stat. Same root cause, same reason for
  leaving it alone.

### The list's unplaced block sorts by SCORE, not A-Z (Session G)

Reported by the user: a Rough Cut played correctly, and the list afterwards was "all out
of order from what I picked".

- **The cause was a collision between two correct decisions.** `applyRoughCut` writes
  `score` and deliberately writes NO `lock`, so every film it touches stays unplaced. And
  `buildList` sorted the unplaced block **alphabetically**, on the stated grounds that an
  unranked film's score is a by-product of `writeScores` re-spreading somebody else's
  climb. Both were right when written. Rough Cut broke the second one's premise: it made
  an unplaced film's score a decision the user actually made, and A-Z threw it away.
- **The scores were correct the whole time.** Nothing was lost, and no data needed
  repairing. The list was discarding the judgement at render.
- **The fix is `b.score - a.score || a.title.localeCompare(b.title)`.** The tiebreak is
  what makes it safe rather than merely better: `seedScore` is `tierMid`, so every film in
  a tier nobody has touched holds an identical score and falls through to A-Z exactly as
  before. **Order only appears once something has actually happened.**
- Confirmed against the real 861-film library, where 3★ had 176 of 185 films still on the
  seed score. The four upper-pile picks now open the tier in the order they were dealt,
  the untouched 176 sit alphabetically in the middle, and the lower pile closes it.
- `test/list.test.ts` is new. `buildList` had **no tests at all** before this.
- **The remaining honest limitation:** a tier that has been climbed but not cut now shows
  its unplaced films in live pile order rather than A-Z, because `writeScores` gives them
  distinct scores. That order is the engine's working state, not a judgement. If it ever
  reads as noise, the fix is provenance (a flag set by `applyRoughCut` and cleared by
  `writeScores`), not a return to A-Z, which loses real decisions.

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

- ~~**This app speaks in TYPE, not graphics.**~~ **LIFTED by the user, 20 Aug 2026.**
  The entry said a tier map had been built twice and rejected both times ("chunky", "the
  app is eloquent film not Chungo bar"), and concluded that a chart should never be drawn
  without first checking whether a number in an existing control would do.
  **It is no longer a rule. Do not reinstate it from git history.**
  - What was true stays true: those two tier maps were about PROGRESS, on the duel
    screen, and a number did the job better. Tier progress still reads `77/134` in the
    Jump menu and should stay that way.
  - What was wrong was generalising from that to every chart in the app. A taste chart is
    a different object with a different job, and the user has asked for one.
  - The rule this replaces it with is narrower and still worth keeping: **a graphic has
    to say something a number cannot.** Progress is a number. A shape is not.
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

**Session K took a bug block ahead of all of this and cleared it** — the wipe, the overlay
stacking, the Log drawer's layering, the bottom seam and the drawer gap. Nothing was
renumbered for it; those were fixes to shipped behaviour rather than new items, and they
are written up under Landed.

**Session L took no numbered item at all** — it went at sync (which turned out not to be
running), the conflict chooser, and Rough Cut's range. All fixes and additions to shipped
behaviour, written up under Landed. **The numbering below is unchanged since Session K.**

**Where to start, as of 21 Aug 2026.** 1, 3, 4 and 6 landed earlier; 2 is parked by the
user's own decision.

**5 — the profile visual pass — is LARGELY DONE**, in Session M. It had been waiting on a
steer on visual direction and got one, at length: the page is two swipeable panels, the
bordered boxes are hairlines, the sideways shelves are grids, and the statistics are named
observations rather than percentages. What remains of it is listed as P1 to P5 in
`REGISTER.md` — chiefly the world map and tapping a country to rank those films.

That leaves **7 (resume a curated run)** as the live numbered item, and it is still the
better contained move: it finishes something half-built and got cheaper in Session K
because `RunRequest` is exactly the shape a resumed run rebuilds into.

**But read `REGISTER.md` before picking anything from this list.** It holds the competitive
research, the rest of the copy sweep, and roughly eighty other open items — this list is
only the part that was scheduled before any of that existed. **A1 in the register outranks
everything here**: if the sign-in gate locks people out of their own libraries in aeroplane
mode, nothing else matters.

1. ~~**Onboarding**~~ — **LANDED in Session G.** Coach marks over the live UI, one pass
   per screen, revisitable from Settings. See the decision block above. The original entry
   read: A new user is told nothing and infers everything. The user supplied
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

2. **THE EDITABLE LIST — the biggest thing outstanding, and the user's own founding idea.**
   **Five separate pieces of feedback in Session J turned out to be this one problem**:
   unlock and reorder from the list, adjust the order before confirming at the end of a
   run, a ratings audit, exporting adjusted ratings back to Letterboxd, and "what if I put
   a film in the wrong pile". Every mechanic in the app is earn-it-by-duelling; **nothing
   is assert-it**, and a hard lock has no per-film way back — only the two bulk resets in
   Settings.
   - **A full audit has to be able to CHANGE a star rating** when a move crosses a tier
     boundary. Today the only route by which a rating ever changes through play is
     promotion. An audit that cannot re-rate is just reshuffling within a band, which
     already works — so this is the part that makes it worth building.
   - **The Letterboxd round trip is then nearly free.** `importCsv.ts` reads
     `Name,Year,Rating` in half-stars, which is exactly the tier scale, so the export is
     the same file with new numbers.
   - The user's decision in Session J was **full audit, but test the current system
     first** — hence parked, not dropped. Adjusting from the list view is wanted alongside
     it, not instead of it. Longer write-up in `POTENTIAL-FEATURES.md`.
   - The old constraint still holds and is the hard part of the list-view half:
     **`ROW_H = 96` drives section spacers and tier-jump offsets, nothing may change a
     row's height, and nothing new goes inside the list scroller** — drag handles and lock
     toggles want to violate both.
3. ~~**Tier cards, and the `runRequest` collapse.**~~ — **LANDED in Session K**, both
   halves. See the Landed entry. The original read: A tier card is a live view over
   `rankedFilms(films).slice(0,10)` — NOT a curated run, because a KotH tier run already
   writes scores and a second cross-tier order would contradict it. **This is also the
   Profile Card's "Top 10" slot** (#11), described from the other direction. Do the prop
   collapse with it: `personRun` / `personGuests` / `personPortrait` plus the genre run are
   already two effects reaching for `state.session`, and resume would make it three. They
   cannot race today because only one is ever set at a time, but that is a property nobody
   is enforcing.
   - **What it leaves for #4:** the profile's named slots are now half-answered. Top 10
     exists and is live; "favourite actor" and "favourite director" are still absent, and
     they are a different thing — a saved ranking, not a projection. Do not try to make
     those live too; there is no master order across a person's work, which is the whole
     reason a person run exists.
   - **And for #7 (resume):** `RunRequest` is the shape a resumed run should be rebuilt
     INTO. `adoptRun` gets a request, not three props, and `subjectKey` is already the
     primary key `lib/runs.ts` wants.
4. ~~**Profile card slots + persistence + JPG re-export**~~ — **LANDED in Session G**: the
    shelf, the viewer, re-export, pinning, the `{v:2}` payload and the per-format backup key
    set are all in. What remains of the original item is the auto-save floor and named
    slots (Top 10, favourite actor) as *empty* prompts. Original entry: Empty slots for Top 10, favourite
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
5. **Profile page redesign** — **a first pass LANDED in Session I; the direction is open.**
    Asked what the screen is for now (identity / taste / progress), the user said "I guess
    all of them" — so the pass was structural rather than a new concept. The problem was
    never the contents: eight blocks all wore the same tracked-caps label, so nothing was
    subordinate to anything and the page read as a list of unrelated facts. There is now a
    `Zone` heading one level above `Section` (serif, sentence case, faded rule) grouping it
    into **What you like · What you've made · Where it stands**, plus a boxed progress band
    under the identity block holding the stats, the recap and a way back into the game —
    which the landing screen previously did not have at all.
    **Still open, and the original entry's intent:** moving it toward what the JPG export
    looks like. That is a visual language question, not a structural one, and the structure
    is now out of its way.
6. ~~**Upload a profile picture.**~~ — **LANDED in Session K.** Uploads themselves shipped
    earlier (Blob + `AvatarCropper`); what was missing was that `AvatarSlot` rendered a
    bare initial when signed OUT, so most users had no way to change their picture at all.
    That gate was sound reasoning with too broad a conclusion: it assumed a picture must
    be an upload. **A frame from a film you already own is a URL**, exactly as
    `bannerStill` is — no storage, no account, and the whole profile stays a few hundred
    bytes (measured at 101 with an avatar set).
    - Tapping the circle now opens `AvatarMenu`: *use a frame from a film* always, *upload
      a photo* when signed in, *remove it* when there is something to remove.
    - The banner and the avatar are now ONE two-step flow with a `StillTarget` riding
      along, rather than the avatar growing a second copy of it. `StillPicker` shows
      **round, square-cropped** thumbnails for the avatar, so what you pick is what you
      get — the same complaint that put a cropper in front of uploaded photos. There is
      deliberately no cropper for stills: TMDb frames are not somebody's own photograph.
    - `AvatarMenu` renders in the SCREEN's overlay block, not inside `AvatarSlot`. A fixed
      overlay nested in the avatar would measure against any ancestor carrying a
      `transform` rather than the viewport — the Log-drawer bug wearing a different hat.
    - Original entry: `profile.ts` deliberately stores NO images — a banner is a film id
      and a still URL. Real uploads need server storage, which needs the pinned accounts
      work.
7. **Resume an in-progress curated run.** `lib/runs.ts` (`rankd-runs-v1`) holding subject,
    session and **`guests: Film[]` in full** — ids alone lose every unseen film.
    `adoptRun(films, session)` belongs in `ladder.ts` with its own tests. Stays device-local
    forever; it is deliberately excluded from the synced payload.
8. **#14 design pass** — `SessionEnd`, `PersonSheet`, `LogFilm`, `RunBars` ship PROVISIONAL.
    **Rough Cut came off this list in Session I.** It had shipped marked PROVISIONAL with no
    motion at all, which next to the duel screen read as an older app. It now has the duel's
    vocabulary at shorter durations: the card follows the thumb and banks into the throw,
    the aimed target lifts while the other two recede, the placed poster flies into the pile
    it was filed under (`flyPosterTo` in `PosterCard.tsx`, alongside the existing helpers),
    the progress bar blooms, and the summary counts up. All of it honours
    `prefers-reduced-motion`. **The point was not decoration** — you answer that screen once
    a second for fifty films, and the only thing keeping it from feeling like data entry is
    being able to feel each answer land without reading anything.

## Pinned — built but not shipped

- ~~**Accounts (Session E).**~~ **SHIPPED. This entry was stale and actively
  misleading — corrected in Session K.** Auth, the database, sync and Blob avatars are all
  on `master` and all configured in production: `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `DATABASE_URL`, `BLOB_STORE_ID` are set on Preview and Production
  (`npx vercel env ls --scope rankd2`). **The `accounts` branch is dead history — do not
  merge it**, it predates everything Sessions F–K did to those files. The original entry's
  setup notes are kept below only because the reasoning still explains the choices.
  Needed a Neon database
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

## Waiting on the user — nothing else blocks this

- ~~**Publish the OAuth consent screen.**~~ **ALREADY DONE, and this entry was WRONG for
  several sessions.** The user confirmed on 16 Aug 2026 that the consent screen has been
  *In production* all along. It claimed "until this is done the app cannot be handed to
  anybody", which was a false blocker sitting at the top of the waiting-on-user list and
  shaping decisions underneath it.
  **This is the second time this file has asserted a blocker that was not real** — see the
  `leastRanked` note near the top, which claimed a module was in the tree for two sessions
  while it was not. The lesson is the same and evidently needs restating: **an item on
  this list that nobody has re-checked is a claim, not a fact.** Anything here that
  depends on state outside the repo — a Google console, a DNS record, a dashboard toggle —
  must be re-confirmed with the user before it is allowed to block or shape a decision.
  Sign-in works for anyone with a Google account, today.
- **The gate, on a real phone (Session K).** Two things, and the second is the one that
  breaks quietly:
  - **A stranger's first open.** Splash, then the sign-in screen, then the app. Nothing of
    the app visible before signing in.
  - **AEROPLANE MODE, after having signed in once on that device.** You must land in your
    library, NOT on the wall. This is `fetchSession` answering `unknown` and falling back
    to `hasSignedInBefore()`; it is unit-tested (`test/session.test.ts`) but the real
    combination of a service worker, a cached page and no network is not something a
    desktop reproduces. **If this is broken, the gate is locking people out of their own
    libraries and it is the most urgent thing in this file.**
- **Three things from Session I that only a human can close.**
  - **Upload a real photograph** through the cropper on the deployed site. Off-centre is
    the case worth trying, since that is the one the old centre-crop got wrong.
  - **Confirm a feedback email actually ARRIVES.** Resend answered `{"ok":true}` from
    production, which proves the endpoint and the key and says nothing about delivery. If
    it does not land, `SUPPORT_EMAIL` must be the exact address the Resend account was
    created with, until a domain is verified.
  - **Add the app to an iPhone home screen** and check the address bar is gone and the
    icon reads properly. Every tag and asset is verified in the rendered head and serving
    200; "no address bar" is a claim about a device nobody has tested on.
- **Two fixes from Session J that can ONLY be judged on a real phone**, because neither was
  ever reproducible locally:
  - **The avatar appearing immediately after upload.** The cause was the device serving its
    own cached copy of a URL that never changes; the URL now carries a version. Local
    testing cannot see this at all.
  - **Sync feeling quieter.** An unchanged library no longer re-uploads 468KB on every
    dirty tick.
- **Delete everything while signed in ON TWO DEVICES.** Nothing may come back on either,
  and the second device must not push the library back up. The single-device path is
  covered by `test/wipe.test.ts`; two devices racing is not. **Blocked on a deploy** —
  there is no way to test it locally, because the signed-in flow needs auth configured.
- **The seam and the drawer gap: DO NOT CHASE.** Both were fixed in Session K against a
  theory the code proves, and both can only be exercised where the real viewport is
  taller than `100svh` — a mobile browser with the URL bar retracted. The user has said
  they look right and asked for them to be left alone until they say otherwise. Do not
  put them back on this list, and do not "improve" them speculatively.
- **The sign-in jitter is still UNPROVEN and untouched.** The suspect is
  `window.location.reload()` at the end of `pull()` in `sync.ts` — signing in reconciles,
  decides to pull, and tears the whole app down and boots it again. **It has never been
  reproduced**, because the signed-in flow needs auth configured locally. Do not replace it
  on the strength of the theory: doing so means hand-reconciling React state across
  `AppShell`, and a stale-library bug is worse than a slow sign-in. Confirm first.

## Operational facts for accounts (Session H)

All of this exists and works. Written down so nobody rediscovers it the hard way.

- **Google Cloud project `rankd-505604`**, owned by the user's personal Google account.
  Client type **Web application**. Redirect URIs, which must match character for character:
  `http://localhost:3000/api/auth/callback/google` and
  `https://rankd-app-eight.vercel.app/api/auth/callback/google`.
  **Authorised JavaScript origins are deliberately EMPTY** — Auth.js signs in through the
  server, so origins are only for browser-side flows like One Tap. Pasting the redirect URIs
  into that box instead is the easy mistake; it rejects anything containing a path.
- **The consent screen's support address is a Google Group**, not a personal address, on
  purpose. A group has no password and **cannot be signed in as** — sign in with a real
  Google account.
- **Neon**, region `ap-southeast-2` (Sydney), free tier. **Use the POOLED host**: the same
  address with `-pooler` inserted before the region. The direct endpoint hands every
  serverless invocation its own connection and runs out. Region cannot be changed after the
  project is created.
- **The connection string must keep its tail**, `/neondb?sslmode=require`. Losing it makes
  the driver fall back to the username as the database name and fail with
  `database "neondb_owner" does not exist` — which reads like a credentials problem and is
  not. This happened once already while hand-editing the host.
- **Env vars live in two places and must agree**: `rankd-app/.env.local` (gitignored) and
  Vercel → Settings → Environment Variables. Both need `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `DATABASE_URL`, `TMDB_API_KEY`. **Vercel's are marked Sensitive, so
  their values cannot be read back by anyone, the CLI included** — to correct one, overwrite
  it rather than trying to inspect it. Env changes need a fresh deploy to take effect.
- **Local dev needs no Docker.** `docker-compose.yml` exists for a local Postgres, but this
  machine has none installed, so `.env.local` points straight at Neon. Works fine; it is a
  network round trip instead of localhost.

## Backlog — captured, not scheduled

- **A switch to turn Fast Shuffle off entirely.** The user is cooling on it and wants to opt
  out rather than have it removed for everyone.
- **Subgenre runs** — "zombie films" rather than "horror". A keyword is narrow enough to
  have a real edge, so unlike a genre it could borrow unseen films the way a director run
  does. `topPeople` in `profile.ts` already derives subgenres from `f.keywords`.
- ~~**Custom profile pictures.**~~ **LANDED in Session I**, and then some: `@vercel/blob`,
  `api/avatar/route.ts` behind `requireUser`, `lib/avatar.ts` rendering a caller-chosen
  square to 256px, and `AvatarCropper` for choosing it. `avatarOf` in `profile.ts` is the
  priority rule — upload, then the Google photo, then the initial — so avatars work signed
  in with no store configured at all.
  **Blob authenticates two ways and the store here uses the newer one**: connecting it in
  the Vercel dashboard sets `BLOB_STORE_ID` (+ an injected `VERCEL_OIDC_TOKEN`) and NO
  `BLOB_READ_WRITE_TOKEN`. Checking only for the token refuses every upload on a working
  deployment.
  **OIDC is enabled per ENVIRONMENT.** Preview and Production work; Development does not,
  so every LOCAL upload fails with a plain-English SDK error and there is no way round it
  from a dev server. Verify on a deployment.
  **Still unrun end to end with a real photograph** — the geometry was proven with a
  600×300 synthetic whose marker sat in the right third (drag clamped at exactly the
  computed minimum; output samples the marker on the right), and the route was proven to
  503/401/502 correctly. Nobody has yet watched their own face upload.
- ~~**PWA — lose the URL bar.**~~ **LANDED in Session I.** `app/manifest.ts` at
  `display: standalone`, four generated PNGs in `public/`, and both spellings of the
  capable meta tag. The icons are drawn by a dependency-free PNG encoder rather than an
  image library — the mark is the five brand bars from `lib/brand.ts`, which is the one
  part of the identity that does not need a font rasterised. **The generator is not in the
  repo**; it was a scratch script. Re-run it only if the icons need to change.
  One honest catch that still stands: Google sign-in from a fullscreen PWA can bounce out
  to the browser and back on iOS, which breaks the illusion briefly. **Untested on a real
  iPhone — the whole feature needs one pass on device before it is called done.**

## Pinned — decide later, don't act yet

- **Fast Shuffle stays. DECIDED 21 Aug 2026 by the user, and this is no longer pinned.**
  It was pinned from Session I onward — "I might get rid of fast shuffle too - pending" —
  and from watching real people use the app, who "hardly like the idea of something else
  shuffling their list for them." Both entries are gone. Do not reinstate them.
  - **What the objection actually was.** Session M checked user reviews across the whole
    field, and the split between what people praise and what they complain about settled it.
    The COMPARISON itself is praised consistently — Beli users call it "genuinely
    satisfying" and name accuracy as the number one feature, explicitly against star
    ratings. Nobody complains about it.
  - What they DO complain about is **loss of ownership**: rankings feeling "wonky and
    overstated", and not feeling like their own list. That is the Elo-drift complaint, from
    real users, on the biggest app in the category — an argument for hard locks, not against
    a soft mode. So the recorded objection was to Fast Shuffle being **unexplained and
    unbounded**, never to it existing.
  - **What is left is the rebrand, and it is now open work, not a question.** Its own named
    game writing PROVISIONAL placements; hard locks still earned through Rough Cut, King of
    the Hill or by hand; **the two states named on screen.** Rankd is the only app in the
    field that can offer both layers and say which is which. `REGISTER.md` F4.
  - Standing note kept from the old pin because it is still true of any change here:
    **check what depends on it first** — that is the lesson Spotlight taught, and
    `ShuffleDuel` is reused by the person-run path.
- **"Finishing a run doesn't feel like anything."** Partly answered now that the cards exist
  — re-judge once they are on a phone.

### Removing Spotlight, and what was hiding behind it (Session I)

- **Two things depended on it and neither was obvious.** The review card's only action was
  "start a Spotlight", and **tier promotion was reachable from nowhere else** —
  `promotionTarget` began `session.mode !== "spotlight" ? undefined`. Cutting the mode
  naively would have made star ratings permanent, set at import and never movable by play,
  which nobody asked for and nobody would have noticed until much later.
- **Promotion now hangs off King of the Hill**, offered on the FIRST confirm of a run when
  the film has beaten every other film you own at its rating. That is a stronger claim than
  the old trigger (a binary search settling at the top of a sampled window), and it fires at
  most once per run. The predicate is a set comparison against the library, not a flag —
  so a Rough Cut sub-pile cannot qualify without anyone having to remember to exclude it.
- **`resumeAfter` is why it can hang off a long climb.** A promotion is offered one confirm
  into a run that may be an hour long, so the attempt has to be something the run comes BACK
  from. It holds the session as it stood at that confirm: a loss restores it verbatim, a win
  restores it with the promoted film lifted out. `saveRun` stores that held session rather
  than the attempt, so closing the tab mid-attempt loses the three duels and keeps the hour.
- **The old "losing ends the promotion" was not true, and its test did not catch it.** The
  code returned without handing the climb on, and `refresh` then aimed the subject straight
  back at the film that had just beaten it — the same duel, forever, with Done the only way
  out. The test asserted `promotionWon === false`, which an infinite rematch also satisfies.
  **A test that only checks the failure flag cannot tell a clean exit from a livelock.**
- **`"spotlight"` stays in `LogMode` and must not be removed.** Rows stamped `s` are already
  in people's browsers and in their backup files. The log is append-only and never edited;
  dropping the value would make real judgements decode as something they were not.
- **`rankd-review-dismissed-v1` stays in `backupFormat.ts`'s FILE_2 key set** for the
  matching reason: ownership is what gives a restore permission to CLEAR a key, so removing
  it would strand the stale value on every device that ran the old build.

## Gotchas that have already cost time

- **A geometry that is arithmetic will not tell you when it is wrong (Session N).**
  `ListScreen` computes every section's height from constants and never measures the DOM —
  `jumpTo` and every virtualisation spacer trust those numbers. The grid view got them
  wrong **twice**, and neither was visible by eye in a small library:
  - `clientWidth` is only read on scroll, and the list mounts inside a translated pane
    before layout. A **zero width** collapsed every cell: a tier declared 374px and drew
    1294px of posters over the tier below. Fixed by refusing a zero and adding a
    `ResizeObserver`, which also covers rotating the phone.
  - The cell height was **derived** from the poster ratio and CSS then laid it out its own
    way — gaps go *between* rows, not after each. 1670px declared against 886px drawn.
    Fixed by **imposing** the height via `gridAutoRows` so one number drives both.
  - **How to catch it:** in a live browser, compare each `section[data-tier]`'s
    `style.height` against its last child's measured bottom. It must be 0.
- **`.list-poster` is a ROW class and reusing it broke the grid (Session N).** It carries
  `width: 54px; height: 76px; transform: rotate(-4deg)` and beats Tailwind's `w-full` and
  `flex-1`. It was borrowed purely to inherit the idle poster-shake, and every grid cell
  drew a 54px sliver cropped tall with a chasm of gap either side.
- **A deferred callback holding `state` from its own render will clobber the user
  (Session N).** A replayed duel commits 200ms into the poster's flight and the flight
  cannot be cancelled, so anything done in that window raced it — and the pending commit,
  built from the state as it stood *before* the action, won. Seen as "Make last" locking a
  film and leaving it in the pile anyway. **Guarding the commit was tried first and is the
  wrong shape**; it makes a deferred action a race to be refereed. The fix is a ref written
  after every render so callbacks read the run *as it stands when they fire*.
- **One word for two states, shipped on two screens at once (Session M).** The app
  used "settled" to mean a HARD lock in `RunStatus` ("6 settled", a delta over
  `isHard`) and to mean ANY placement on the profile band, which labelled
  `placedCount` — hard and soft together — "Settled". Both were on screen in the
  same session and could never agree, and nothing caught it because no test
  asserted a label.
  - **The vocabulary, now fixed, and worth keeping:** *ranked* = has a number,
    however it got one · *settled* = you committed to it, hard only · *UN-RNKD* =
    no position at all. `ListScreen`'s header reads "160 ranked · 260 films" and
    `RunStatus` points at that line in a comment, so it is the canonical phrasing.
  - The older warning in `ListScreen` was about three words for ONE idea. This was
    the inverse, and it is the more dangerous direction: synonyms look untidy, but
    one word for two ideas makes two correct numbers look like a bug.
- **A distinction can be DRAWN for months without ever being NAMED (Session M).**
  Hard versus soft locks were gold-and-bold against dim in the list from the day
  locks landed, and the only text explaining the difference was a `title`
  attribute — a hover tooltip, on a device with no hover. So the one idea a reader
  could not possibly work out for themselves was the one idea the app never said.
  - **The check worth running on any new visual encoding: where does the phone say
    what this colour means?** If the answer is a tooltip, an `aria-label` or a
    comment in the source, it is not said.

- **A cache hit that skips the yield turns a paced loop into a blocking one
  (Session M).** `backfillPosters` slept `gapMs` between films but skipped the
  sleep entirely when the film was already cached — correct about network pacing,
  wrong about the event loop. With a warm cache it awaited nothing real, so it
  ran as one uninterrupted block over the whole queue.
  - Compounded by the second half: it called `onFound` whenever the response
    contained anything at all, which is true of every film that already has its
    artwork. `onFound` lands in a `setState` that calls `saveFilms` — a full
    stringify and synchronous `localStorage.setItem` of the entire library,
    around half a megabyte. **So it rewrote the whole library once per film and
    changed nothing each time.**
  - Fast Shuffle is where it bit, because its queue is the whole POOL where King
    of the Hill only ever walks the pile it is playing. **It locked the phone,
    not the tab** — screenshots included.
  - **The lesson for any paced walk: yield on every iteration, not only on the
    slow ones, and never report a change that is not one.**
- **`performance.memory.usedJSHeapSize` measures the JS heap and nothing else
  (Session M).** Decoded images, canvas backing stores and graphics memory are
  all invisible to it. A reading of 22MB while a phone is dying is not evidence
  of health.
- **An instrument that stops when the thing it measures stops is not an
  instrument (Session M).** The first diagnostic overlay reported the worst frame
  gap — but if the main thread blocks, the frame loop and the interval both stop,
  so every figure freezes at its last good value. The mid-freeze screenshot read
  46ms and looked perfect. **Any freeze detector needs a monotonic counter and an
  input counter that a blocked thread cannot fake.**
- **Three theories died before the right one, and the reading that killed each
  came from the phone (Session M).** Engine cost was measured flat at 0.6ms over
  300 duels; the clone-leak theory was disproved by a DOM count of 121 during a
  freeze against 680 in a mode that was working. **Measure before fixing, and
  when a fix does not land, suspect the theory rather than reaching for a
  second patch.**

- **A reload does not stop the page (Session K).** `location.reload()` leaves timers
  firing and fetches resolving until the navigation actually commits, and effect cleanups
  never run at all. "Delete everything" cleared storage and watched the credits sweep
  refill it from a closure holding the deleted library. **If you clear state and reload,
  something has to refuse the writes still in flight** — see `lib/wiped.ts`.
- **A `z-index` only competes inside its own stacking context (Session K).** The Log
  drawer was `z-30` and the bar it painted over was `z-40`, which reads as impossible until
  you notice the drawer was rendered as a CHILD of the bar. **A number lower than another
  number tells you nothing until you know both live in the same context.** Overlays go
  over screens, never inside chrome.
- **`position: fixed` and `100svh` measure different things (Session K).** `main` is cut to
  `svh` — deliberately an under-estimate — while a fixed sheet measures the real viewport.
  They agree on a desktop and in a fullscreen PWA, and disagree by however much the URL bar
  was hiding everywhere else. Both the seam and the drawer gap were that one difference.
  **A layout bug that reproduces on no desktop viewport is usually a viewport-unit
  disagreement, not a spacing mistake.**
- **A "clearing" write is more dangerous than a "saving" one (Session J).** While the
  tutorial sandbox existed, the obvious guard was "do not save". The real hazard was that
  `saveRun` and `saveRoughCut` both REMOVE their key when handed something unresumable — so
  a demonstration ending would have wiped a real half-finished climb. **When you guard a
  writer, check what it does with null**, not just what it does with data.
- **An alias made an old backup format claim keys it never carried (Session J).**
  `FILE_1 = SYNC_KEYS` looked tidy and meant every key added for sync was retroactively
  declared owned by format 1 — and ownership is what gives a restore permission to CLEAR a
  key. Restoring an old file would have deleted a preference that file predated. **Frozen
  history must be written out literally, never derived from something live.** Same reason
  `LEGACY_SEED_IDS` is a list of strings.
- **A tour that resolves to zero steps still marks itself seen (Session J).** `Coach`
  filters steps to targets present in the DOM, and a tour whose targets are all absent
  finishes immediately — burning the "seen" flag having taught nothing. That is why the
  duel tour waits for a run, Rough Cut has `onBegan`, and **no tour fires on an empty
  library at all**. Any new tour needs a trigger tied to its targets EXISTING, not to a
  screen being current.
- **Effects that clean something up get written next to the thing they guard, which is
  often after an early return (Session J).** A `useEffect` placed beside `endTutorial` sat
  below `if (!state) return splash` and React threw "rendered more hooks than during the
  previous render" the moment the library loaded. **Hooks go with the other hooks.**
- **A feature gated on the exact state you tested it in looks broken everywhere else
  (Session J).** The tutorial ran only for an EMPTY library; with one film the button did
  nothing, which is precisely the complaint that had prompted building it. Reported by the
  user, reproduced in their exact state, then fixed by deleting the branch. **Before
  shipping a conditional path, ask what the OTHER branch does — and test that one.**
- **The landing rule re-fired mid-run, and had done since it was written (Session I).**
  `openingScreen` was evaluated on every render for as long as nobody had navigated — and
  its input is "has anything been placed", which PLAYING changes. So a new user who opened
  on the duel and confirmed their first film was thrown onto the profile by that confirm.
  Nothing had navigated, so nothing overrode it. It is now decided once, when the library
  lands. **A derived value whose input the user's own actions change is not a default, it is
  a rule that keeps firing.**
- **A cropper that does not clamp uploads a transparent wedge (Session I).** The avatar
  upload square-cropped from the CENTRE, which is a guess and wrong for most photographs.
  `AvatarCropper` replaced it, and the invariant there is the whole feature: the image must
  cover the viewport at every drag and zoom (`tx <= 0`, `ty <= 0`, `tx >= VIEWPORT - width`,
  same for y). **Enforce it on every change, not at render** — by the time a gap is visible
  the picture has been written and no clamping fixes it.
- **The nav must stay above the sheet scrim, and `--nav-h` must stay published.** Sheets
  stop at the top of the bar rather than covering it. Two things hold that up and both are
  easy to break: `nav` is `relative z-40` (remove `relative` and it silently drops behind
  the `fixed z-30` scrim, because `main` sets no z-index and creates no stacking context),
  and `BottomNav` measures its own height into `--nav-h` because `env(safe-area-inset-*)`
  makes it a device property. It resets to `0px` on unmount so sheets on nav-less screens
  still reach the bottom.
- **A confirm screen showing a rating mid-promotion is showing the OLD one.**
  `completePromotion` does not write the new rating until Lock in is pressed, so reading
  `champion.rating` announced a promotion from ½ to ★ as "EARNED ½" above a button saying
  "Lock in at ½". The run's own `tier` is the tier being taken on; read that instead.
- **Next 16 does not emit `apple-mobile-web-app-capable`.** `appleWebApp.capable` emits the
  standardised `mobile-web-app-capable` only. Older iOS reads just the prefixed spelling —
  the exact devices the PWA work is for — so `layout.tsx` emits both via `metadata.other`.
  **Verified against the rendered head, not assumed**; the tag was simply missing.
- **`vercel env pull` DESTROYS `.env.local`. Back it up first, every time.**
  It does not merge — it overwrites the whole file — and for every variable Vercel marks
  **Sensitive** it writes the literal string `[SENSITIVE]` rather than the value, because
  those cannot be read back by anyone, the CLI included. Rankd marks nearly everything
  sensitive, so one pull replaced `TMDB_API_KEY`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET` and `DATABASE_URL` with an 11-character placeholder in one go
  (Session I). The app then fails in ways that look like five unrelated bugs: TMDB 403s,
  `no matching decryption secret` in the auth logs, and — because Auth.js discards a cookie
  it cannot decrypt — **every local session is silently signed out and cannot be restored
  by putting the secret back**. You have to sign in again.
  **Tell: any pulled value exactly 11 characters long is `[SENSITIVE]`, not a secret.**
  If you need one variable locally, add it to `.env.local` by hand. Only pull when you
  actually want the non-sensitive additions, and diff the result before trusting it.
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
- **`rankd-review-dismissed-v1` is now a DEAD key that is still listed on purpose.** Nothing
  writes it since the review card went (Session I). It stays in `backupFormat.ts`'s FILE_2
  set because ownership is what lets a restore CLEAR a key — drop it and the stale value is
  stranded on every device that ran the old build.
- **~~Saved rankings and the review flag are in no backup.~~ FIXED, and this bullet was
  the stale one — corrected 21 Aug 2026 (register I2).** All three claims here had rotted:
  - `rankd-lists-v1` IS in the file set — `FILE_2` in `backupFormat.ts` lists it, with the
    comment "saved rankings — real work, and the reason this exists". It is also SYNCED,
    through a path of its own: `sync.ts` moves saved rankings as their own rows via
    `loadLists`/`replaceLists` rather than as a blob key, which is why it is absent from
    `SYNC_KEYS` and why absence there does not mean absence from the account.
  - `rankd-review-dismissed-v1` is in `FILE_2` too, deliberately, as a dead key kept so a
    restore can still CLEAR it on devices that ran the old build. The bullet directly above
    this one says so, which means the file contradicted itself.
  - `rankd-visit-v1` is no longer a question at all. The recap it served was removed on
    21 Aug (register N18) and only the taste chart's before/after still reads that snapshot.
  - **The lesson, which is why this is kept rather than deleted:** every claim here was true
    when written and none was re-checked. Three separate register entries turned out the
    same way in one afternoon. A note about the state of the code has a shelf life.

---

## Books: the second medium (29 Aug 2026)

Films and books are ranked by the same engine and share no list. The switch is
the RANKD wordmark, mirrored in Settings.

**The medium switches the STORE, it does not filter one.** `lib/medium.ts`
holds the active medium; every per-medium module names its key through
`keyFor()`. Films keep their existing keys byte-for-byte and books take a
`:book` suffix, so there is no migration and no build can lose anybody's films.
The alternative — one library with a `medium` field and a filter at every read —
was rejected because a filter forgotten anywhere shows books inside a film
ranking, and `loadFilms()` is taken whole by the tier counts, the profile, the
taste chart and the duel pool.

**`Film` is still called `Film`, and a book is stored in one.** `director` holds
the author, `runtime` holds the page count. This is a wart and it is deliberate:
renaming the type across 115 files is a large mechanical diff with nothing to
gain, and the reader never sees the word "director" because every label comes
from `lib/lexicon.ts`. The rename is available later as its own change.

**Copy comes from a lexicon, not a find-and-replace.** Most strings in this app
are sentences, and "which you'd rather watch" is not "which you'd rather read"
with a noun swapped. `lex()` supplies the words; the sentences stay written out
at each site. `secondRole` is `null` for books — a book has one credit role, so
the actor tab and the actor run are ABSENT rather than empty.

### Two things measured, not assumed

**Google Books refuses unauthenticated search.** Not a lower quota — 429, on
every query tried from an ordinary IP. `GOOGLE_BOOKS_API_KEY` is optional in the
code (so a missing key degrades rather than 500s) and required in practice. The
cover half is genuinely keyless: Open Library returned 200 and real artwork for
every ISBN tried, 182–325px wide, aspect ratios 0.60–0.67 against the 2:3 the
poster frames assume.

**A rate limit must never be recorded as "no such book".** `searchBooks` returns
`null` for "could not ask" and `[]` for "asked, nothing there"; only the second
may become `noMatch`, which is permanent. `fetchMeta` no longer caches a failed
response either. `guard.ts` records the same bug from the TMDb side — a 429 that
was cached as an answer, after which "posters stopped and stayed stopped".

### The two data-loss paths that had to be closed first

**Saved lists sync as a whole-shelf replace.** Pushing from the book medium
would have declared the book shelf to be the entire shelf and deleted every film
list on the account, and the next pull under films would have written those book
lists into the film key. Each row now carries its medium and `pushLists` sends
both; `pullLists` splits them again.

**A backup format owns the keys it may CLEAR.** The book keys are in a new
FORMAT 3 rather than added to FILE_2, because every format-2 file was written by
a build that had never heard of books — declaring the book keys owned by format
2 would mean restoring any older backup silently deleted the book library.
`validateBackup` also no longer requires a film library, or a books-only reader
could neither back up nor sync.

### What is NOT done

- **The profile, the share cards and the taste chart are film-shaped.** They
  render for books and lean on genre and country data that Google Books does not
  supply. Genre in particular: TMDb's tidy 19 labels vs Google's coarse, noisy
  `categories`. Worth a pass before books are shown to anybody.
- **The public profile (`/u/[handle]`) is film-only** and says "Films". It is
  server-rendered and describes somebody else's library, so it needs the medium
  on the wire before it can say anything else.
- **`Person.role` is still `"director" | "actor"`** on stored, synced data. Only
  the labels change.
