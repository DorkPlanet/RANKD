// Where the evidence disagrees with your list.
//
// This is the whole point of keeping a log, and the line the app refuses to
// cross. Nth, faced with the same disagreement, silently moves the film and then
// needs a subsystem to explain what happened. Rankd asks instead.
//
// So nothing here changes anything. It reads the list, reads the model, and
// returns questions. Every answer goes through the mechanic the user already
// trusts — a spotlight, or a promotion duel — so a film only ever moves because
// they moved it.
//
// Two kinds of disagreement:
//
//   MISPLACED  — the film's position inside its own star tier looks wrong.
//                Answered by re-placing it among its peers.
//   UNDERRATED — the evidence puts it above films in the tier ABOVE. Scores
//                can't cross a band on their own (shuffle.ts), so this is the
//                only route that surfaces it at all.

import { LARGE_MOVE_THRESHOLD, confidenceFromSpread, type Belief } from "./bayes";
import { seedOf } from "./beliefs";
import { isHard, isPlaced } from "./lock";
import { tierAbove, type Rating } from "./tiers";
import type { Film } from "./types";

/**
 * How settled a film must be before its disagreement is worth raising.
 *
 * Without a floor the card would nominate films on the strength of a single
 * surprising duel, which is nagging rather than helping — and the fastest way to
 * teach someone to ignore a prompt is to be wrong the first few times. Set below
 * PLACE_CONFIDENCE so a film can be questioned before it is auto-placed, but far
 * enough above nothing that one upset is never enough.
 */
export const REVIEW_CONFIDENCE_FLOOR = 0.35;

export interface Suggestion {
  film: Film;
  kind: "misplaced" | "underrated";
  /**
   * How loud the disagreement is. For a misplaced film, the signed number of
   * places the evidence would move it (positive = it belongs higher). For an
   * underrated one, how many films of the tier above it is currently beating.
   */
  drift: number;
  /** The tier the evidence thinks it belongs in, for an underrated film. */
  promoteTo?: Rating;
}

const meanOf = (film: Film, beliefs: Map<string, Belief>): number =>
  beliefs.get(film.id)?.mean ?? seedOf(film);

const confidenceOf = (film: Film, beliefs: Map<string, Belief>): number => {
  const b = beliefs.get(film.id);
  return b ? confidenceFromSpread(b.spread) : 0;
};

/**
 * Everything the evidence would like to argue with, worst disagreement first.
 *
 * `dismissed` is film ids the user has already waved away. They are filtered
 * here rather than at the call site so a dismissal cannot be forgotten by one
 * caller and honoured by another.
 */
export function suggestions(
  films: readonly Film[],
  beliefs: Map<string, Belief>,
  dismissed: ReadonlySet<string> = new Set(),
): Suggestion[] {
  if (beliefs.size === 0) return [];
  const out: Suggestion[] = [];

  // Group by tier once: both checks are per-tier, and an 828-film library makes
  // repeated filtering per film genuinely expensive.
  const byTier = new Map<number, Film[]>();
  for (const f of films) byTier.set(f.rating, [...(byTier.get(f.rating) ?? []), f]);

  for (const [tier, inTier] of byTier) {
    // Where they sit now, and where the evidence would put them.
    const bySccore = [...inTier].sort((a, b) => b.score - a.score);
    const byBelief = [...inTier].sort((a, b) => meanOf(b, beliefs) - meanOf(a, beliefs));
    const nowAt = new Map(bySccore.map((f, i) => [f.id, i]));
    const wouldBe = new Map(byBelief.map((f, i) => [f.id, i]));

    const above = tierAbove(tier as Rating);
    const peersAbove = above === undefined ? [] : (byTier.get(above) ?? []);
    // The weakest film of the tier above, by belief — the bar to clear.
    const barAbove = peersAbove.length
      ? Math.min(...peersAbove.map((f) => meanOf(f, beliefs)))
      : Infinity;

    for (const film of inTier) {
      if (dismissed.has(film.id)) continue;
      // A film with no position has nothing to disagree with. "Heat keeps
      // beating films ranked above it" is meaningless about a film that isn't
      // ranked — those are for Fast Shuffle to place, not for the card to argue
      // about.
      if (!isPlaced(film)) continue;
      if (confidenceOf(film, beliefs) < REVIEW_CONFIDENCE_FLOOR) continue;

      // Underrated first: it is the stronger claim, and a film that belongs in a
      // higher tier is not also usefully described as "misplaced in this one".
      if (above !== undefined && peersAbove.length > 0 && meanOf(film, beliefs) > barAbove) {
        // How many films of the tier above it is beating — a real magnitude, so
        // the loudest case is shown first. Reporting 0 here left every underrated
        // suggestion tied and the order arbitrary.
        const clears = peersAbove.filter((p) => meanOf(film, beliefs) > meanOf(p, beliefs)).length;
        out.push({ film, kind: "underrated", drift: clears, promoteTo: above });
        continue;
      }

      const drift = (nowAt.get(film.id) ?? 0) - (wouldBe.get(film.id) ?? 0);
      if (Math.abs(drift) >= LARGE_MOVE_THRESHOLD) {
        out.push({ film, kind: "misplaced", drift });
      }
    }
  }

  // Loudest disagreement first — an underrated film outranks any drift, since
  // being in the wrong tier is a bigger claim than being in the wrong place.
  //
  // Then HARD locks ahead of soft ones. A disagreement with a placement the user
  // committed to is the genuinely interesting one: it says "what you decided and
  // what you have since done disagree". A disagreement with the model's own soft
  // placement is just the model revising itself, which it does silently anyway —
  // no reason to interrupt anyone about it.
  return out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "underrated" ? -1 : 1;
    const byLock = Number(isHard(b.film)) - Number(isHard(a.film));
    if (byLock !== 0) return byLock;
    return Math.abs(b.drift) - Math.abs(a.drift);
  });
}

// ── Dismissals ──────────────────────────────────────────────────────────
//
// There used to be one verb. The button said "Not now" and called a function
// that added the film to a permanent list, so the only way to clear a card was
// to silence that film forever — a snooze control wired to a mute switch. And
// because only the top suggestion renders, dismissing one put the next in its
// place instantly: an unbounded queue that refilled on the spot, which is why
// the card felt like it was following you around.
//
// Two verbs now, and they mean what they say.
//
//   SNOOZE — "not now". Comes back after SNOOZE_DAYS. This is the common one.
//   MUTE   — "never". What the old dismiss did, but now only when asked for.
//
// The cooldown is separate from both and does the actual work of making the card
// rare: after you answer or wave away ANY card, nothing is offered again for
// COOLDOWN_HOURS. One question per sitting is a prompt; four is nagging.

const KEY = "rankd-review-dismissed-v1";

/** How long "not now" lasts. Long enough to be a real reprieve. */
const SNOOZE_DAYS = 14;
/** Quiet period after any answer, so cards never queue up behind each other. */
const COOLDOWN_HOURS = 20;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

interface DismissState {
  /** Film id → epoch ms when it may be shown again. */
  snoozed: Record<string, number>;
  /** Film ids silenced for good. */
  muted: string[];
  /** When the last card was answered or waved away. */
  lastSeen?: number;
}

const EMPTY: DismissState = { snoozed: {}, muted: [] };

// v1 was a bare array of ids, all of them permanent. Read as mutes, because that
// is what they did — the user pressed a button labelled "Not now" and got a mute,
// and quietly downgrading those to snoozes would resurface films they have not
// thought about in months. The label was wrong; their intent to stop seeing that
// card was not.
function read(): DismissState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as string[] | DismissState;
    if (Array.isArray(parsed)) return { snoozed: {}, muted: parsed };
    return { snoozed: parsed.snoozed ?? {}, muted: parsed.muted ?? [], lastSeen: parsed.lastSeen };
  } catch {
    return EMPTY;
  }
}

function write(state: DismissState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A dismissal that fails to persist costs one repeated prompt. Not worth
    // failing anything over.
  }
}

// The two decisions are pure so they can be tested without a DOM — the suite
// runs in node, and this file's storage half cannot be exercised there. The
// exported wrappers below are the thin part: read, delegate, done.

/** Hidden right now: muted for good, or snoozed and not yet due. */
export function hiddenFrom(state: DismissState, now: number): Set<string> {
  const hidden = new Set(state.muted);
  for (const [id, until] of Object.entries(state.snoozed)) {
    if (until > now) hidden.add(id);
  }
  return hidden;
}

/** Whether the quiet period since the last answered card has elapsed. */
export function allowedFrom(state: DismissState, now: number): boolean {
  return state.lastSeen === undefined || now - state.lastSeen >= COOLDOWN_HOURS * HOUR_MS;
}

/**
 * Everything that should not be offered right now.
 *
 * Expired snoozes simply stop matching rather than being swept on a timer, so
 * nothing has to remember to tidy the record.
 */
export function loadDismissed(now: number = Date.now()): Set<string> {
  return hiddenFrom(read(), now);
}

/** "Not now" — back in a fortnight. */
export function snooze(id: string, now: number = Date.now()): void {
  const state = read();
  write({
    ...state,
    snoozed: { ...state.snoozed, [id]: now + SNOOZE_DAYS * DAY_MS },
    lastSeen: now,
  });
}

/** "Never" — the old behaviour, now only when it is actually chosen. */
export function mute(id: string, now: number = Date.now()): void {
  const state = read();
  // Drop any snooze on the way — a muted film must not sit in both records,
  // where an expiring snooze would look like it should come back.
  const snoozed = { ...state.snoozed };
  delete snoozed[id];
  write({ ...state, snoozed, muted: [...new Set([...state.muted, id])], lastSeen: now });
}

/** Answering a card counts as engagement, and starts the same quiet period. */
export function markAnswered(now: number = Date.now()): void {
  write({ ...read(), lastSeen: now });
}

/**
 * Whether a card may be shown at all.
 *
 * This is what stops the queue. Without it, waving one card away simply promoted
 * the next — the supply is dozens deep on a real library, so "dismiss" felt like
 * it did nothing.
 */
export function offerAllowed(now: number = Date.now()): boolean {
  return allowedFrom(read(), now);
}

/** Exported for tests; the shape `hiddenFrom` and `allowedFrom` read. */
export type { DismissState };
export { SNOOZE_DAYS, COOLDOWN_HOURS };
