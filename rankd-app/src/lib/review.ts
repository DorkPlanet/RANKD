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

const KEY = "rankd-review-dismissed-v1";

export function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function dismiss(id: string): Set<string> {
  const next = loadDismissed();
  next.add(id);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // A dismissal that fails to persist costs one repeated prompt. Not worth
      // failing anything over.
    }
  }
  return next;
}
