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

/**
 * The longest a comment may be.
 *
 * Lives HERE rather than beside the code that inserts it, and the reason is a
 * bundling one this codebase has already been bitten by once: `FeedScreen` needs
 * this number to count down as somebody types, `activity.ts` imports the
 * database, and a client component importing a VALUE from that module drags the
 * Postgres driver into the browser bundle. `searchRules.ts` exists for the same
 * reason. Types are erased and cost nothing; values are not.
 */
export const COMMENT_MAX = 280;

/** One thing somebody said, with enough of them attached to render it. */
export interface CommentItem {
  id: string;
  body: string;
  createdAt: string;
  handle: string;
  avatarUrl: string | null;
  /** Yours, so it can be taken back. */
  mine: boolean;
}

/** A card as the screen receives it. */
export interface FeedItem {
  id: string;
  kind: string;
  subjectId: string;
  meta: Record<string, unknown>;
  createdAt: string;
  handle: string;
  avatarUrl: string | null;
  /** Yours, not theirs. */
  mine: boolean;
  /**
   * Where the READER has this same film, if they have placed it.
   *
   * ── This is the line that makes a card an argument ─────────────────────
   *
   * A feed of "Heat climbed to #1" is a ticker: true, and nothing to say back
   * to. "They have it #1, you have it #14" is a disagreement with a name on it,
   * and it reads differently for every person who opens the card.
   *
   * No other app can draw this, and the reason is structural rather than clever:
   * it needs two people's complete ordered lists, and an app built on star
   * ratings has neither. Rankd already stores both, so it costs one lookup.
   */
  yourRank?: number;
  comments: number;
}

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

export type ActivityKind = "climb" | "promotion" | "arrival" | "placed" | "milestone";

/**
 * The counts a milestone is crossed on.
 *
 * ── Why milestones are here at all ─────────────────────────────────────────
 *
 * Every other card is about the top ten, because that is the only place the
 * snapshot carries titles. Somebody who ranks hard for an evening and shifts
 * nothing up there gets one quiet "40 more ranked" line, which undersells a real
 * session — and somebody with a settled top ten could rank for a month and never
 * appear.
 *
 * A milestone is the one thing that says the work happened rather than what it
 * moved. It is also the only card in the feed that is purely about persistence,
 * which is the thing this app actually asks of people.
 */
export interface Counts {
  /** Duels fought, ever. */
  duels: number;
  /** Films with a position, ever. */
  placed: number;
}

/**
 * Where a milestone sits.
 *
 * Round numbers a person would notice, spaced so they arrive rarely enough to
 * still mean something. Doubling roughly each step: hitting 500 duels should
 * feel like a longer walk than hitting 250 did, because it was.
 */
export const DUEL_MARKS = [100, 250, 500, 1000, 2500, 5000, 10000];
export const PLACED_MARKS = [25, 50, 100, 250, 500, 1000];

/** The largest mark crossed by going from `was` to `now`, if any. */
export function crossed(marks: readonly number[], was: number, now: number): number | null {
  let best: number | null = null;
  for (const mark of marks) if (was < mark && now >= mark) best = mark;
  return best;
}

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
  counts?: { was: Counts; now: Counts },
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

  // Milestones outrank everything. They are rare by construction, and a card
  // saying somebody just passed a thousand duels is worth more than the third
  // climb of the same evening.
  if (counts) {
    const duels = crossed(DUEL_MARKS, counts.was.duels, counts.now.duels);
    if (duels) {
      cards.push({ row: { kind: "milestone", subjectId: "", meta: { of: "duels", at: duels } }, weight: 900 });
    }
    const films = crossed(PLACED_MARKS, counts.was.placed, counts.now.placed);
    if (films) {
      cards.push({ row: { kind: "milestone", subjectId: "", meta: { of: "placed", at: films } }, weight: 800 });
    }
  }

  return cards
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_CARDS)
    .map((c) => c.row);
}

/**
 * "3m", "5h", "2d" — a feed's register, not a sentence's.
 *
 * `Account.tsx` says "3 minutes ago" and is right to: that screen is answering
 * "is my work safe", where being explicit is worth the words. A feed stamps
 * every row, so the same phrasing repeated forty times becomes furniture. The
 * unit alone is enough once the reader has decoded one of them.
 *
 * Anything past a week gets a date instead. "63d" is not a length of time
 * anybody feels, and by then WHEN it happened has stopped mattering more than
 * roughly where in the year it sits.
 */
export function shortAgo(iso: string, now: number = Date.now()): string {
  const secs = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (secs < 45) return "now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
