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
    body: "These two films have the same star rating from you. Films sharing a rating are called a tier, and this app puts your tier in order. Not which film is better, but which you'd rather watch. Tap it.",
  },
  {
    id: "flick",
    target: "card",
    title: "Flick when you already know",
    body: "Sure it's your favourite in the tier? Flick the card up and it parks at the top. Flick down sends it to the bottom. No duel is recorded, because you're skipping the argument rather than winning it.",
  },
  {
    id: "hold",
    target: "card",
    title: "Hold for the details",
    body: "Press and hold a poster to open the film: year, director, cast, and where it sits in your order.",
  },
  {
    id: "strip",
    target: "strip",
    title: "The rest of the tier",
    body: "Pull this up to see every film you're working through, and tap any of them to jump straight there.",
  },
  {
    id: "roughcut",
    target: "rank",
    title: "Got a big library? Start with a Rough Cut",
    body: "A tier of 100 films is 4,950 duels this way, which is hours. Rough Cut is 100 taps, which is about two minutes, and it leaves every pile small enough to duel properly afterwards. It lives under RNK.",
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
    body: "One tier at a time, your favourite first. Nothing here says a film is better than another, only that you'd reach for it sooner. The number on the left is where it sits across everything. Tap any row to open it.",
  },
  {
    id: "unrnkd",
    target: "list-unrnkd",
    title: "UN-RNKD is not unrated",
    body: "Each tier holds the films you rated the same. Inside it, the ones marked UN-RNKD are imported films that have never been through the ranking system, so they have no position yet. Giving one a position is what the duels are for.",
  },
  {
    id: "jump",
    target: "list-jump",
    title: "Jump to a tier",
    body: "Straight to any star rating, with a count of how many you've settled there. It's the quickest way to find where there's still work.",
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
 * Middle deliberately gets its own step. Up and down are one gesture with two
 * directions and read as a pair; the middle pile has no gesture at all, and a
 * reader who has just been taught two flicks will look for a third.
 */
const ROUGHCUT_STEPS: readonly TourStep[] = [
  {
    id: "rc-card",
    target: "rc-card",
    title: "One at a time",
    body: "One tier for you to break into smaller piles: upper, middle, lower. This is the film you're placing, and there is nothing to compare it against.",
  },
  {
    id: "rc-targets",
    target: "rc-targets",
    title: "Upper, middle or lower",
    body: "Once it's in smaller piles you finally get to decide where your taste lies. Tap the pile this film belongs in, and the count above it goes up.",
  },
  {
    id: "rc-flick",
    target: "rc-card",
    title: "Or flick it",
    body: "Flick the card up for upper, down for lower. Drag it a little first and the target you're aimed at lifts, so you can see where it will land before you let go. Middle has no flick: tap it.",
  },
  {
    id: "rc-hold",
    target: "rc-card",
    title: "Hold for the details",
    body: "Press and hold the poster to open the film: year, director, cast, and where it sits in your order.",
  },
  {
    id: "rc-count",
    target: "rc-count",
    title: "How many are left",
    body: "This counts down as you go. A big tier is a few minutes at one a second, which is the point of doing it this way.",
  },
  {
    id: "rc-out",
    target: "rc-out",
    title: "Stopping keeps your work",
    body: "Done saves everything you placed and leaves the rest for later. Undo takes back the last one. Come back to a half-finished pass and it picks up where you stopped.",
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
    body: "Search for it, give it a rating, and it joins that tier as UN-RNKD. It is then in the queue like everything else, waiting to be put in order.",
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
