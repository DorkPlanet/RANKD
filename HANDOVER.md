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

**State:** everything on master is pushed AND deployed — check with `git log --oneline -1`
against the live bundle rather than assuming. **Accounts live on the `accounts` branch,
deliberately unmerged and undeployed** (see Pinned). **305 tests on master, typecheck
clean, lint at 3 problems in `src`** — 2 pre-existing `AppShell` set-state-in-effect
errors + 1 unused `tier` in `Rolodex`. **That is the baseline. Do not "fix" them, and do
not add a fourth.** The `accounts` branch adds 24 tests of its own on top.

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

**Session F (this one) — the duel screen's top zone, and the review card.** See the
first two entries under "Next, in order", both now landed, and the two decision blocks
below.

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

**Reordered 13 Aug 2026** against eleven pieces of feedback from real use. Reasoning and
the code findings behind the order are at
`C:\Users\jarra\.claude\plans\foamy-painting-hammock.md` (Part Two); the older plan at
`distributed-conjuring-oasis.md` still holds for items 6 and 9.

**Items 1–6 are all small, and three of them are things the user described as not
feeling right.** That is trust decay, it is cheap to reverse, and it gets cleared before
anything new is built.

1. ~~The progress bars~~ **LANDED.** They were misnamed, not miscounted: `SHUFFLED` counted
   films that had fought ≥1 duel while `UN-RNKD` meant no position at all, so the bar hit
   100% over a list of UN-RNKD pills. Now COMPARED / RANKED, one vocabulary with the list
   and the pills. The two library-wide bars then left the duel screen entirely — at 861
   films one duel moved them 0.24px, so they could not respond to anything. `RunBars` is
   one unlabelled track plus a session line, and is due a rename (one bar, not bars).
2. ~~The review card~~ **LANDED.** Two bugs compounding: "Not now" called a permanent
   dismiss, and because only `review[0]` renders, waving one away promoted the next
   instantly. Now a 14-day snooze, a separate quieter "Never", and a 20-hour cooldown
   after any answer — checked BEFORE the belief fit, so the quiet period costs nothing.
   v1's bare id array migrates to mutes.
3. ~~Reset, with granularity~~ **LANDED.** Two acts, not two degrees. "Drop the N the
   model placed" is `withdrawSoftLocks` finally given a UI (that IS #24) — cheap, no
   confirm, nothing lost. "Clear the whole ranking" is `resetRanking` plus `clearLog`,
   arms before it fires, and names the counts it is about to destroy.
   - **The log HAD to go with it.** Soft locks are granted from beliefs and beliefs are
     fitted from the log, so a reset that spared the evidence refills the list with the
     order you were leaving. `clearLog()` is the second and last exception to
     append-only and has exactly one caller — keep it that way.
   - Films, star ratings, artwork and credits are always kept. Scores return to
     `seedScore(rating)`, because an unranked library that keeps its old scores still
     sorts itself into last session's order.
4. ~~Fast Shuffle animation~~ **LANDED, and the backlog entry was wrong.** `ShuffleDuel`
   DID call `fadeLoserOut`, and it deliberately does not fly the winner across — there is
   no climbing seat there and both films are peers. The real gap was that **only the loser
   animated**, so the film you chose did nothing and the moment read as a card vanishing.
   `liftWinner` fixes that without implying a position. Two other parity bugs went with it:
   both cards fell through to the same lean (`side` now separates lean from `pick`), and
   the controls were still pills.
5. ~~King of the Hill in shuffled order~~ **ALREADY EXISTS.** `ShuffleRow` in the KotH
   setup: "Shuffle the order — face films in a random order instead of weakest first." It
   skips no duels; only the starting order changes. **This is a discoverability problem,
   not a missing feature** — the user asked for something already built, buried in setup.
6. ~~Many more badges~~ **LANDED.** 11 → 34. All still derived, so they apply
   retroactively and need no migration. New ones draw on decades, genres, directors,
   actors, runtime, the full star scale, and `fingerprint`/`topPeople`.
   - **Kept honest:** anything about *settling* still counts HARD locks only. A badge for
     owning films is not a badge for ranking them.
7. **ROUGH CUT — the answer to large tiers, and it replaces most of what was here.**

   The problem was never the gestures. `ladder.ts` costs **n(n-1)/2 duels** to rank a tier,
   and 3★ holds 185 films — several thousand comparisons. Bottom-locks, armed strip taps,
   sink-to-settle and a reverse climb were all constant-factor patches on a quadratic sort.

   **The fix is bucketing, which is how anyone sorts a large pile of cards.** One pass over
   the tier, one decision per film — upper / middle / lower third — no comparisons at all.
   185 taps instead of thousands of duels, and every decision still the user's.

   **Why it needs no engine change:** `poolFor` sorts the pile BY SCORE, so the climb's
   order is score order. Rough Cut writes better scores; insertion sort on a nearly-sorted
   pile is close to linear. `ladder.ts` is untouched.

   - **Writes scores, never log rows.** No pair was compared, so inventing judgements would
     be a lie — and the whole app rests on the log being true.
   - **No locks.** It is coarse, not a commitment. Films stay UN-RNKD; the climb afterwards
     is simply far cheaper.
   - **Composable:** within each third, films keep their existing relative order and spread
     across the new sub-band, so a second pass refines to ninths.
   - **Absorbs the gestures rather than adding to them:** flick up = upper, flick down =
     lower. Bottom-locking stops being a feature and becomes "lower pile, used a lot".

   **Deleted from this backlog because Rough Cut subsumes them:** lock-at-the-bottom, the
   reverse climb, sink-to-settle, batch-the-tail, and the armed lock on the film strip.
   Three separate mechanisms for "get this film out of my way" collapse into one.
8. **Fast reorder and lock/unlock from the list view.** The dragging is not the hard part.
   **`ROW_H = 96` drives section spacers and tier-jump offsets, nothing may change a row's
   height, and nothing new goes inside the list scroller** — drag handles and lock toggles
   want to violate both. That constraint IS this item.
9. **Tier cards, and the `runRequest` collapse.** A tier card is a live view over
   `rankedFilms(films).slice(0,10)` — NOT a curated run, because a KotH tier run already
   writes scores and a second cross-tier order would contradict it. **This is also the
   Profile Card's "Top 10" slot** (#11), described from the other direction. Do the prop
   collapse with it: `personRun` / `personGuests` / `personPortrait` plus the genre run are
   already two effects reaching for `state.session`, and resume would make it three. They
   cannot race today because only one is ever set at a time, but that is a property nobody
   is enforcing.
10. **Opening and returning to the app.** EXPLORATION, not implementation — the user can
    feel something missing and cannot yet name it. Sequenced BEFORE the profile redesign
    deliberately: the answer may change what the profile is for.
11. **Profile card slots + persistence + JPG re-export.** Empty slots for Top 10, favourite
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
12. **Profile page redesign**, toward what the JPG export looks like. Wants #10's answer
    and #11's structures first.
13. **Upload a profile picture.** The one item genuinely blocked: `profile.ts` deliberately
    stores NO images — a banner is a film id and a still URL, so the whole profile costs a
    few hundred bytes. Real uploads need server storage, which needs the pinned accounts
    work. **An unblocked version exists now:** choose an avatar from artwork already in the
    library, exactly as `bannerStill` already works.
14. **Resume an in-progress curated run.** `lib/runs.ts` (`rankd-runs-v1`) holding subject,
    session and **`guests: Film[]` in full** — ids alone lose every unseen film.
    `adoptRun(films, session)` belongs in `ladder.ts` with its own tests. Stays device-local
    forever; it is deliberately excluded from the synced payload.
15. **#14 design pass** — `SessionEnd`, `PersonSheet`, `LogFilm`, `RunBars` ship PROVISIONAL.

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
