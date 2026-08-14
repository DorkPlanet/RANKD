// What the app never told anyone.
//
// ── Coach marks, not a carousel ────────────────────────────────────────────
//
// Every gesture in this app is physical: a tap picks, a flick asserts, a hold
// explains, and none of them is discoverable by looking. A new user was left to
// infer all of it. The reference the user supplied was all of one kind: marks
// drawn over the REAL screen, dismissible, with a step counter. Not a slideshow
// of pictures, because the whole idea here is that you are handling the films,
// so the tutorial points at the actual thing.
//
// ── One tour per screen ────────────────────────────────────────────────────
//
// The duel is where the game is, so it carries most of the teaching. The list is
// the other screen with something genuinely unguessable on it: the difference
// between a film with a number and a film marked UN-RNKD. That distinction is
// the app's central idea (a rating is not a position) and nothing on the screen
// explains it, so it gets its own short pass rather than being crammed into the
// duel's.
//
// The profile has no tour. Everything on it is a label next to a number, which
// is the one kind of screen that does explain itself.
//
// ── The tour never lets you play ───────────────────────────────────────────
//
// The overlay blocks the surface it is describing, which looks like a limitation
// and is the opposite. A duel fought during a tutorial is not a judgement about
// those two films, but `settle` cannot tell the difference, and every belief,
// badge and score in this app rests on the log being literally true. So the tour
// describes the gesture and the user performs it afterwards, for real. Same
// reason a person run records nothing.
//
// ── Copy rules ─────────────────────────────────────────────────────────────
//
// · Say what the gesture DOES, in the app's own vocabulary. "Flick up" without
//   "parks it at the top" teaches a motion and not a meaning, and the meaning is
//   the part nobody can guess.
// · PREFERENCE, never quality. The app is a record of what one person would
//   rather watch, not a verdict on which film is better. There is a test for it.
// · No em dashes. They are the house tell of machine-written copy and this
//   screen is the first thing a new user reads.

const KEY = "rankd-tour-v1";

export type TourId = "duel" | "list";

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
    body: "Two films, one question. Not which is better, but which you'd rather watch. Tap it: that's a duel, and it is the whole game.",
  },
  {
    id: "flick",
    target: "card",
    title: "Flick to assert",
    body: "Certain it belongs at the very top? Flick the card up and it parks there. Flick down sends it to the bottom. No duel is recorded, because you're skipping the argument rather than winning it.",
  },
  {
    id: "hold",
    target: "card",
    title: "Hold for the details",
    body: "Press and hold a poster to open the film: year, director, cast, and where it currently sits.",
  },
  {
    id: "strip",
    target: "strip",
    title: "The pile you're in",
    body: "Pull this up for the pile you're working through, and to jump straight to any film in it.",
  },
  {
    id: "roughcut",
    target: "rank",
    title: "Start with a Rough Cut",
    body: "Ranking a big tier by duelling it is thousands of comparisons. Rough Cut deals it into three piles in a single pass: one decision per film, nothing compared. It lives under RNK, and on a full tier it's where to start.",
  },
];

/**
 * The list: shorter, and only about what the screen cannot say for itself.
 *
 * The UN-RNKD step is deliberately allowed to be absent. That divider only
 * exists while a tier still has unplaced films in it, so a user who has finished
 * ranking simply does not see a step explaining a label that is not on their
 * screen. `resolveSteps` handles it, and the counter adjusts.
 */
const LIST_STEPS: readonly TourStep[] = [
  {
    id: "row",
    target: "list-row",
    title: "Your ranking, in order",
    body: "Every tier in turn, best first. The number on the left is where that film sits. Tap any row to open it.",
  },
  {
    id: "unrnkd",
    target: "list-unrnkd",
    title: "Rated is not ranked",
    body: "Below this line are films you've rated but never placed. They have a star rating and no position yet. Ranking is the job of deciding the order inside a rating, which is what the duels are for.",
  },
  {
    id: "jump",
    target: "list-jump",
    title: "Jump to a tier",
    body: "Straight to any star rating, with a count of how much of it you've settled. It's the quickest way to find where there's still work.",
  },
];

export const TOURS: Record<TourId, readonly TourStep[]> = {
  duel: DUEL_STEPS,
  list: LIST_STEPS,
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
    return new Set<TourId>(["duel", "list"]);
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
