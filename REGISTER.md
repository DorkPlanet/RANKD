# ⚑ REGISTER — every open idea, in one place

**This file exists because the register used to live outside the repo**, in a
plans directory, unversioned — while `COPY.md`, `VOICE.md` and `HOW-IT-WORKS.md`
all sat in git. It was the most valuable of the four and the only one a lost
laptop would have taken with it. Moved in at the close of Session M.

**What this is:** every idea, complaint, finding and piece of parked work from
the competitive research and the sessions that followed it. Nothing here is
scheduled. `HANDOVER.md` holds what is BUILT and what must not be touched; this
holds what is not built and why.

**Status vocabulary:** `OPEN` · `PARKED` (a decision was taken to wait) ·
`NEEDS PHONE` · `NEEDS DECISION` · `DONE` · `RESOLVED`.

---

## Closed in Session M (20–21 Aug 2026)

Recorded so nobody re-opens them from the sections below, which are left intact
rather than edited item by item.

| ID | What landed |
|---|---|
| G1 | The copy inventory. All 506 user-facing strings, `COPY.md`. |
| G2 | The seven tells, in `COPY.md`'s diagnosis. Tell 7 — explaining rather than recognising — is the root of the other six. |
| G3 | `VOICE.md`. Thirteen rules, derived from the user's own copy and corrections. |
| G4 | The sweep, in part: the headline, contractions, every em dash, the four mode blurbs and all four tours. Roughly 460 strings remain unreviewed. |
| H2 | `HOW-IT-WORKS.md` — the five things the app never explains. |
| E1 | The taste chart, built from settled positions rather than win rates. |
| F2 | Settled positions as the chart's source, replacing the biased duel log. |
| F3 | The was/then, as a before/after ON the chart. |
| N2 | Locked versus believed, said where a phone can read it. It was in a `title` tooltip. |
| N6 | Cross-tier belief means are not calibrated. Fixed on the film card, recorded as a standing trap. |
| P3 | The panels renamed: **Your taste** and **Your results**. Data versus what you chose. |
| P4 | Panel two's shelves became a two-up grid of exports. |
| P5 | The de-boxing reached the person cards, the trophy case and the stats band. |
| E7 | Gradients allowed if tasteful. The blanket ban is lifted in `HANDOVER.md`, with a tombstone. |
| I1 | That lifting, recorded. |

**Also shipped, and not previously in this register:** the app opens on the game
rather than the profile · Fast Shuffle launching at all · one button on the RNK
screen instead of two · the genre ring · the passport · the named notes ·
follow-the-finger panel swiping · the section rules.

**The Fast Shuffle lockup is fixed** and its four lessons are in `HANDOVER.md`'s
gotchas rather than here, because they are about how this code behaves rather
than about what to build next.

---


## A · Verification debt — shipped, never confirmed on a device

Nothing else should outrank A1. It can invalidate work in every other section.

| ID | Item | Status |
|---|---|---|
| A1 | **Aeroplane mode after signing in once must land in your library, not the sign-in wall.** `fetchSession` answering `unknown` → `hasSignedInBefore()`. Unit-tested; the real combination of service worker + cached page + no network is not reproducible on desktop. **If broken, the gate is locking people out of their own libraries.** | NEEDS PHONE |
| A2 | A stranger's first open: splash → sign-in → app, nothing of the app visible before signing in | NEEDS PHONE |
| A3 | Add to iPhone home screen — address bar gone, icon reads properly. Every tag verified in the rendered head; "no address bar" is still a claim about an untested device | NEEDS PHONE |
| A4 | Google sign-in from a fullscreen PWA can bounce out to the browser and back on iOS | NEEDS PHONE |
| A5 | Upload a real photograph through the cropper (off-centre is the case that matters) | NEEDS PHONE |
| A6 | Confirm a feedback email actually **arrives**. Resend answered `{"ok":true}`, which proves the endpoint and says nothing about delivery | NEEDS PHONE |
| A7 | Avatar appearing immediately after upload (cache-busting version in the URL) | NEEDS PHONE |
| A8 | Sync feeling quieter — unchanged library no longer re-uploads 468KB | NEEDS PHONE |
| A9 | "Delete everything" while signed in **on two devices**. Nothing may come back on either | NEEDS DEPLOY |
| A12 | **"Clear my ranking" on one device, then sync, with a second device still holding the duels.** The chooser must still appear — that is the one case N8 deliberately left asking, and it is the only thing standing between a deliberate reset and having the ranking merged straight back. Unit-tested; the two-real-devices version is not | NEEDS PHONE |
| A10 | Sign-in jitter. Suspect is `window.location.reload()` in `pull()`. **UNPROVEN — do not replace on the theory** | OPEN |
| A11 | The seam and the drawer gap: **DO NOT CHASE.** User has said they look right | CLOSED BY USER |

---

## B · The app's scheduled work (`HANDOVER.md` → "Next, in order")

| ID | Item | Status |
|---|---|---|
| B2 | **Also now carries N26.** Reordering a film across one you locked belongs HERE, as something you did deliberately with a drag, rather than as a side effect of a Refine run asking for more confidence. **THE EDITABLE LIST — the biggest thing outstanding and the user's founding idea.** Five separate pieces of feedback are this one problem: unlock and reorder from the list, adjust before confirming at the end of a run, a ratings audit, "what if I put a film in the wrong pile", and exporting adjusted ratings back to Letterboxd. Every mechanic is earn-it-by-duelling; **nothing is assert-it**. A full audit must be able to **change a star rating** when a move crosses a tier boundary, or it is just reshuffling within a band. The Letterboxd round trip is then nearly free — `importCsv.ts` reads half-stars, which is exactly the tier scale. Hard constraint: `ROW_H = 96` drives spacers and tier-jump offsets, nothing may change a row's height, and nothing new goes inside the list scroller — drag handles and lock toggles want to violate both | PARKED by user (test the current system first) |
| B5 | **Profile page redesign.** Structural pass landed in Session I (Zones: What you like · What you've made · Where it stands). Visual direction was open and waiting on a steer. **The screenshots supplied on 20 Aug are that steer** — see section E | OPEN, now unblocked |
| B7 | **Resume an in-progress curated run.** `lib/runs.ts` holding subject, session and `guests: Film[]` in full (ids alone lose every unseen film). `adoptRun` belongs in `ladder.ts` with its own tests. Device-local forever, excluded from sync. Cheapest contained win on this list; `RunRequest` is already the shape it rebuilds into | OPEN |
| B8 | **#14 design pass** — `SessionEnd`, `PersonSheet`, `LogFilm`, `RunBars` all ship marked PROVISIONAL. Rough Cut came off this list in Session I when it got its motion pass | OPEN |

Landed and recorded so nobody re-opens them: B1 onboarding coach marks, B3 tier cards +
`runRequest` collapse, B4 profile card slots + JPG re-export, B6 profile picture upload.

---

## C · Parked and held (`POTENTIAL-FEATURES.md`)

| ID | Item | Status |
|---|---|---|
| C1 | **Daily Check** — a few films a day, paired against their neighbours, 5–10 duels, confirm before moving. Its final step **is** B2's edit mechanic, so building it first means building that twice | PARKED behind B2 |
| C2 | **Fast Shuffle as the lazy mode.** Mostly a reframe, not a build — the mechanic already works. What is missing is the payoff: nothing tells you the model is getting surer. `spread` already exists in `bayes.ts`. Risk to design around: "94% confident" reads as finished. It must read as *the app's belief about your taste*, never as *your ranking*. Check first whether confidence over 861 films moves at all on a human timescale — per tier is likelier to feel alive | **LARGELY DONE 21 Aug.** The payoff exists: both figures on the Fast Shuffle screen now report how many films the model has WORKED OUT rather than how many it has merely duelled. The old measure saturated after one duel per film — at that point median confidence is 0.313 and nothing has been placed, yet the screen read "0 films to go", which is what the user saw. The scope is the pool, so it is already per-tier or per-person whenever the run is. **Still open:** a literal confidence figure, if one is ever wanted. It probably is not — placed-of-pool is honest, moves, and reaches 100%, where a raw confidence percentage would stall near 80% because confidence saturates, and would read as broken |
| C3 | **Rough Cut: placing a film blind.** Real problem. Rejected fix: show four films and multi-select (costs the one-tap-per-film economics and drifts toward a small sort). **Try instead: reference thumbnails** — the last one or two films filed under each bracket, small, above the buttons | OPEN |
| C4 | **Badge icons.** ~29 badges in `achievements.ts` all render the same filled/hollow star. Line-art SVGs matching `Icons.tsx`, grouped by family. `Achievement` gains an `icon` field; unknown ids fall back to the star | PARKED |
| C5 | **Activity tab.** The nav cell exists and shows a "coming soon" pill. Profile scrapbook is its natural first tenant; sharing is the eventual one | OPEN — see D2 |
| C6 | **Usernames.** `users.handle` exists as a nullable column with a case-insensitive unique index and **nothing reads or writes it.** Needs: a claim flow with debounced availability, validation + reserved words, unique-violation handling, somewhere to do it (there is no onboarding form after sign-in), and syncing local `profile.name` with server `display_name`. Probably wanted alongside: delete account, change email, server-side export | OPEN |
| C7 | **Imports from IMDb / TMDb / Trakt.** `importCsv.ts` parses by header name, so mostly a mapping table | OPEN — see D6 |
| C8 | **Consistency and break-it pass.** Rough Cut has **no gesture for Middle** (tap-only). Fast Shuffle **silently ignores flicks** (passes `noop`). **Two Sheet implementations plus three hand-rolled copies** — `ui.tsx` and `Sheet.tsx` behave differently on dismissal, and `CollectionSheet`, `EditIdentity` and `AvatarCropper` each repeat the markup. Consolidating is a design decision before it is a refactor | OPEN |
| C9 | **Going full scale.** Not a code task: hosting costs and where the cliffs are, posting on Reddit to find testers without handing over the idea, what you legally owe users once you hold their data, what "real" looks like versus a bedroom project | OPEN — overlaps D |
| C10 | **The account as the real source of truth.** Blocked on the schema: `libraries` is one row per user with a single 468KB `payload jsonb`, and Postgres cannot update jsonb in place. Needs a `film` row per (user, film) and a `judgement` row per duel. Costs the shared wire/file format, makes the duel loop async across ~12 call sites, and turns the credits sweep into 861 requests. **Do not start until something needs it** — a social feature where another person reads your data, or a library big enough to be slow | PARKED, correctly |
| C11 | **Remove the signed-out code paths.** Smaller than it looks. Condition 3 is the live one: *there must be something an account is FOR beyond sync.* Until then the gate charges a price the product has not built the thing for — **an argument for possibly lifting it rather than cementing it** | PARKED |
| C12 | **Log a film is still a multi-step flow** for what is usually "I watched a thing, give it stars". Trace `LogFilm.tsx` for whether the common case is one screen with the rest behind a "more" | OPEN |
| C13 | **The profile shows full density from film two.** Every screen has a zero state; nothing has a **thin** state. Folds into B5 | OPEN |
| C14 | **The film strip's "up next" is an approximation** — grabs same-tier films rather than asking the matchmaker. A true lookahead means pre-computing one pair ahead in `matchmaker.ts` | OPEN |
| C15 | **Multi-medium — books, music.** The engine is genuinely medium-agnostic: `ladder.ts` and `bayes.ts` know ids and ratings, not films. What is film-specific is TMDb, the poster path, and every piece of copy. **Honest scope: not the ranking, all the furniture** | OPEN — see D14 |
| C16 | A switch to turn Fast Shuffle **off** entirely — opt out rather than remove for everyone. **Better founded now that C18 is decided**: this was the compromise position while removal was live, and it is the right shape permanently. Somebody who wants only placements they made themselves should be able to say so, and that is the same setting as Settings' "Drop the N the app placed" | OPEN |
| C17 | **Subgenre runs** — "zombie films" rather than "horror". A keyword is narrow enough to have a real edge, so unlike a genre it could borrow unseen films the way a director run does. `topPeople` already derives subgenres from `f.keywords` | OPEN |
| C18 | **Fast Shuffle stays — DECIDED by the user, 21 Aug 2026.** The old entry read "may not deserve to exist", from watching real people who "hardly like the idea of something else shuffling their list for them." F4 showed that objection was to it being unexplained and unbounded, not to it existing. **Do not re-open this.** What is left is the rebrand, which is F4, not a question | CLOSED — decided, keep |
| C19 | **"Finishing a run doesn't feel like anything."** Partly answered by the cards; re-judge on a phone | OPEN — see F3 |
| C20 | Known wart: a brand-new phone hits the conflict chooser rather than a silent pull, because the credits sweep writes the seed library within seconds and marks the browser dirty. Fix: treat a library still exactly equal to `SEED_FILMS` as absent | OPEN |
| C21 | `src/lib/sync.ts` shows as **binary in git diffs.** ~~Probably a stray null byte or BOM.~~ **DIAGNOSED 21 Aug 2026 and the old guess was dangerous.** There are exactly two NUL bytes and they are DELIBERATE: `fingerprint` joins each key and value with a literal `\0` so a value containing the delimiter cannot forge a boundary. Deleting them — which is what "stray" invites, and what a cleanup script nearly did — changes every sync hash the app has ever computed. **The fix is a `.gitattributes` entry marking the file as text, never an edit to the file.** Harmless as it stands; only the history is unreadable | OPEN — but do NOT "clean" the file |

---

## D · Competitive response (research, 19–20 Aug 2026)

### Take

| ID | Item |
|---|---|
| D1 | **A named taste identity.** Shortlist ships four parts and Rankd should ship all four: a **named character** ("The Fair Drama Purist"), **Genre DNA**, **your era**, and **your hottest take**. Rankd's version is better by construction because it comes from your *order* rather than a library census. `lib/insight.ts` is most of the way there and its count preconditions apply (≥4 rated films for a rating claim, a genre needs ≥3 entries **and** ≥40%, ≥60% coverage for optional fields). Carry C2's constraint: belief about taste, never "your ranking". **REVISED 20 Aug** — originally specified as duel-derived ("what you chose when it was close"). F1 showed the duel log is not a taste sample; F2 replaces it with settled positions. The *claim* is unchanged, the data source is not |
| D2 | **Parallel Cut over saved lists** — two ranked lists side by side, agreement score, biggest disagreement called out, shareable as an image. **Over saved lists, never over live libraries** — live libraries trigger C10 |
| D3 | ~~**Confidence readout, per tier**~~ **DONE 21 Aug.** Fast Shuffle's bar and countdown both report placed-of-pool, and the pool is whatever scope the run was started on. The warning in the original entry held exactly as written: the old readout was a library-scale measure that could not respond to anything you did |
| D4b | ~~**A bounded session shape.**~~ **DONE 21 Aug 2026.** Fast Shuffle takes a length — 100, 250, 500 or no limit, defaulting to 250 — and ends itself. **The design choice inside it was the real question**, and the user's instinct settled it: a target that ENDS the session, not a slice of N films shuffled to completion. Fencing the matchmaker into a subset takes away its judgement about which question is worth asking and spends every duel inside a pen, finishing an arbitrary patch and leaving the rest untouched. **It also solves N11 sideways:** duels-left moves by exactly one on every tap and ends at zero, which is the responsive readout the mode never had. Films-worked-out survives as the no-limit fallback |
| D4 | **A bounded session shape.** Canonova's 1-vs-10 and Popcorn List's short bursts both have a stated end. Answers C19. **Closer than it was:** the countdown now names a real, shrinking quantity — films the model has yet to work out — where before it hit zero after one pass and stayed there. That is a stated end for the SCOPE. A stated end for the SITTING is still missing | OPEN |
| D5 | **A headline.** Flickchart's front page: *"If they're all 5-star movies… Which one's the best?"* That is Rankd's pitch, written better than Rankd writes it |
| D6 | **IMDb / TMDb / Trakt import** — from the market, not a competitor. Every rival is Letterboxd-only or nothing. Same as C7 |
| D7 | **Badge art.** Same as C4. Shortlist and Montir both ship real icons |
| D8 | **A "too close to call" answer.** Shortlist offers it; Rankd forces a pick. A tie is real information for a Bayesian fit and is currently discarded as a skip |
| D9 | **Playful surface, protected core.** Popcorn List is the least serious-looking, has 7× anyone's traction, and charges $69.99 lifetime. Applies to the front door, empty state and card — **not** the compare screen |
| D10 | **A public counter.** "500K+ Movies Ranked" is free social proof. Rankd has real numbers and shows none |

### Replace

| ID | Item |
|---|---|
| D11 | **The front door.** The sign-in wall is what a stranger meets and it sells nothing. Replace with the pitch, the import, and the big-library promise. The gate can live behind that; it cannot be it. Ties to C11 |
| D12 | **Rough Cut's position.** It answers the only problem no competitor has solved and is the fastest route from zero to a shaped list. Currently one mode among several; should be the offer |
| D13 | **The card's job.** Today an output; should be the growth loop — mark and URL on every card, one tap from the list rather than caught at the end of a run, carrying D1 |
| D14 | **Multi-medium: music before TV.** TV doubles the library problem in the category not yet won, against two rivals who already have it. Music has bounded, passionately-ranked objects, clean metadata, no incumbent doing pairwise. Same scope note as C15 |
| D15 | **The Activity tab's "coming soon" pill** → D2. A permanent coming-soon is a promise the app keeps breaking |
| D16 | **Fast Shuffle's framing.** Removal is off the table as of 21 Aug — see C18 — so what is left here is the *replace* half: the mode is unexplained and unbounded, and that is what the recorded objection was always about. It is the entire product of every app in the field table, and it is the one Rankd says least about. The rebrand shape is in **F4**, and its first move is N2 |

### Note, do not build · Reject

- **Note:** streaming-availability filters (discovery, not ranking) · swipe-to-discover (a different app) · global community score (needs users and a server read path, i.e. C10).
- **Reject:** *"Which one is better?"* as duel copy — Rankd asks which you'd rather watch and is right, and it is already a tested rule · an activity feed (needs scale) · ads (Canonova served a malvertising popup and read as malware).

### Do NOT replace — the do-not-touch list

Recorded explicitly because a register of things to change needs a matching register of
things that must survive it.

- **The compare screen.** Protected. New UI fits around it.
- **The ladder engine** (`ladder.ts`) — 61 behavioural tests, the most guarded module here.
- **The preference-not-verdict copy rule.** "Which you'd rather watch", never "which is
  better". Tested, and it is the one place Rankd's copy already beats the field.
- **`.h-app`** — see its comment in `globals.css`.
- **The hard/soft lock distinction.** Gold-and-bold for "you placed this", dim for "placed by
  the evidence". F4 makes this *more* load-bearing, not less.
- Also standing from `HANDOVER.md`: no em dashes in user-facing text (G) · cards are 16:9 ·
  the hero numeral is set in the display face · a portrait complements, never competes ·
  curated lists write nothing to the master order · removal never touches the evidence log ·
  the TMDb key rotation has been declined five times, note it if relevant, never argue it.

---

## E · Visual pass (the 20 Aug screenshots)

Feeds B5. The user's reaction, recorded verbatim in substance: likes Popcorn List's **light**
surface but not the colour; the **chart** caught his eye but felt "on the verge of theft";
likes the **menu bars** as "much cleaner"; likes the plum app's **information, not its
layout**.

| ID | Item | Note |
|---|---|---|
| E1 | **Taste shape chart.** Radar plots date to 1877 and are a stock chart type — no IP concern. Substantively different anyway: theirs plots library share, Rankd's plots position in your order (see F2) | **CLEARED 20 Aug.** The "no charts, this app speaks in type" rule is lifted and removed from `HANDOVER.md`. Replaced by a narrower one worth keeping: **a graphic has to say something a number cannot.** Progress is a number, which is why the two tier maps failed. A shape is not. Also carries N6's calibration trap |
| E2 | **Segmented filter bar.** Stock control, no IP concern. Rankd's axes are richer: Tiers, People, Decades, Lists | OPEN |
| E3 | **Milestone with a forward pointer.** 34 badges currently show only what is earned. The nearest unearned with progress is what pulls — and Rankd's can name the actual move ("Rough Cut clears three-star in one pass") | OPEN |
| E4 | **Standing counts row** — Films / Placed / Un-rnkd. Also the thin-state answer for C13 | OPEN |
| E5 | **Icon action row on the film card** (Re-rank / Card / Lock / Remove), alongside the existing "Wrong film?" | OPEN |
| E6 | **Light mode.** Bigger than it looks — every screen, the poster treatment, the cards. Cheap test: try a **light card design** first, since cards are already a separate visual system | NEEDS DECISION |
| E7 | **Gradients are now allowed if tasteful.** User's call, 20 Aug. Reverses the blanket "No gradients" line in the do-not-relitigate block | DECIDED — needs recording in `HANDOVER.md` |
| E8 | The library row shows a raw Elo number in both reference apps (1642, 1593). Rankd's slot is better spent on **who decided** — locked versus believed | OPEN |

---

## F · Ranking data, payoff, and the Fast Shuffle rebrand

### F1 · The duel log is not a taste sample — the user's objection, and it is correct

A chart built on raw win rates measures the matchmaker, not the person. Four biases:

- **KotH picks opponents by score proximity.** The algorithm chose the pairing.
- **Volume tracks tier size.** 3★ holds 185 films and swamps any raw count.
- **Rough Cut writes no log rows at all**, correctly — no pair was compared. A genre shaped
  entirely by Rough Cut contributes nothing.
- **Fast Shuffle serves the least-predictable pair**, so those duels are near 50/50 by
  construction. Most information, least direction.

### F2 · Build the chart from settled positions instead

The user's instinct ("only confirmed choices should count") is right, applied one level up.
A confirm settles **one film's position**, not a pairing — so do not count wins. **Weight each
film by where it landed in the order.** Drama across the top decile scores high. No
matchmaker bias, legible, and it grows with use exactly as asked. Still better than the
reference apps, whose axis is how many films you own rather than where you put them.

**Later, if it earns a v2:** surprise/residual. `bayes.ts` already holds a mean and spread, so
every duel has an expected outcome; measure which genres beat expectation. Immune to volume
because it averages a residual. Best statistic, hardest to explain.

### F3 · The was/then belongs ON THE GRAPH — clarified 20 Aug 2026

**The user's clarification, and it redefines this item.** The was/then is not a per-film
position diff at the end of a session. It is a **before/after on the taste chart itself**
(E1): the shape your taste had when the session started, drawn against the shape it has
now. One graph, two states.

That is a better idea than the per-film version and it makes E1 and F3 one piece of work
rather than two. It also gives the chart a reason to be looked at more than once, which a
static radar does not have.

**Prerequisite it inherits from F2:** the chart is built from settled positions, so the
"was" snapshot is the position map at session start, not a log replay. Cheap to capture,
and immune to every bias in F1 for the same reason the per-film version was.

**Groundwork that landed 20 Aug:** the film card now carries both numbers, yours and the
app's (`FilmInfo.tsx`, from `Belief.mean`). That is the same yours-versus-the-model
comparison at the level of one film, and it proves the data is there and cheap to derive.

---

### F3a · The original per-film version, kept on the record

A session diff is not a statistic — it is two snapshots, so **every bias in F1 is
irrelevant**. *"You started with The Thing at 12. It finished at 4."* Works for Rough Cut too,
because Rough Cut writes scores and `bandsOf` derives piles from them. Cheap, honest, no new
data model, and it answers C19 directly.

### F4 · Do people enjoy the score-based system? — research finding

**Yes, and the split between praise and complaint is the whole finding.**

Praised, consistently: **the comparison itself.** Beli users call it "genuinely satisfying"
and say accuracy is the number one feature, explicitly against star ratings and "a flood of
4.5+ like on Google". The mechanic has product-market fit.

Complained about — **none of it the comparison**:

1. **Apples versus oranges.** Comparing things that are not comparable. **Rankd already
   solved this** — tier-scoped, and Random mode was removed for exactly this reason.
2. **Loss of ownership.** Rankings feel "wonky and overstated or understated"; users say they
   do not feel they own their own list. **The Elo-drift complaint, from real users, on the
   biggest app in the category. Direct evidence for hard locks.**
3. **Cognitive load** — comparing is "more contemplative and strenuous".
4. Popcorn List's own reviews complain about **finding films to add** (endless decade
   scrolling) and glitches, not about ranking. Rankd's CSV import already answers that.

**DECIDED 21 Aug 2026: Fast Shuffle stays.** The user's call, and the evidence supported it.
Everything below is now the open work rather than a recommendation:

- Fast Shuffle becomes its own named game writing **provisional placements** only.
- Hard locks stay earned — manually, or via Rough Cut and King of the Hill.
- ~~**Name the two states on screen.**~~ **DONE 21 Aug** — the list draws gold-and-bold
  against dim and now says what the two weights mean, in a legend above the search box.
- This closes C18 and unblocks C2. The removal pin has been **deleted** from `HANDOVER.md`
  rather than annotated, so there is nothing left to action against the evidence. Rankd is
  the only app in the field that can offer both layers and say which is which.
- ~~**The first move is N2, not a rename.**~~ **N2 landed 21 Aug.** The two states are now
  named on the list, which was the rebrand's prerequisite and is the third bullet above
  already half-answered. What is left here is the mode's own name and its bounded shape
  (D4), plus the confidence payoff (C2). None of those is blocked any more.

---

## G · Voice and copy — "everything feels like it's written by AI" (NEW, 20 Aug)

The user wants this remedied **and wants to be involved.** Not a job to hand over.

**Already known and partly ruled on:** no em dashes in user-facing text — the user's words
were *"it's clean but obviously AI"*. **The rest of the app's older copy still uses them and
was deliberately not swept**, because that is an edit to text the user has lived with and it
needed asking first. He is now asking.

The second standing rule survives untouched: **the app records a PREFERENCE, never a verdict**
— "which you'd rather watch", not "which is better".

| ID | Item | Status |
|---|---|---|
| G1 | **Inventory every user-facing string**, grouped by screen, as the working document. There is no single copy module, so this has to be gathered before anything can be judged | NEW |
| G2 | **Agree the tells.** Beyond em dashes: the rule of three, "not just X but Y", balanced antithesis, uniform register (everything pitched identically), hedging, Title Case On Everything, abstract nouns where a concrete one would do, and explaining a thing the screen already shows | NEW |
| G3 | **Write a short voice guide** in the user's own words, so the standard outlives any one pass and the next session can apply it without re-litigating | NEW |
| G4 | **The sweep itself**, screen by screen, with the user deciding. Copy is tested in places — check what breaks before changing a string | NEW |

---

## H · Explaining the app to users (NEW, 20 Aug)

The tutorial exists and may not be enough. Four coach-mark tours (list, KotH, Rough Cut,
logging a film), revisitable via Settings → "Refresh me".

**Its structural limit, by design:** the tour is **not playable** — the scrim swallows every
tap, because `settle` cannot tell a demonstration duel from a real one and every belief,
badge and score rests on the log being literally true. So it can *tell*, never *show*. That
is correct and is also why it cannot carry everything.

**The profile deliberately has no tour** — "labels next to numbers, the one kind of screen
that explains itself". **E1 breaks that premise.** A taste chart does not explain itself.

| ID | Item | Status |
|---|---|---|
| H1 | **An info sheet — "How this works".** A real reference users can read, in or out of the app. The thing the tours cannot be | NEW |
| H2 | **List what is genuinely unguessable**, which is what the sheet must cover: a rating is not a position · locked versus believed · why Rough Cut exists and what the piles are · what confidence means and what it does not · curated lists write nothing to your main order · a preference is not a verdict | NEW |
| H3 | **A tour for the profile**, once E1 lands | NEW |
| H4 | **Re-check tour coverage after any new screen.** Standing trap: a tour whose targets are all absent resolves to zero steps and still marks itself seen. It has already burned one — the duel tour fired on `RunStart`, where none of its targets exist, at the one user who needed it | NEW |

---

## P · Profile design pass (21 Aug 2026)

| ID | Item | Status |
|---|---|---|
| P1 | **The world map. PARKED by the user, 21 Aug.** Viable and scoped: real public-domain geometry exists at `cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json` — Natural Earth, 107KB of TopoJSON, fetched and confirmed reachable. What it needs is a decoder (arcs are delta-encoded and quantised, so ~40 lines), an equirectangular projection, a numeric-ISO to alpha-2 table, and a build step baking the result to static paths so nothing is decoded at runtime. **The `Passport` component already computes exactly the data the map would draw**, so this is presentation only when it comes back. Why it matters, in the user's words: a blank region is an invitation to watch something from there, which no ranked list can be | PARKED, scoped |
| P2 | **Tapping a country should open those films** — and from there, rank them and export a card. The same is probably true of a genre slice. This is the profile's first genuinely interactive statistic rather than a readout, and it reuses `CuratedPicker`'s existing "rank an arbitrary pile" path | NEW, OPEN |
| P3 | **"What you like" / "What you've made" are the wrong names.** User's call, 21 Aug: they feel off for what the panels actually hold. Panel two now carries the people you rate highest as well as collections, cards and trophies, so "made" covers less of it than it did | DONE — panels renamed **Your taste** / **Your results** |
| P4 | **Panel two is four horizontal shelves and should be a list of the JPG exports.** The user's words: "what it shows is so lame, at least the layout of it". A redesign rather than a move — the cards and saved lists are the exportable things and should read as a list you scan, with collections and trophies subordinate to them | DONE — a two-up grid of exports |
| N8 | **The two-libraries chooser asked far more often than it had any reason to. FIXED 21 Aug 2026.** The user's question was whether it needs to exist at all; the answer is yes, but it was firing on cases with nothing at stake. `canMerge` refused unless BOTH duel logs were non-empty, which conflated two unrelated reasons a log can be empty. **Verified before changing anything:** a second device that imports a CSV reconciles to `conflict`, not `pull` — `mergeLibrary.ts`'s comment claimed otherwise and was wrong, because `reconcile` only pulls when there is no local library and `saveFilms` marks an import dirty. So import-then-sync met the chooser every time. It also refused when NEITHER side had evidence, which asks somebody to delete one library to settle an argument that is not happening. **Both now merge.** `cleared.ts` records whether an empty log was the user's decision ("Clear my ranking") or just its history, and only the deliberate case still asks. Deliberately not synced: it records an intent formed on one browser | DONE |
| N9 | **The mirror case still asks, and cannot do better today.** When the ACCOUNT's log is empty and this device has played, nothing in the payload distinguishes "they imported and never played" from "they used Clear my ranking on another device" — both leave films with no locks and no evidence. Merging would resurrect a ranking somebody may have thrown away on purpose, so it stays a question. **Closable by syncing the cleared flag** as part of the payload, which means a format bump; worth it only if this turns out to fire in practice | NEW, OPEN |
| N10 | **A whole session's learning arrived in one lump on the NEXT session. FIXED 21 Aug 2026.** `beliefs.ts` states the design as two schedules — "the cheap update keeps the swipe instant, the periodic fit keeps the answer honest" — but `ShuffleDuel` ran the batch fit ONCE, on entry, and its own comment claimed the refit "runs when the session ends". It does not: it runs when the next session STARTS. Reported exactly: "after spamming fast shuffle and no counter movement, I opened another fast shuffle and one duel moved 173 movies." Simulated over an 86-film tier, 300 duels: online-only places 0 until duel 200 then jumps to 86; refitting every 12 climbs 1 · 12 · 70 · 86. **Fixed by refitting every 12 answers through `beliefsWhenIdle`,** with the intervening judgements replayed onto the fitted map so no answer is un-learned, and refits serialised because `beliefsWhenIdle` shares an in-flight promise regardless of its arguments | DONE |
| N11 | **A library-scoped Fast Shuffle run still cannot move its own readout, and no readout can fix that.** Measured: 865 films, 400 duels, refits on — **zero placements**, mean confidence 0.144 → 0.288. Placing a film needs roughly five duels ABOUT THAT FILM, so 865 films is a few thousand duels before the first one lands. This is not a display bug and the honest answer is not another metric: it is that **a big library wants Rough Cut or a tier-scoped run**, which is what those exist for. **What is worth doing:** say so on the scope picker, so choosing "All films" on an 865-film library is an informed choice rather than a disappointing one. Relates to D12 (Rough Cut should be the offer) | NEW, OPEN |
| P9 | **The mode picker got the first real application of P7. DONE 21 Aug 2026.** The user: the menus are "a little awkward to navigate and understand… I don't think they got the text treatment either". They were four bordered cards whose heights were set by whatever each blurb happened to need — Fast Shuffle ran to four sentences and a worked example, King of the Hill to six words — so four boxes of wildly different sizes read as four unrelated things rather than one choice with four answers. Now: hairlines instead of boxes, matching the list and profile; one type scale (19px display title, 13px body, 9px small-caps); blurbs cut to one job each; and a **`meta` slot** so the thing you actually choose on is in the same place and the same unit on every row — ONE PASS · SETTLES FILMS · PROVISIONAL · CHANGES NOTHING. The Fast Shuffle setup sheet gained section labels in the same small-caps treatment | DONE |
| N12 | **Fast Shuffle holds an anchor, and it fixed N11 rather than dressing it up. DONE 21 Aug 2026.** The user's ask was ergonomic — two unfamiliar films at once is jarring — and the effect was structural. `nextPair` already anchored on the least-settled film and picked its nearest opponent; it just chose a NEW anchor every serve, spreading evidence so thin over a big pool that nothing accumulated enough to place. Holding one for up to six duels concentrates it where placements come from. **Measured, same simulation that produced N11's zero: 865 films, 4,000 duels — 209 · 440 · 674 · 865 placed, the whole library.** N11 said no readout could fix a library-scoped run; it was right, and the answer was the matchmaker, not the readout | DONE |
| N13 | **Two stages, and "100%" is now reachable. DONE 21 Aug 2026.** Provisional at **5 duels** (a count, because a count arrives) and settled on **confidence** (because five duels against films a title obviously beats locate nothing). I argued the second stage could not show a percentage since confidence saturates below 1; **the user overruled it correctly** — *if a bar sits at 80% forever then 80% is what finished looks like, and we set the goal.* `settledness()` scales between the confidence a film has when first placed (0.65) and the measured ceiling (0.80), so it is empty at placement and full at roughly twenty duels — which is where the user's "20–50 duels" instinct landed. Ceilings measured with the anchor held: median 0.796 (86 films) and 0.797 (400) at twenty duels/film, maxima 0.831 and 0.838 | DONE |
| N14 | **`f.duels` was never incremented by Fast Shuffle. FIXED 21 Aug 2026.** The only increment in the app was `ladder.ts:269`, on the climb, so a film compared fifty times in Fast Shuffle read *"Never duelled"* on its card and every duel-counting badge undercounted. Found while checking whether the 5-duel gate had a counter to read; it did not | DONE |
| N15 | **Session length is in minutes, from the user's own pace. DONE 21 Aug 2026.** The first version offered 100/250/500 duels with an estimate built from an invented two-seconds-per-duel — wrong by a factor of four against real use (~7s). Presets are 5/10/20 minutes now and the duel count is derived from the median gap between judgements in the log, dropping gaps over 60s as breaks. **The structural version of `VOICE.md` rule 3:** a measured number cannot drift from the truth the way a constant did | DONE |
| P10 | **The list legend carries three colours. DONE 21 Aug 2026.** It named three states in two colours — hard was gold and BOTH soft and un-rnkd were `--dim` — so the distinction the key exists to explain was carried by a colour two of its three states shared. Now gold **LOCKED**, `--accent` **SHUFFLED**, dim **UN-RNKD**, centred over the search bar, with the row numerals using the same three. The accent is not a new colour: it is the token the profile already uses for its RANKD marker. "you settled" became "locked" and `RunStatus` followed in the same pass, because otherwise it was three words for one idea again | DONE |
| P11 | **The profile's gold highlights should open the films behind them.** The user's sideline note, 21 Aug: the taste notes, the world section and the genre ring are all readouts you cannot act on. Tapping one should open that set of films — and from there rank them or export a card. **Extends P2**, which says the same for the world map, and reuses `CuratedPicker`'s existing "rank an arbitrary pile" path. Captured deliberately rather than built | NEW, OPEN |
| P12 | **Pin a handful of cards to the top of the profile.** The user's ask, 21 Aug: cards you have made should be pinnable to the profile, sitting at the top and big enough to read. Needs somewhere on the profile to store the chosen ids, a picker (`CardPicker` exists), and a block above the stats band. **Sits with P11** — both are the profile becoming something you act on rather than only read, which is the through-line of every profile note in this section.<br><br>**DISTINCTIVENESS — and the line is much narrower than it was first written.** An earlier version of this note said that any hand-picked thing pinned near the top of a film profile lands on Letterboxd's FAVORITES block. **That was over-cautious and it was corrected by pushback.** Pinning favourites to a profile is not ownable and never was — MySpace's Top 8, Last.fm, Spotify, Steam, Goodreads all predate or parallel it. Ideas are not protectable; only expression is.<br><br>**What is actually off-limits is narrow:** their artwork and logos, the word FAVORITES over a four-poster grid in the same slot under the bio, their palette and type as a package. That is trade dress, and it needs a reader to plausibly confuse the two apps — which navy-and-gold against near-black-and-green does not.<br><br>**Everything else here is fair, and P16 is not even the same feature:** Letterboxd favourites FILMS, as posters. Directors and actors in a text list is content Letterboxd has no equivalent for. That is differentiation, not imitation | NEW, OPEN |
| N16 | **Fast Shuffle runs a BATCH of films, not a length of time. DONE 21 Aug 2026.** Third shape for this control: duels with a minutes estimate, then minutes with a duel count, now a count of films with an ETA beneath. The user's objection to both earlier versions was that the app should not be asking how long you want to play at all — the time "means nothing, it's just to help the user understand how big a task is before they overcommit and hate the app". So you pick 25/50/100 films, the run ends when they all have numbers, and the end screen offers the same sizes again. **The fencing objection I raised earlier no longer applied and that is worth knowing why:** it was right when the matchmaker chose a fresh anchor every serve, because a pen threw that judgement away. It now holds an anchor for a whole turn regardless, so a batch does not remove a choice it is no longer making. The batch decides which films are ANCHORED; opponents still come from the whole scope | DONE |
| N17 | **The anchor pill promised duels it did not deliver. FIXED 21 Aug 2026.** It counted toward `PLACE_DUELS` while retirement fired on the film being placed — and `placeSettled` has two routes, the duel count AND confidence. A film crossing on confidence early left while its pill still read "2 MORE". The turn is decided once when the anchor starts and nothing else ends it, so the pill is true by construction rather than by two conditions agreeing | DONE |
| N18 | **"Last time" is gone, and deleting `lib/visit.ts` with it would have been a mistake.** The obvious follow-up — nothing else imports the recap, so remove the module — would have silently taken the taste chart's "where you started" outline, which is fed by the same `openVisit`/`snapshotOf` snapshot. Only the recap half went (`deltaOf`, `recapLine`, `agoLabel`, `VisitDelta`). **The Spotlight lesson, hit again:** check what depends on it BEFORE cutting, not after | DONE |
| P14 | **Swipe filters on the list — all / locked / shuffled / year / genre.** The user's idea, 21 Aug. **The FILTER half is DONE**, and it needed no new control at all: the three counts in the band were already the three states, already in their own colours, and already the thing you read to decide what to do next — so they ARE the filter. Tap LOCKED for only those, tap again to clear; the active column underlines in its own colour and the others dim to 35%. Counts stay absolute, because a key that changed every time you used it would be describing itself rather than the library. Filtered on the way IN so `buildList` recomputes sections, spacers and tier-jump offsets together — filtering its output would leave the offsets pointing at rows that are gone.<br><br>**The GROUPING half — year and genre — is still open and is a different job.** Every row stays and the sections change, which rebuilds the geometry `ROW_H` drives. Probably belongs with **Jump**, which already exists for moving around the list by tier | FILTERS DONE · GROUPING OPEN |
| N19 | **Refine: duel one film for a run. DONE 21 Aug 2026.** From a film card, 10/25/50 duels against opponents from its own tier. Cheap because the anchor mechanism already existed for something else — `nextPair` takes an `anchorId` and a focused run is that, pinned and never rotated. Scoped to the film's tier deliberately: a score is defined inside a tier band, so a cross-tier answer writes nothing and would look like it counted | DONE |
| N20 | **`includeConfirmed` was two flags wearing one name.** It decided pool membership AND whether `respreadTier` may move already-placed films. For every run before Refine the two answers coincided, so nobody noticed. Refining a LOCKED film needs it in the pool — it is the anchor — while whether its position may move is the user's call. Split into an explicit `movePlaced`, defaulting to `includeConfirmed` so every older caller is unchanged | DONE |
| N21 | **"movePlaced: false" does not mean "it won't move", and a test written on that assumption is what found it.** The flag preserves the ORDER of hard locks against each other; the whole tier is still re-spread across its band, so the score changes anyway. **A read-only Refine therefore writes NO scores at all** — the same treatment a person run gets, for the same reason. Verified on a phone-sized browser: a locked film's score was 9847 before and 9847 after ten duels, with all ten recorded. The plan asserted the wrong invariant and the test caught it before the copy shipped saying it | DONE |
| N22 | **A held anchor was a queue position, not a pin.** It was moved to the front of the candidate list and otherwise treated normally, so once it had faced everyone inside the repetition guard the loop moved on to a DIFFERENT film — while the screen still carried the held one's name. Traced over a five-film pool: `c c c c a a a b`. Now honoured in full before anything else, dropping the guard rather than the anchor: a repeated pairing is a weaker duel, refining a film the user did not choose is simply wrong | DONE |
| P17 | **The stats band moved ABOVE the bio. DONE 21 Aug 2026.** Every social profile runs picture, name, then a paragraph about yourself, and the profile did too. **DUELS** and **RANKED** are the two words on that screen no other film app can print, because no other film app ranks — so putting them directly under the name means the first thing you read is the thing only this app does. Free differentiation, decided while answering whether the profile sat too close to Letterboxd's: the layout is a convention nobody owns, but leading with the vocabulary that is genuinely ours costs nothing and settles it. The bio became its own tap target below the band; both still open the same editor | DONE |
| P15 | **The list band. DONE 21 Aug 2026.** The name is gone — it was the largest thing there, told you whose list you were looking at on the only list there is, and its one function (reaching the profile) is what the nav's You cell does from everywhere. The total joined the three states as a fourth column in `--text-hi`, since the three already sum to it and a fourth HUE would have read as a fourth state. And the block got `--band`, a new brightness-driven token sitting between the fixed-black header and the page: measured live at #000000 / #060f1f / #0a1e3f, three steps top to bottom | DONE |
| N23 | **The taste chart was drawing one line twice. FIXED 21 Aug 2026.** It plotted your order against Rankd's over the SAME films — and those are the same order, provably: a soft lock's `score` is written by `respreadTier`, which spreads a tier IN BELIEF ORDER, and tier bands never overlap, so sorting by score IS sorting by rating then belief. They can only diverge on a hard lock. Reported with 1 locked film against 234 shuffled — "they overlap the exact same" — and confirmed by a test over 60 placed films that came back byte-identical. **Now two POPULATIONS, one ordering:** gold is what you LOCKED, blue is what Rankd SHUFFLED. Both take their standings from the whole placed list, so a genre's height means the same on both lines and only the membership differs | DONE |
| N24 | **An empty axis on a membership shape means ZERO, not "no data".** `shapeFrom` omits a genre below `MIN_FOR_AXIS`, which is right when both lines cover the same films — a gap there would make the polygon invent a value. It is wrong for these two: "you have locked no comedies" is an answer. Omitting it made the polygon refuse to close, so a lock set concentrated in one genre — the interesting case, and exactly the "tiny and pointing mostly one direction" the user predicted — drew nothing at all | DONE |
| N25 | **Below ten locked films the chart draws ONE line.** A shape from two locked films is noise, and gold-as-your-whole-list against blue-as-the-shuffled-part is two outlines that agree by construction — the same overlap complaint in a new costume. So the blue line and its legend entry are withheld, and the caption says what unlocks them: "Lock ten films and this splits into what you settled against what Rankd did." | DONE |
| P16 | ~~**Pin favourite directors and actors to the Your results tab.**~~ **DONE 21 Aug 2026.** No new section: pins float to the top of the **Who you rate highest** list that already exists, and appear there even when the computed slice would have dropped them — the widening lives in `topPeople` beside the ranking it overrides. **The brief decided the shape:** it should "generate through the data with the option to change it built in", so there is no empty block asking to be filled. **The first build put a star on every row and it came straight back out** — "the star doesn't make sense, I would rather be able to replace the directors and actors myself". Right, and the star was the wrong shape for it twice over: seven stars is seven controls on rows you are trying to READ, and starring is a vote for somebody already on the list where the ask was to put somebody ON it. Replaced by **one CHANGE control on the section**, opening a picker over everyone in the library — not just the current occupants, since offering only those would make it a re-ordering tool. A chosen name is gold, which is the colour the app already uses for "you did this". Stored as `director:Name`/`actor:Name` because plenty of people are both, capped at its own `MAX_PINNED_PEOPLE` of 6 rather than reusing the rankings' 3, which means something else. **And it dissolved the language question:** no new block means no new heading, so there was nowhere the word FAVOURITES could have gone. The app's existing uses — "Everyone has a favourite. What's yours?", "your favourite first" — are ordinary English in prose, not a label over a poster grid, and were deliberately left alone | DONE |
| N26 | **A shuffled or un-rnkd film can LEAPFROG a film you locked, and Refine makes that reachable on purpose. NEEDS A DECISION.** The user's call, 21 Aug: *"it cannot jump and jumble the whole list. It's just to refine the confidence and the shuffled films."* **Confirmed in the code, not assumed** — `respreadTier` with `movePlaced: false` (`shuffle.ts:216`) merges movable films against pinned ones BY BELIEF: `if (meanOf(movable[j]) > meanOf(pinned[i])) ordered.push(movable[j++])`. So the flag preserves the order of hard locks *among themselves* and does nothing to stop an unlocked film rising above them. Refining a shuffled film for fifty duels can therefore reorder your locked films' surroundings, which is not what Refine is for.<br><br>**Reordering across a lock should come from the editable list (B2) and its drag-and-drop, where it is a thing you did on purpose — not a side effect of asking for more confidence.**<br><br>**Four questions to settle before building anything, recorded here rather than asked because the answer changes the size of the job:**<br>1. **Is this Refine's problem or `respreadTier`'s?** The merge is shared — an ordinary Fast Shuffle has done this since soft locks existed. Fixing it in `respreadTier` fixes every mode and changes long-standing behaviour; fixing it only for focused runs leaves the general case as it is. **This is the big one.**<br>2. **What does a lock actually pin — its ORDER among locks, or its POSITION in the tier?** Today it is the former. The user's reading is the latter, which means movable films fill the gaps BETWEEN locks and a film that wants to be #1 behind a locked #1 clamps to #2.<br>3. **What should the screen do when a refine hits that ceiling?** Stop the run, say so and offer to carry on, or silently clamp. Silent clamping is the least honest and the easiest to build.<br>4. **Does un-rnkd differ from shuffled here?** An un-rnkd film has no position at all, so "crossing a lock" means being PLACED above one on its first outing — arguably a different case from a placed film moving up. | NEEDS DECISION |
| P13 | **DESKTOP AND MOBILE VERSIONS.** The user's ask, 21 Aug. **Checked before writing this, and the starting position is further back than it looks: there is not one responsive breakpoint anywhere in `src/`** — no `sm:`, no `md:`, no max-width container. Every screen is phone-shaped and simply STRETCHES, so on a laptop today the compare screen puts two posters at either end of a 1920px window and the 375px-tuned type sits on a canvas five times too wide. This is a build, not a tweak.<br><br>**The cheap first move, which is worth doing on its own:** a max-width container centring the phone layout. That makes desktop CORRECT rather than broken, costs almost nothing, and buys time to design a real one. Do not confuse it with the feature.<br><br>**What a real desktop version would earn:** the list in two or three columns instead of one 96px row at a time; the compare screen given the room it has always wanted; the profile's two swipe panels side by side rather than one behind the other; keyboard shortcuts for the duel (left/right/draw), which is the single biggest speed win a mouse-and-keyboard user could get and which no competitor offers.<br><br>**Constraints it has to respect, all of them already load-bearing:** the compare screen is protected (do-not-touch list) — a wider version is still a redesign of it and needs the user; `ROW_H = 96` drives the list's section spacers and tier jumps, so a multi-column list changes the geometry those depend on; `--nav-h` is measured from a bottom bar that is a phone idiom and would likely become a side rail; and the type scale is being brought toward the profile's at PHONE sizes (P6/P7), so doing both at once means tuning one scale against two canvases.<br><br>**One thing that genuinely reverses on desktop:** N2 exists because a hover tooltip says nothing on a phone. On a desktop hover is real, so tooltips become a legitimate extra layer — but they stay an EXTRA. The legend earns its place on both. | NEW, OPEN |
| P6 | ~~**THE TYPE SCALE — an app-wide weight and size review.**~~ **DONE 21 Aug 2026.** Sixteen distinct sizes became **four plus the display face**: `--text-label` 10px, `--text-sub` 13px, `--text-body` 15px, `--text-title` 19px, defined as Tailwind v4 tokens in `globals.css` rather than swept once — a sweep drifts back within a fortnight, a named scale makes the next `text-[17px]` an obvious thing not to write. 245 sites across 32 components. **The only judgement was what each 11px string IS**, and the codebase answered it: a label in this app is small caps with letter-spacing, so `uppercase`/`tracking-[0.x]` in the same className means label and everything else at that size is prose. **`PosterCard` — the protected compare screen — needed no change at all:** it already used only 10px and 13px, so the scale was fitted to the part nobody may touch rather than against it | DONE |
| P7 | ~~**Why the profile is the exception.**~~ **DONE 21 Aug 2026 with P6.** Also recorded there: **weight is not a step.** 117 of 120 weight declarations were semibold or heavier, which is why nothing read as emphasised — emphasis inside body and sub is COLOUR (gold, accent, text-hi against dim), never a heavier face. **One real regression, caught in the browser and not by any test:** the profile's tier bars sized their star column at 46px, cut for five stars at 11px. At 13px they measure 54 and clipped. It was the one place in the app that noticed the type getting bigger | DONE |
| P8 | **The list legend was the first application of P7, 21 Aug.** It shipped as a flat 10px line directly beneath a flat 11px line, and the user's verdict was "it's there but visually looks off" — two dim greys of near-identical size stacking into mush, with the longer one reading as a runt paragraph. Fixed by giving the LINE internal contrast rather than by resizing it: the numbers are the display face at 13px, the words are 9px small caps, which is the profile band's own label treatment. **The lesson worth carrying into the rest of P7:** the problem was never that the line was too small. It was that nothing inside it was any different from anything else | DONE |
| P5 | **The page is still not visually consistent with the rest of the app.** Bordered rounded boxes at four different sizes — person cards, collection tiles, list tiles, trophy pills — where the duel and list screens use flat surfaces, hairlines and type. The de-boxing has reached the stats band and Odds and ends; it has not reached panel two | DONE for panel two; the app-wide half is **P6/P7** |

---

## N · Found while writing H2 (20 Aug 2026)

| ID | Item | Status |
|---|---|---|
| N1 | **A rating can climb but can never fall.** Verified: nothing in `ladder.ts` lowers a rating, and `promotionTarget` only fires when a film beats every other film at its own rating. **The user's call: this must go both ways.** The consequence is bigger than an inconsistency, because a one-directional system can only inflate. A film overrated on import can never find its level through play however many duels it loses, and the only route down is editing the rating by hand. **Demotion is the play-based half of B2**, so the two should be designed together rather than one papering over the other | NEW, OPEN |
| N2 | ~~**The locked/believed explanation is in a `title` attribute.**~~ **DONE 21 Aug 2026.** A legend now sits in the list header, above the search box: "**55** you settled · 105 Rankd placed, and can still move". It uses the row treatments exactly — same gold, same weight, same dim — so it reads as a key rather than as two more statistics, and it hides when a library has only one of the two states. A legend rather than a per-row label because a label on 861 rows repeats itself 861 times and because `ROW_H` is load-bearing. **Found on the way in and also fixed: the app had one word for two states.** `RunStatus` reported "6 settled" from hard locks only while the profile band labelled `placedCount` — hard AND soft — "Settled", both on screen at once and unable to agree. Vocabulary is now fixed: **ranked** = has a number however it got one; **settled** = you committed to it. The profile stat is relabelled "Ranked" (the number is unchanged), and four tests in `list.test.ts` guard the two counts | DONE |
| N3 | ~~**"A rating is not a position" is taught only when the UN-RNKD divider exists.**~~ **DONE 21 Aug 2026.** The idea now lives on the list tour's **"row"** step, which points at the list itself and can never be absent: "The stars decide which tier a film is in. The number on the right is a different thing: the position it holds across everything you've ranked." UN-RNKD keeps its own step and elaborates. **The test was part of the bug** — a comment reading "the list tour exists for exactly one idea" sat directly above an assertion made only against the droppable step, so the gap looked covered. There is now a regression test that resolves the tour WITHOUT the divider and asserts the idea survives | DONE |
| N4 | **H1, the "How this works" sheet — PARKED** by the user, 20 Aug. `HOW-IT-WORKS.md` stands on its own as the record. Revisit once N1 and N2 land, since both change what the sheet would need to say | PARKED |
| N5 | **`FilmInfo` needs a visual pass.** User's call on seeing it on a phone. It is not in B8's PROVISIONAL list (`SessionEnd`, `PersonSheet`, `LogFilm`, `RunStatus`) but it should be: the header block is now five stacked lines of 11px dim text (position, app's answer, duels and settledness, genres, tagline) beside an 88px poster, and it has grown by accretion rather than being designed. **Fold into B8 rather than doing it alone**, and after E6 decides the light/dark question, since that changes what the card is being designed against | NEW, OPEN |
| N7 | ~~**Something pops up when Settings is opened, and it is jarring.**~~ **DIAGNOSED AND FIXED 21 Aug 2026.** Not `InstallPrompt`, which was the leading candidate — it was `Settings.tsx`'s Account row, rendered as `open={open === "account" || conflict}`. `conflict` arrives from an ASYNC sync check, so the sequence on a phone was: the panel draws with every row shut, the thumb starts moving toward Account, and about half a second later the row animates itself open under that thumb with a tall two-libraries chooser inside it. The user's description matched exactly, including "especially since people are pressing that tab". **Fixed by deleting the force-open, not by hiding the conflict:** the `note` beside the title already read "needs you" and now reads it in gold. A row that opens on its own, LATE, is the worst available way to raise something urgent | DONE |
| N6 | **Cross-tier belief means are not calibrated and must never be printed as a position.** `PRIOR_SPREAD` is deliberately wide, so a much-duelled film can out-mean a whole tier above it, while `shuffle.ts` re-spreads within a band and never lets one be escaped. Shipped briefly on the film card and caught on a phone: a 1.5★ film read "app says #391". Fixed by scoping to the tier and offsetting by everything rated higher. **Any future surface comparing the model's answer with the user's has the same trap** — the taste chart (E1/F3) is next in line for it | RESOLVED, recorded as a trap |

---

## I · Documentation debt

| ID | Item |
|---|---|
| I1 | **Record E7** — gradients now allowed if tasteful. The do-not-relitigate block still says "No gradients" flat, and the next session will enforce a rule the user has lifted |
| I2 | **Contradiction to resolve.** The gotchas list says `rankd-lists-v1` "is not in any backup — a restore silently loses saved rankings". The Session G decision block says the per-format key set shipped and format 2 carries it. **One of these is stale.** Check the code, then fix the file — this file has twice asserted a blocker that was not real |
| I3 | ~~Record F4's finding so the Fast Shuffle removal pin is not actioned against the evidence~~ **DONE 21 Aug** — the user decided to keep Fast Shuffle and the pin was deleted from `HANDOVER.md`, which is better than recording a counter-argument beside it |

---

## J · Open questions

**Answered 20 Aug 2026:**

- **G — the copy pass runs inventory-first.** Gather every user-facing string, grouped by
  screen, into one document. The user reads it and marks what sounds wrong; we rewrite
  together. There is no single copy module, so the gather has to happen regardless.
- **H — three of the four shapes, and not the public page.** In-app "How this works" sheet,
  deeper coach marks, and a first-run walkthrough. The marketing/SEO page is **not** wanted;
  D5 and D11 (the front door) stay a separate question.

**Still open:**

1. **E1** — does a taste chart on the profile clear the bar the tier map failed twice?
2. **E6** — is light mode on the table, or is the answer a light *card* first?
3. **B2** — is the editable list still parked, given F4 says ownership is the field's top
   complaint and B2 *is* the ownership feature?
4. ~~**C18/F4** — confirm Fast Shuffle is reprieved rather than removed.~~ **ANSWERED 21 Aug:
   it stays.** The remaining question is narrower and worth asking properly: **what is it
   called, and what does the screen say the difference is?** See F4.

---

## L · The first-run walkthrough, and why the "do not rebuild" note does not block it

The docs say a tutorial sandbox was built and deleted in one session, with **"Do not rebuild
it."** That note does not apply here, and the distinction is worth writing down.

**What was cut:** a sandbox running the real screens over **sample films**, with every write
guarded — a flag, five guarded write paths, a scratch React state. It was cut because
import-first dissolved the problem it solved, and the whole perimeter "only ever served
playing with films nobody owns."

**What is being asked for now:** a walkthrough over the user's **own real library**, after
import. No sample films, no guarded writes, no perimeter — because every duel in it is a real
duel about a real film the person actually rated.

**That difference resolves the tour's structural limit.** Coach marks cannot be playable: the
scrim swallows every tap because `settle` cannot tell a demonstration duel from a real one,
and every belief, badge and score rests on the log being literally true. **A walkthrough over
your own films has nothing to guard against**, because there is no demonstration — the
judgements are genuine. So this is the one version of "let them try it" that the engine's
own invariant permits.

**Constraints it must still respect:**

- **Sequence it against import completing, not against a screen being current.** A tour whose
  targets are all absent resolves to zero steps and still burns its "seen" flag. That has
  already happened once, to the one user who needed it.
- **Its seen-flag must ride in `backupFormat.ts`'s key set**, or restoring a backup replays
  the walkthrough at somebody who finished it months ago.
- It is the highest-effort item in H. The sheet and the coach marks stand on their own.

---

## M · Proposed sequence

Not a commitment — a defensible order through the register above.

**0 · A1, by the user, on a phone.** Costs nothing here and can invalidate everything else.

**1 · G1 — the copy inventory.** Read-only. Unblocks the rest of G, **and it must come before
H.** The info sheet, the coach marks and the walkthrough are all *new copy*. Writing them
before the voice is settled means writing more of the thing being complained about.

**2 · G2–G4 — agree the tells, write the voice guide, run the sweep.** The guide is what makes
the standard outlive the pass.

**3 · H2 then H1 — list the unguessable ideas, then write the sheet** in the new voice.

**4 · F4 — the Fast Shuffle rebrand, and name the two lock states on screen.**
**F4 and H are the same job from two sides.** "Locked versus believed" is simultaneously the
rebrand's core mechanic and the second item on H2's unguessable list. Doing them together
means the sheet explains something the screen has just started saying, rather than explaining
something invisible.

**5 · F3 — the was/then.** Cheap, no new data model, immune to every bias in F1, and it
answers C19 ("finishing a run doesn't feel like anything") directly.

**Then re-open the register.** B7 (resume a curated run) stays the cheapest contained win if
the appetite is for finishing rather than starting. E1/E6 need the answers in J.

### The competitive track — the alternative order, kept on the record

The sequence above is **copy-and-education-led**, because that is what the user chose on
20 Aug. It is not the only defensible order. The competitive sequence, recorded so choosing
one does not silently discard the other:

1. **Taste identity + per-tier confidence** (D1 + D3). One piece of work. Gives Fast Shuffle
   its point, the profile its payoff, and the card its headline.
2. **The card as the growth loop** (D13). Mark, URL, identity, one tap from the list.
3. **Parallel Cut over saved lists** (D2). The Activity tab's first tenant, no schema change.
4. **The front door** (D11). Decide the gate's fate here.
5. **PWA on a real iPhone** (A3/A4), then the App Store question with evidence rather than
   assumption.
6. **Music, not TV** (D14).

**The two tracks are not exclusive and they share their first move.** A1 comes before either.
And G1 (the copy inventory) is worth doing early on the competitive track too — D5's headline,
D11's front door and D1's identity are all new copy, and writing them before the voice is
settled means writing more of what the user is complaining about.

---

## K · Research appendix — the field, Aug 2026

| | **RANKD** | **Shortlist** | **Popcorn List** | **Outtakes** | **Flickchart** | **Canonova** |
|---|---|---|---|---|---|---|
| Platform | Web PWA | iOS + Android Jul '26 | iOS/iPad | iOS/iPad/Mac/Vision | Web | Web, gated |
| Traction | — | 19 ratings, 5.0 | **134, 4.3** | 12, 5.0 | 20 yrs, stagnant | thin, ad-laden |
| Mechanic | KotH insertion + hard locks, Bayesian belief underneath | Elo | Elo | Adaptive Elo | Elo, global | Elo + 1-vs-10 |
| Big library | **Rough Cut, tier bands** | none | none | none | none | tier filter |
| Import | Letterboxd CSV + zip | — | — | — | — | Letterboxd |
| Social | none shipped | Friend score, Taste Match % | taste-similar users | **Parallel Cut** | community, VIP | share page |
| Money | free | free | **$2.99/mo · $29.99/yr · $69.99 life** | free | VIP | ads |
| TV | no | yes | yes | no | no | no |

**The read.** The mechanic is commoditised — ten apps now open with the same sentence.
Nobody has won: 134 App Store ratings is the ceiling of the entire new wave. Rankd's moat is
the big-library problem (Rough Cut, tier bands), which no competitor has hit, and it is
currently invisible on Rankd's own surface. Letterboxd has **not** shipped ranking; every app
here lives in that gap. Shortlist is the only one behaving like a business (SEO, Android,
three scores).

Adjacent, not competitors: Cini, Slate, Cineswipe, Seen It, Likewise, Curate, Toolboxd,
Flickd. Unverified as ranking products: **Fliki, Movi, PikPal, Palit, Dualist, Movier** —
links still wanted. Cross-medium ranking exists only as generic toys (RANKMAKER, Rank My
Favs); cross-medium tracking exists (Achriom). **Nobody has put a serious ranking engine
behind multiple media.**

**Watch:** Shortlist's rating count in 30 days (past ~200 means the SEO is converting) and
Letterboxd's release notes for anything resembling list ordering.
