# How it works — what the app never explains

**Register item H2: the list of things a user cannot work out on their own.**

> **The sheet itself (H1) is PARKED.** User's call, 20 Aug. This document stands on its
> own as the record of what is unexplained, and two entries turned out to be real work
> rather than missing copy: **item 1** (an explanation hidden in a tooltip no phone can
> trigger) and **item 3** (a rating can climb but never fall). Both are now register
> items. Pick the sheet back up when there is something worth writing it against.

Each entry was tested the same way: **does the app ever say it, and could you infer it
from the screen on a phone.** File references are the evidence, not decoration.

The tours already teach the gestures well. What follows is what they cannot reach,
because a coach mark points at a control and these are all ideas rather than controls.

---

## It has a home already

`Settings` has a **"How to play"** row (`Settings.tsx:236`). Today it contains one
paragraph and the **Refresh me** button, which replays the coach marks. The row is
correctly named and already sits where somebody looking for help would look. The sheet
goes here, above the button, not in a new place.

---

## The five that matter

### 1. Gold means you placed it. Dim means the app did.

**The worst one, and it is worse on a phone than on a desktop.**

`ListScreen.tsx:351` carries the explanation in a `title` attribute:

```
title={isHard(film) ? "You placed this" : "Placed by the evidence"}
```

A `title` is a **hover tooltip**. There is no hover on a phone. So on the only device this
app is really used on, the single most important distinction in the product is conveyed by
**colour alone, with no label anywhere**.

What breaks without it:

- Settings offers **"Drop the N the app placed"** (`Settings.tsx:344`). That button is
  unreadable if you did not know the app places films for you.
- It is the distinction the whole product rests on. Every rival has one soft score;
  Rankd's claim is that it has both and tells you which is which. Right now it does not
  tell you.
- Register item F4 (the Fast Shuffle rebrand) makes this **more** load-bearing, not less.

### 2. A star rating is not a position.

Taught once, in the list tour, and only when the UN-RNKD divider happens to be on screen.
`resolveSteps` correctly drops the step when the divider is absent, which means **the
person with a fully ranked tier never sees the idea explained at all**.

This is the founding idea of the app. It should not depend on a divider existing.

### 3. A rating can go UP through play and can never come down. That is a gap, not a rule.

`promotionTarget`, `promoteDirect`, `completePromotion` and the **GOING UP A TIER** header
(`DuelScreen.tsx:1061`). A film can leave the rating you gave it and climb a tier.

**There is no demotion anywhere in `ladder.ts`.** Verified: nothing lowers a rating, and
`promotionTarget` only fires when a film has beaten every other film at its own rating.

**The user's call, 20 Aug: this should go both ways.** He is right, and the consequence is
bigger than an inconsistency. A one-directional system can only inflate. A film you
overrated on import can never find its real level through play, no matter how many duels
it loses. The only route down is editing the rating by hand, which is register item B2 and
is parked.

**So demotion is the play-based half of the editable list.** It is now a register item in
its own right, not something the sheet can paper over.

Whatever the sheet eventually says: promotion happens, King of the Hill is the only route,
and you confirm it before it lands. Nothing currently prepares you for a rating you set
yourself changing on its own.

### 4. "Settled", "taking shape", "barely tested" are the app's confidence, not your progress.

`FilmInfo.tsx:24` maps a number to those three words and shows them beside a duel count.
The number is `confidenceOf`, derived from **belief spread**, not from how many duels a
film has had.

Two problems. It reads as a progress bar toward "done", and `POTENTIAL-FEATURES.md`
already names the trap: whatever this readout says, it must read as **the app's belief
about your taste**, never as **your ranking**. Nothing on screen currently makes that
distinction.

### 5. Rough Cut breaks a tier into smaller piles. It does not rank inside them.

*(Rewritten. The first version said Rough Cut "places films without settling them", which
is the mechanism described from the code's point of view and reads badly. The user's
framing is the right one and is what the sheet should use.)*

`applyRoughCut` writes `score` and deliberately writes **no lock**. Dealing a film into a
pile is not a commitment, and no pair was compared, so no duel is logged.

The part nobody is told: **after a Rough Cut your films still read UN-RNKD in the list.**
Nothing was thrown away, and the list does order them by the piles you made, but if you
were expecting the labels to change then it looks like the work vanished.

Lower priority than 1 to 4. The piles are visible in the order, so the confusion is a
label rather than lost work.

---

## Already covered, do not repeat

| Idea | Where it is said |
|---|---|
| A preference, never a verdict | duel tour, step 1 |
| Flicking records no duel | duel tour, step 2 |
| Curated lists change no scores | Curator blurb, "Your rankings don't move" |
| Guest films are not added to your library | `PersonSheet.tsx:200` |
| What the three resets each destroy | Settings copy, and it is good |

---

## Deliberately out of scope for the sheet

- **Sync and merge.** Two devices union their evidence rather than one overwriting the
  other (`mergeLibrary.ts`). True, and it only matters at conflict time, where the chooser
  can explain itself. Explaining it up front trades a real idea for an abstract one.
- **The engine.** Bayesian fitting, spread, matchmaking. The sheet says what the app does
  with your answers, never how it computes them.

---

## Constraints on the sheet itself

- **Write it against `VOICE.md`.** It is new copy and the whole point of doing the voice
  guide first.
- **Five ideas is the ceiling.** A long sheet is not read, and the tours already carry the
  gestures.
- **It is a reference, not a tutorial.** Somebody opens it because something confused
  them. Each idea should be findable on its own, not require reading from the top.
- **Item 1 probably needs a UI change too, not just the sheet.** A tooltip nobody can
  trigger is a bug wearing an explanation's clothes. Worth deciding whether the list gets
  a visible label before the sheet is written to describe one.
