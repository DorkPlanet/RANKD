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

**State:** last commit `c85d60e`, pushed. Deployed through `92d03dd`. **261 tests, typecheck clean, lint at 3 problems
in `src`** — 2 pre-existing `AppShell` set-state-in-effect errors + 1 unused `tier` in
`Rolodex`. **That is the baseline. Do not "fix" them, and do not add a fourth.**

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

## Next, in order

**The full plan with reasoning is at**
`C:\Users\jarra\.claude\plans\distributed-conjuring-oasis.md`. Summarised here so this file
stands alone.

1. **The single Director / Actor / Genre button** in the Play sheet. Today a person run is reachable only by opening a film and tapping its
   director, which is why it feels hidden. **Collapse `personRun` / `personGuests` /
   `personPortrait` into one `runRequest` prop first** — otherwise director, actor, genre
   and resume become four effects racing to own `state.session`. Genre needs a size cap
   ("Drama" is ~300 films in a real library). **A tier card is a live view over
   `rankedFilms(films).slice(0,10)`**, not a curated run — a KotH tier run already writes
   scores, and a second cross-tier order would contradict it.
2. **Profile library + auto-save.** Nothing reads saved lists back. Needs `SavedEntry` to
   gain `rating`/`genres`/`director` (**without `rating` a saved list cannot re-render its
   own card — an existing bug**), a `{v:2, lists}` payload with in-memory migration,
   auto-save with a floor (complete, or ≥half the pile confirmed), and a "YOUR RANKINGS"
   shelf on `ProfileScreen`.
   - **`backup.ts` trap:** its restore loop `removeItem`s any key absent from the file, and
     line 68 is a strict `format !== FORMAT`. Adding `rankd-lists-v1` to `KEYS` naively means
     **restoring an older backup deletes every saved ranking**. Needs a per-format key set.
     `rankd-review-dismissed-v1` is also missing from the manifest.
3. **Resume an in-progress curated run.** `lib/runs.ts` (`rankd-runs-v1`) holding subject,
   session and **`guests: Film[]` in full** — ids alone lose every unseen film.
   `adoptRun(films, session)` belongs in `ladder.ts` with its own tests.
4. **Fast Shuffle has no fly-across animation.** `flyPosterAcross` / `fadeLoserOut` are
   exported already; `ShuffleDuel` just never used them.
5. **Reset, with granularity — and #24 turns out to be half of it.** The user wants to start
   over with separate control over **soft** locks (`withdrawSoftLocks()` is built, tested and
   simply has no UI — that IS #24) and **hard** locks. Keep the library and star ratings;
   offer the backup export first.
6. **#14 design pass** — `SessionEnd`, `PersonSheet`, `LogFilm`, `RunBars` ship PROVISIONAL.

## Backlog — captured, not scheduled

- **A switch to turn Fast Shuffle off entirely.** The user is cooling on it and wants to opt
  out rather than have it removed for everyone.

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
- **Verify by looking at rendered output, not stored state.** Every card defect this project
  has had — a row through the footer, a label through a name, a stat contradicting its own
  insight — passed typecheck and tests and was only visible in the exported JPEG.
- Commit messages: write to a file and use `git commit -F`. PowerShell here-strings mangle
  quotes.
- The preview pane does not composite: animations never *finish* there.
- `test/fixtures/ratings.csv` is gitignored; `import.test.ts` skips loudly without it.
