// What changed in somebody's ranking, as things worth reading.
//
// ── Derived on the server, never asserted by the client ────────────────────
//
// The original plan had the phone POST activity rows on the sync debounce, with
// a daily dedupe index to stop a re-sync becoming a firehose. That is not built,
// and does not need to be.
//
// `POST /api/snapshot` already receives the whole ranked order and UPSERTS it, so
// at the instant of every push the server is holding both the stored order and
// the incoming one. Diffing them there gives every card below directly. A client
// cannot claim an event that did not happen, because it never claims anything —
// it pushes its ranking, exactly as it already did, and the facts fall out.
//
// It is also idempotent for free: pushing the same library twice diffs to
// nothing, so there is no firehose to guard against in the first place.
//
// ── Why there is no upset card ─────────────────────────────────────────────
//
// "Picked Drive over Heat" is the best card this app could show and it is not
// here. Tier bands do not overlap (`lib/tiers.ts`), so a lower-rated film can
// never outrank a higher-rated one in the published order — an upset exists only
// in the duel log, which is local by architecture and has never left the device.
//
// `lib/notes.ts` can already phrase one as a bounded aggregate — "picked 28 Days
// Later over 4 films they rated higher" — if that door is ever opened. Opening it
// is a decision about what leaves the phone, not a feature, and it is not taken
// here.
//
// ── Only films the snapshot can name ───────────────────────────────────────
//
// `entries` carries ids and nothing else; titles live on `summary.topFilms`, of
// which there are ten. That reads like a limitation and is the right editorial
// rule anyway: a film climbing into somebody's top ten is a story, and one
// moving from 400th to 380th is churn. The constraint and the taste agree, so
// the code follows both.

import type { SnapshotEntry, SnapshotFilm } from "@/lib/snapshot";
import { TIER_RANGE } from "@/lib/tiers";

/** One card, shaped for the row it becomes. */
export interface ActivityRow {
  kind: ActivityKind;
  /** The film it is about — a `slugId`. Empty for a card about no one film. */
  subjectId: string;
  /**
   * Everything the card needs to render, copied in.
   *
   * Denormalised on purpose: a card should draw in one read, and it should
   * survive the film falling out of the library it came from. A feed that
   * silently loses its history when somebody re-ranks is not a feed.
   */
  meta: Record<string, unknown>;
}

export type ActivityKind = "climb" | "promotion" | "arrival" | "placed";

/**
 * How many places a film must gain before it is worth saying.
 *
 * One or two is the ranking breathing. `MOVED` in `lib/taste.ts` exists for the
 * same reason and its comment puts it best: a small move is "noise wearing a
 * fact's clothes".
 */
export const MIN_CLIMB = 3;

/**
 * The most cards one push may produce.
 *
 * A Fast Shuffle session moves hundreds of films. Every one of them is a fact
 * and almost none are worth reading, which is the same judgement the plan makes
 * about individual duels: a feed of everything is noise. Four is enough for a
 * session to have something to say and few enough that it never becomes a log.
 */
export const MAX_CARDS = 4;

/** Which star band a tier score sits in. Read from `TIER_RANGE` so it cannot drift. */
export function ratingOfScore(score: number): number {
  for (const [rating, [low, high]] of Object.entries(TIER_RANGE)) {
    if (score >= low && score <= high) return Number(rating);
  }
  return 0.5;
}

/**
 * The cards a push earns, best first and capped.
 *
 * `before` is what the server had stored, `after` is what just arrived, and
 * `top` is the incoming top ten — the only films that can be named.
 *
 * Pure, so the interesting cases are testable without a database: an identical
 * re-push producing nothing, and a five-hundred-film shuffle producing four
 * cards rather than five hundred.
 */
export function diffToActivity(
  before: readonly SnapshotEntry[],
  after: readonly SnapshotEntry[],
  top: readonly SnapshotFilm[],
): ActivityRow[] {
  // A first-ever snapshot is not news. Everything would read as an arrival, and
  // somebody importing a library would fill their followers' feeds with the
  // contents of a CSV — which is bookkeeping, not a statement.
  if (before.length === 0) return [];

  const was = new Map(before.map((e) => [e.i, e]));
  const now = new Map(after.map((e) => [e.i, e]));
  const cards: { row: ActivityRow; weight: number }[] = [];

  for (const film of top) {
    const nowEntry = now.get(film.id);
    if (!nowEntry) continue;
    const wasEntry = was.get(film.id);
    const shared = { title: film.title, year: film.year, poster: film.poster, rank: nowEntry.r };

    if (!wasEntry) {
      // Newly placed AND straight into the top ten, which is the only way a film
      // arrives here worth mentioning.
      cards.push({
        row: { kind: "arrival", subjectId: film.id, meta: { ...shared, rating: film.rating } },
        weight: 100 - nowEntry.r,
      });
      continue;
    }

    // Ranks count DOWN toward the top, so a gain is a decrease — the same
    // convention `canon/movement.ts` documents.
    const gained = wasEntry.r - nowEntry.r;
    if (gained >= MIN_CLIMB) {
      cards.push({
        row: { kind: "climb", subjectId: film.id, meta: { ...shared, from: wasEntry.r, places: gained } },
        weight: 200 + gained,
      });
    }

    const before5 = ratingOfScore(wasEntry.s);
    const after5 = ratingOfScore(nowEntry.s);
    if (after5 > before5) {
      cards.push({
        row: { kind: "promotion", subjectId: film.id, meta: { ...shared, from: before5, to: after5 } },
        weight: 300 + (after5 - before5) * 10,
      });
    }
  }

  // The one card about no single film, and the quietest. It exists so an evening
  // of Fast Shuffle that shifted nothing at the top still says something, rather
  // than the feed implying nobody did anything.
  const placed = after.length - before.length;
  if (placed > 0) {
    cards.push({ row: { kind: "placed", subjectId: "", meta: { count: placed } }, weight: 1 });
  }

  return cards
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_CARDS)
    .map((c) => c.row);
}
