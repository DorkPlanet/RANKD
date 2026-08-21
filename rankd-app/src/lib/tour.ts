// What the app never told anyone.
//
// Marks drawn over the REAL screen, not a slideshow: every gesture here is
// physical and none is discoverable by looking.
//
// One tour per screen. The duel carries most of the teaching. The list gets its
// own because it holds the one genuinely unguessable idea in the app — a rating
// is not a position, which is what UN-RNKD means and what nothing on screen
// says. The profile has none; it is labels next to numbers.
//
// ── The tour never lets you play ───────────────────────────────────────────
//
// The overlay blocks the surface it describes. `settle` cannot tell a
// demonstration duel from a real one, and every belief, badge and score rests on
// the log being literally true — so the gesture is described here and performed
// afterwards, for real. Same reason a person run records nothing.
//
// ── Copy rules, all three tested ───────────────────────────────────────────
//
// · Say what the gesture DOES. "Flick up" without "parks it at the top" teaches
//   a motion and not a meaning, and the meaning is the unguessable part.
// · PREFERENCE, never quality. This is a record of what one person would rather
//   watch, not a verdict on which film is better. "Best first" broke this and
//   was caught in review: it is YOUR FAVOURITE first, and nothing in this app
//   claims one film is better than another.
// · No em dashes. The house tell of machine-written copy, and this is the first
//   thing a new user reads.
// · DEFINE EVERY WORD THE APP INVENTED, at the first place it appears. The copy
//   used to lean on "tier", "pile" and "settled" as though the reader already
//   had them. They are not English, they are this app's vocabulary, and a
//   tutorial that assumes its own jargon teaches nothing to the only people who
//   need it. "Tier" is defined in the first duel step and then used freely,
//   because it appears all over the UI and dodging it here would leave the
//   reader stuck the moment they meet a screen that says TIER.

const KEY = "rankd-tour-v1";

export type TourId = "duel" | "list" | "roughcut" | "log";

export interface TourStep {
  id: string;
  /** The `data-tour` value of the element this step points at. */
  target: string;
  title: string;
  body: string;
}

/**
 * The duel: the core loop first, then Rough Cut.
 *
 * Three of these point at the SAME poster, deliberately. That card is one
 * surface carrying three different gestures, and showing it three times with the
 * caption changing underneath is the honest way to say so. Splitting them across
 * different targets would imply three different controls exist.
 *
 * Rough Cut comes last and is the only step that is not a gesture. It is here
 * because it is what a new user with a real library should reach for first and
 * the one thing they would never find on their own: `ladder.ts` costs n(n-1)/2
 * duels, a 3★ tier holds 185 films, and nothing on the duel screen hints that
 * there is another way through that.
 */
const DUEL_STEPS: readonly TourStep[] = [
  {
    id: "pick",
    target: "card",
    title: "Tap the one you prefer",
    body: "These two have the same star rating from you. That group is a tier, and Rankd puts it in order. Not which is better, but which you'd rather watch. Tap it.",
  },
  {
    id: "flick",
    target: "card",
    title: "Flick when you already know",
    body: "Decide if a film belongs at the top or bottom of your tier. Flick up and it parks at the top. Flick down sends it to the bottom. No duel gets recorded, you're skipping the argument.",
  },
  {
    id: "hold",
    target: "card",
    title: "Hold for the details",
    body: "Press and hold a poster for the year, director, cast, and where it sits in your order.",
  },
  {
    id: "strip",
    target: "strip",
    title: "The rest of the tier",
    body: "Pull this up to see everything you're working through. Tap any of them to jump straight there.",
  },
  {
    id: "roughcut",
    target: "rank",
    title: "Big library? Start with a Rough Cut",
    body: "A tier of 100 films is 4,950 duels. That's hours. Rough Cut breaks a tier into piles small enough. You'll instinctually know which you enjoy more.",
  },
];

/**
 * The list: shorter, and only about what the screen cannot say for itself.
 *
 * The UN-RNKD step is deliberately allowed to be absent. That divider only
 * exists while a tier still has unplaced films in it, so a user who has finished
 * ranking simply does not see a step explaining a label that is not on their
 * screen. `resolveSteps` handles it, and the counter adjusts.
 *
 * ── Why "row" carries the founding idea and not "unrnkd" ──────────────────
 *
 * A rating is not a position is the idea this whole tour exists for, and it used
 * to be stated ONLY in the UN-RNKD step — the one step that is allowed to
 * disappear. So the reader who had finished ranking a tier, which is to say the
 * reader furthest into the app, was the one who never had it explained at all.
 * The test guarding it asserted it on the droppable step too, so it looked
 * covered.
 *
 * It now lives in "row", which points at the list itself and can never be
 * absent. UN-RNKD keeps its own step and elaborates: same idea, applied to the
 * films that have no number yet.
 */
const LIST_STEPS: readonly TourStep[] = [
  {
    id: "row",
    target: "list-row",
    title: "Your ranking, in order",
    body: "One tier at a time, your favourite first. The stars decide which tier a film is in. The number on the right is a different thing: the position it holds across everything you've ranked. Tap any row to open it.",
  },
  {
    id: "unrnkd",
    target: "list-unrnkd",
    title: "UN-RNKD is not unrated",
    body: "Each tier holds films you rated the same. The ones marked UN-RNKD came in from your import and have never been ranked, so they've got no position yet. That's what the duels are for.",
  },
  {
    id: "jump",
    target: "list-jump",
    title: "Jump to a tier",
    body: "Straight to any star rating, with a count of how many you've locked there. Quickest way to find where there's work left.",
  },
];

/**
 * Rough Cut: the mode the app recommends and never explained.
 *
 * The duel tour has a step saying this mode EXISTS and points at the nav cell.
 * That was the whole of it. Arriving here you got a poster, three words and no
 * indication that the card is draggable, that a flick does anything, or that
 * leaving keeps your work — on the surface the app tells new users to start
 * with, and the one whose gestures are least guessable, because there is no
 * opponent to make "tap the one you prefer" self-evident.
 *
 * It could not have fired even if it existed: `tourFor` gates the duel tour on
 * a live session, and Rough Cut runs without one. So this is its own tour with
 * its own trigger, on the same deferred path — see `onRoughCutBegan`.
 *
 * Middle used to need its own sentence because it had no gesture — up and down
 * are one gesture with two directions and read as a pair, and a reader who has
 * just been taught two flicks looks for a third that was not there.
 *
 * It is there now: a tap on the CARD files it to the middle (register C8). So
 * the step teaches three gestures rather than two and an exception, which is
 * both shorter and the truth.
 */
const ROUGHCUT_STEPS: readonly TourStep[] = [
  {
    id: "rc-card",
    target: "rc-card",
    title: "One at a time",
    body: "One tier, broken into three piles: upper, middle, lower. This is the film you're placing. There's nothing to compare it against, so go with your gut.",
  },
  {
    id: "rc-targets",
    target: "rc-targets",
    title: "Upper, middle or lower",
    body: "Tap the pile this film belongs in. The count above it goes up. The poster takes gestures too, if you'd rather not aim.",
  },
  {
    id: "rc-flick",
    target: "rc-card",
    title: "Or flick it",
    body: "Flick up for upper, down for lower, or tap the poster for middle. Drag a little first and the target you're aimed at lifts, so you can see where it'll land.",
  },
  {
    id: "rc-hold",
    target: "rc-card",
    title: "Hold for the details",
    body: "Press and hold the poster for the year, director, cast, and where it sits in your order.",
  },
  {
    id: "rc-count",
    target: "rc-count",
    title: "How many are left",
    body: "This counts down as you go.",
  },
  {
    id: "rc-out",
    target: "rc-out",
    title: "Skip, undo, stop",
    body: "Not sure? Skip sends it to the back and brings it round later. Undo takes back the last one. Done saves everything and picks up where you left off.",
  },
];

/**
 * Logging a film: one step, because there is one idea.
 *
 * The search box explains itself. What does not is that this is how a film gets
 * INTO the library at all outside an import — the app's whole vocabulary is
 * built on films you already rated somewhere else, and nothing said that
 * tonight's viewing has a way in.
 *
 * Kept to a single step deliberately. This sheet is reached on purpose, by
 * somebody who has just watched something, and a four-step tour standing
 * between them and typing a title would be the tutorial getting in the way of
 * the thing it is explaining.
 */
const LOG_STEPS: readonly TourStep[] = [
  {
    id: "log-search",
    target: "log-search",
    title: "Just watched something?",
    body: "Search for it, give it a rating, and it joins that tier as UN-RNKD. It's in the queue with everything else now.",
  },
];

export const TOURS: Record<TourId, readonly TourStep[]> = {
  duel: DUEL_STEPS,
  list: LIST_STEPS,
  roughcut: ROUGHCUT_STEPS,
  log: LOG_STEPS,
};

/**
 * The steps whose target is actually on screen, in order.
 *
 * A step pointing at nothing is worse than a missing step: the spotlight would
 * land in a corner and the caption would explain a control the reader cannot
 * see. The strip and the UN-RNKD divider are both real cases, not defensive
 * ones, so this filters rather than asserts.
 */
export function resolveSteps(
  isPresent: (target: string) => boolean,
  steps: readonly TourStep[],
): TourStep[] {
  return steps.filter((s) => isPresent(s.target));
}

/**
 * Which tours this browser has finished or skipped.
 *
 * Stored as a list rather than a flag because there are now two, and they are
 * reached at different moments: somebody can complete the duel tour weeks before
 * first opening their list. A single boolean would have silently swallowed the
 * second one.
 */
export function seenTours(): Set<TourId> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    // "1" was the original single-tour flag. It only ever meant the duel.
    if (raw === "1") return new Set<TourId>(["duel"]);
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? (parsed as TourId[]) : []);
  } catch {
    // Unreadable. Treat every tour as seen rather than unseen: a tutorial that
    // cannot record having run would otherwise reappear on every single open,
    // which is far worse than never appearing at all.
    return new Set<TourId>(["duel", "list", "roughcut", "log"]);
  }
}

/**
 * Remember that one ran. Called on finish AND on skip, because skipping is a
 * decision about the tutorial rather than a postponement of it, and re-offering
 * something somebody just dismissed is how a tutorial becomes an irritation.
 * Settings is where it lives afterwards.
 */
export function markTourSeen(id: TourId, seen: ReadonlySet<TourId> = seenTours()): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...seen, id])]));
  } catch {
    // Nothing to do. `seenTours` fails closed, so it cannot loop.
  }
}

// ── A screen asking for its own tour ───────────────────────────────────────
//
// Most tours are owed at a moment `AppShell` can see: arriving at the list, a
// run beginning. Logging a film is not one of those. That sheet is opened from
// `BottomNav`, which is rendered inside all three screens — so telling AppShell
// about it by prop would mean the same pass-through added to three separate
// chains, existing only to carry one boolean upward.
//
// So the screen says so directly. `AppShell` still decides whether the tour is
// actually owed (seen? replaying? a library with something in it?) — this only
// reports that a surface with something to teach is now on screen, which is the
// half the screen is the authority on.

type TourListener = (id: TourId) => void;
const wanted = new Set<TourListener>();

/** A surface that has a tour just appeared. Safe to call when none is owed. */
export function requestTour(id: TourId): void {
  for (const fn of wanted) fn(id);
}

export function onTourRequested(fn: TourListener): () => void {
  wanted.add(fn);
  return () => wanted.delete(fn);
}

/** Settings asking for the whole thing again, both screens. */
export function forgetTours(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Then it stays seen, and the button appears to do nothing. Acceptable:
    // storage being unavailable is already the case where none of this works.
  }
}
