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
- **Two Sheet implementations.** `ui.tsx` (z-30 scrim, pull-to-close, 400ms backdrop
  arming, animated exit) and `Sheet.tsx` (z-40, no pull, no arming, instant unmount). The
  duplication is knowingly documented but the two behave differently.
- **Sheets can stack.** `modeOpen`, `tierOpen` and `curatedOpen` are three independent
  booleans in `DuelScreen.tsx`; mutual exclusion is done by hand at each transition, so a
  missed pairing leaves two scrims on top of each other. The nav is deliberately above the
  scrim, so "Log a film" can be opened over an open Play sheet.
- **Existing guards are for ghost clicks, not stacking** — `SCRIM_ARM_MS`, `toggleModes`,
  `toggleLog`.

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
