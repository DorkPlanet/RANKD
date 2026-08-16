# Potential features

Ideas that have been thought through but deliberately not built. Each one says what it is,
why it is parked, and what would have to be true first.

This is a holding pen, not a roadmap. Nothing here is committed.

---

## The editable list

**The big one.** Five separate pieces of feedback turned out to be this single problem:

- unlock and reorder a film from the list view
- adjust the order before confirming it, at the end of a run
- a ratings audit — go back over a finished list and tighten it
- "what if I put a film in the wrong pile?"
- exporting adjusted ratings back to Letterboxd

They all say the same thing: **once the list is ordered, it cannot be edited.** Every
mechanic in the app is earn-it-by-duelling. Nothing is assert-it. A hard lock is the user's
commitment and there is no per-film way to take it back — only the two bulk resets in
Settings ("Drop the N the app placed", "Clear my ranking").

### What a full audit would need

A move that crosses a tier boundary has to be able to **change the film's star rating**.
Today the only route by which a rating ever changes through play is promotion
(`ladder.ts` — beat the tier above, or take it outright). An audit that cannot re-rate is
just reshuffling within a band, which is the thing that already works.

That re-rating is what makes the Letterboxd round-trip meaningful, and the round-trip is
cheap once it exists: `importCsv.ts` reads `Name,Year,Rating` in half-stars, which is
exactly the tier scale, so the export is the same file with new numbers.

**Parked because:** the decision was to test the current system before complicating it.
Adjusting from the list view is wanted alongside the full audit, not instead of it.

---

## Daily Check

A handful of films chosen each day to check against. Bring people back daily, and
periodically re-confirm the list.

How it would work: pick a film at random, pair it against its neighbours either side,
5–10 duels maximum, then review whether anything changed and ask for confirmation before
moving it.

**Parked because:** its final step — "confirm this film should move" — *is* the edit
mechanic above. Building Daily Check first means building that twice.

---

## Fast Shuffle, reframed as the lazy mode

**The idea.** Reframe Fast Shuffle as a mindless mode: infinite pairs, no piles, no
climbing, no confirming. Keep answering and the model's confidence climbs until the order
*should* be right without anyone having hand-curated it. For people who want to enjoy the
app without caring about perfect curation. It takes nothing away from Rough Cut or King of
the Hill, and actually ranking something stays the real thing.

**This is mostly a reframe, not a build — which is the good news.** The mechanic already
works exactly as described. `matchmaker.ts` serves whichever pair the model can least
predict, `bayes.ts` keeps a mean and a spread per film, and a shuffle answer moves the
belief without ever hard-locking anything. The lazy mode is already in there; the app just
never says so.

**What is actually missing is the payoff.** Nothing on screen ever tells you the model is
getting more sure. You answer, the posters change, and there is no sense of accumulating
anything — which is precisely why it reads as aimless rather than as a mode with a point.
The number needed already exists as `spread`. Surfacing it, per tier or across the
library, is what turns a loop into a mode.

**The hierarchy is already in the data, and must stay visible.** A shuffle answer writes a
soft lock; a King of the Hill confirm writes a hard one. The list already draws the
difference — gold and bold for "you placed this", dim for "placed by the evidence". That
distinction is the thing that keeps ranking the be-all and end-all, and it is doing real
work today.

**The risk to design around.** Say "94% confident" and people will read it as finished and
stop. For the lazy user that is the point and it is fine. But the two kinds of position
must not become indistinguishable, or the app's central claim — that you decided this —
quietly dilutes into a claim that a model guessed it. Whatever the confidence readout
looks like, it should read as *the app's belief about your taste*, never as *your
ranking*. The wording matters more than the number.

**Worth checking before building:** whether confidence over a large library moves at all
on a human timescale. The old library progress bars were removed for exactly this reason —
at 861 films one duel moved them a quarter of a pixel, and a meter that cannot visibly
respond to what you just did is furniture. Per tier is more likely to feel alive than
across the whole library.

---

## Rough Cut: placing a film blind

**The problem, which is real.** You are asked to file a film into upper, middle or lower
without being able to hold the whole tier in your head. Early decisions are guesses, and
you only find out they were wrong later.

**The proposal:** show up to four films at once, select several, drop them into a bracket
together, and let the page refill.

**Why not this first.** It costs the thing that makes the mode work. Today it is one tap
or one flick per film; select-then-drop is two actions, so four films become five
interactions instead of four and most of the batching gain disappears. The flick gestures
do not survive four cards either — you would need drag-to-target, which is fussier on a
phone. And comparing four films against each other is a small sort, which drifts the mode
toward the thing it exists to avoid.

**Try instead: reference thumbnails.** Show the last one or two films filed under each
bracket, small, above the buttons. Every decision then becomes relative to what you have
already done rather than to a tier you cannot remember. No new gesture, no change to the
mechanic, and it attacks the actual complaint.

**Also already true:** "Split again" catches wrong-box films on a second pass, and that
pass is cheap. The counts over each bracket help a little too.

If thumbnails ship and it still feels blind, multi-select is the next step — and by then
we will know it earned it.

---

## Badge icons

~29 badges in `src/lib/achievements.ts` all render the same filled or hollow star
(`Trophies.tsx:28`).

Line-art SVGs matching the existing set in `src/components/Icons.tsx` — the same 24×24
stroke style as `TrophyIcon`, `LockIcon`, `ClimbArrow`. Not emoji. Grouped by family so
each shares a motif: library size, films settled, duels fought, rating spread, decades,
genres and people, watch time.

`Achievement` would gain an `icon` field. Unknown ids must fall back to the star so a newly
added badge cannot render blank.

**Parked because:** 29 bespoke drawings is a large chunk on its own and the scrapbook
layout is worth more first.

---

## Activity tab

The nav cell exists and shows a "coming soon" pill (`DuelScreen.tsx`). The profile
scrapbook is its natural first tenant; sharing is the eventual one.

---

## Usernames

Google sign-in already works end to end (`src/lib/auth.ts`, `src/lib/account.ts`). The
database already has `users.handle` as a nullable column with a case-insensitive unique
index — **nothing reads or writes it.**

So this is not an auth job. What is missing is:

- a claim flow with a debounced availability check
- validation: charset, length, normalisation, a reserved-word list (`admin`, `api`, …)
- handling the unique-index violation
- somewhere to do it — there is no onboarding form after sign-in
- syncing the local `profile.name` with the server's `display_name`, which can currently
  disagree forever

Also absent and probably wanted alongside: delete account, change email, server-side data
export.

---

## Imports from other sites

IMDb, TMDb and Trakt all export CSVs with different column names. `importCsv.ts` already
parses by header name rather than column position, so this is mostly a mapping table.

---

## Consistency and break-it pass

A full audit of gestures, text, drawers and menus across every mode — including actively
trying to break the app by stacking sheets and switching modes mid-game.

Groundwork already gathered:

- **Rough Cut has no gesture for Middle.** Flick up files to the top pile, flick down to
  the bottom, and the middle is tap-only.
- **Fast Shuffle silently ignores flicks.** It passes `noop` for `onFlick`/`onSink`, so a
  gesture that works on the duel screen does nothing here with no feedback.
- **Two Sheet implementations, and three hand-rolled copies.** `ui.tsx` (z-30 scrim,
  pull-to-close, 400ms backdrop arming, animated exit, stops at `var(--nav-h)`) and
  `Sheet.tsx` (z-40 `inset-0`, no pull, no arming, instant unmount, paints over the nav).
  The duplication is knowingly documented; what is not documented is that
  `CollectionSheet` and `EditIdentity` in `ProfileScreen.tsx` and `AvatarCropper.tsx` each
  repeat `Sheet.tsx`'s markup rather than using it. **This is the one real item left in
  this section.** Session K made every overlay mutually exclusive, which removed the sharp
  edge — two of these can no longer be on screen together — so what remains is that a
  reader meets two different dismissal behaviours depending on which panel they opened.
  Consolidating is a design decision (does a sheet animate out or not?) before it is a
  refactor.
- ~~**Sheets can stack.**~~ Fixed in Session K. `AppShell` owns a single `Overlay` union
  and `go()` empties it. `DuelScreen`'s `modeOpen` / `tierOpen` / `curatedOpen` are still
  three booleans, but they are a deliberate setup SEQUENCE and each transition already
  closes the last; they were left alone rather than forced into a union that would fight
  the flow. The nav is still deliberately above the scrim — but "Log a film" no longer
  renders inside it, so it can no longer paint over the bar.
- **Existing guards are for ghost clicks, not stacking** — `SCRIM_ARM_MS`, `toggleModes`,
  and `toggleLog`, which moved to `AppShell` with the sheet it drives.

---

## Going full scale

Not a code task. What it needs to cover, in plain language:

- what hosting actually costs as usage grows, and where the cliffs are
- posting on Reddit to find testers without handing over the idea
- what you legally owe users once you hold their data — and how little of it you can
  choose to hold
- what "real" looks like versus a bedroom project

---

## Notes

- The sign-in reload in `sync.ts` `pull()` (`window.location.reload()`) is still the main
  suspect for the jitter after signing in. **Unproven** — it has never been reproduced
  locally, because the signed-in flow needs auth configured. Confirm before touching it;
  replacing it means hand-reconciling React state across `AppShell`, which risks
  stale-library bugs worse than a slow sign-in.
- `src/lib/sync.ts` shows as binary in git diffs. Probably a stray null byte or BOM.
  Harmless, but it makes the file's history unreadable.
