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

**State (16 Aug 2026):** Session J, closed. Everything is committed, pushed to
`origin/master`, and deployed to production. There is no side branch — `master` is what is
live.

**415 tests, typecheck clean, `next build` clean, lint at 2 problems in `src`** — both are
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

**Session J (`890d3f0` … `bbd47c7`) — onboarding, Rough Cut, and three data bugs.**
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
- **It draws no chart, deliberately.** A tier map was built for this app twice and
  rejected twice as "chunky". The counts ARE the readout: `13 of 14 still to rank`.
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
3. **Tier cards, and the `runRequest` collapse.** A tier card is a live view over
   `rankedFilms(films).slice(0,10)` — NOT a curated run, because a KotH tier run already
   writes scores and a second cross-tier order would contradict it. **This is also the
   Profile Card's "Top 10" slot** (#11), described from the other direction. Do the prop
   collapse with it: `personRun` / `personGuests` / `personPortrait` plus the genre run are
   already two effects reaching for `state.session`, and resume would make it three. They
   cannot race today because only one is ever set at a time, but that is a property nobody
   is enforcing.
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

## Waiting on the user — nothing else blocks this

- **Publish the OAuth consent screen.** Google Cloud console → **Google Auth Platform** →
  **Audience** → *Publish app*. While it says *Testing*, only accounts on the test-user list
  can sign in and everyone else gets a flat `access_denied`. Rankd asks only for name and
  email — non-sensitive scopes — so publishing needs **no verification review** and takes
  effect immediately. **Until this is done the app cannot be handed to anybody.**
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

- **Fast Shuffle is next on the block.** Session I: "I might get rid of fast shuffle too -
  pending." Deliberately NOT touched while removing Spotlight, because they are separate
  questions and doing both at once would have made one revert impossible without the other.
  **If it goes, check what depends on it first** — that is the lesson Spotlight taught, and
  `ShuffleDuel` is reused by the person-run path.
- **Fast Shuffle may not deserve to exist.** From watching real people use the app: they
  "hardly like the idea of something else shuffling their list for them." **Deferred to the
  very end deliberately** — it is a question about what the app is for, not a bug. The person
  run no longer depends on it.
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
