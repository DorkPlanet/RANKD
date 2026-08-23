// What a push is worth saying about.
//
// ── Derived on the server, never asserted by the client ────────────────────
//
// `POST /api/snapshot` receives the whole ranked order and UPSERTS it, so at the
// instant of every push the server holds both the stored order and the incoming
// one. Diffing them there gives every card below. A client cannot claim an event
// that did not happen, because it never claims anything — it pushes its ranking,
// exactly as it already did, and the facts fall out. It is idempotent for free:
// pushing the same library twice diffs to nothing.
//
// ── The cards are placements, not deltas ───────────────────────────────────
//
// The first version reported changes — "Heat climbed 4 places" — and that reads
// as a changelog, because a delta is interesting exactly once. What lasts is the
// PLACEMENT: "Heat is sam's #1" is checkable a year later, where "Heat beat
// Collateral" stops mattering the moment both films are sorted.
//
// The duel is the mechanism. The position is the product. Cards are about the
// product.
//
// ── And a shuffled position is not the person's doing ──────────────────────
//
// Fast Shuffle places films from your duels, but the specific rank is the
// model's, and that mode reserves the right to change its mind. A card saying
// "sam moved Heat to #40" credits somebody with a choice they did not make, and
// the hard/soft distinction is load-bearing everywhere else in this app.
//
// So the work gets ONE card that says what was done and names the best of it,
// and only the two things a person genuinely decided — adding a film, and
// locking one — get a card of their own.

import type { NamedFilm, SnapshotEntry } from "@/lib/snapshot";
import { TIER_RANGE } from "@/lib/tiers";

/**
 * The longest a written line may be.
 *
 * Lives HERE rather than beside the code that stores it, and the reason is a
 * bundling one this codebase has been bitten by twice: a client component needs
 * this number to count down as somebody types, the storage module imports the
 * database, and a client importing a VALUE from that module drags the Postgres
 * driver into the browser bundle. `searchRules.ts` exists for the same reason.
 * Types are erased and cost nothing; values are not.
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
   * ── The line that makes a card an argument ─────────────────────────────
   *
   * "Sinners went in at #3" is a fact you can only nod at. "They have it #3,
   * you have it #14" is a disagreement with a name on it, and it reads
   * differently for every person who opens the card.
   *
   * Shown ONLY to the reader. A public disagree counter, among a handful of
   * people who know each other, builds a scoreboard of who got dunked on — and
   * then people stop posting the placements that generate the feed at all.
   *
   * No other app can draw this line, for a structural reason rather than a
   * clever one: it needs two people's complete ordered lists, and an app built
   * on star ratings has neither.
   */
  yourRank?: number;
  /** How many people agreed with this placement. */
  likes: number;
  /** Whether the reader is one of them. */
  liked: boolean;
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

export type ActivityKind = "added" | "locked" | "session" | "milestone";

/**
 * How far down the list a lock is still news.
 *
 * Locking is the strongest signal a person gives — they stopped, looked, and
 * committed to a position. But a commitment at 400th is a filing decision, and
 * the feed is not a filing cabinet. A hundred is roughly where a list stops
 * being "films I love" and starts being "films I own".
 */
export const LOCK_DEPTH = 100;

/**
 * The counts a milestone is crossed on.
 *
 * The only card purely about persistence, which is the thing this app actually
 * asks of people. Without it somebody with a settled top ten could rank for a
 * month and never appear.
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
 * still mean something. Roughly doubling each step: hitting 500 duels should
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
 * How far a film must climb before the session card bothers naming it.
 *
 * One or two places is the ranking breathing. `MOVED` in `lib/taste.ts` exists
 * for the same reason and its comment puts it best: a small move is "noise
 * wearing a fact's clothes".
 */
export const MIN_MOVE = 3;

/**
 * The most cards one push may produce.
 *
 * The session card carries the bulk of a sitting, so this is a ceiling on the
 * NAMED events beside it rather than on the work itself.
 */
export const MAX_CARDS = 4;

/**
 * Escape the LIKE wildcards inside a handle.
 *
 * `_` is a LIKE wildcard AND a legal handle character, so searching for `@sam_j`
 * unescaped quietly also matches `@samxj`. `people.ts` escapes its search for
 * exactly this reason and says so; this is the same rule.
 *
 * Lives here rather than beside the query so it can be tested without a
 * database — the mistake it guards against is invisible until somebody with an
 * underscore in their name gets another person's notifications.
 */
export function escapeForLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => "\\" + c);
}

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
 * `named` is everything the incoming snapshot can put a title to — the top 250,
 * see `NamedFilm`. A film outside that folds into the session card, which needs
 * no titles.
 *
 * Pure, so the interesting cases are testable without a database.
 */
export function diffToActivity(
  before: readonly SnapshotEntry[],
  after: readonly SnapshotEntry[],
  named: readonly NamedFilm[],
  counts?: { was: Counts; now: Counts },
): ActivityRow[] {
  // A first-ever snapshot is not news. Everything would read as an arrival, and
  // somebody importing a library would fill their followers' feeds with the
  // contents of a spreadsheet — bookkeeping, not a statement.
  if (before.length === 0) return [];

  const was = new Map(before.map((e) => [e.i, e]));
  const byId = new Map(named.map((n) => [n.i, n]));
  const cards: { row: ActivityRow; weight: number }[] = [];

  // Everything the sitting did, whether or not any of it can be named.
  let addedCount = 0;
  let movedCount = 0;
  let best: { film: NamedFilm; to: number; gained: number } | null = null;

  for (const entry of after) {
    const previous = was.get(entry.i);
    const film = byId.get(entry.i);

    if (!previous) {
      addedCount++;
      // ── Added: the engine ───────────────────────────────────────────────
      //
      // You watched something, you ranked it, it landed somewhere. That is the
      // recurring act for the life of the app, and the payload — a position in a
      // total order — is the thing no ratings app can produce. Letterboxd's
      // version of this card ends at the watch; ours ends at a rank.
      if (film) {
        cards.push({
          row: {
            kind: "added",
            subjectId: entry.i,
            meta: {
              title: film.t,
              year: film.y,
              poster: film.p,
              rank: entry.r,
              rating: ratingOfScore(entry.s),
            },
          },
          weight: 500 - entry.r,
        });
      }
      continue;
    }

    const gained = previous.r - entry.r;
    if (gained >= MIN_MOVE) {
      movedCount++;
      if (film && (!best || gained > best.gained)) best = { film, to: entry.r, gained };
    }

    // ── Locked: the strongest signal a person gives ─────────────────────
    //
    // They stopped, looked, and committed to a position. `t` is the held-firmly
    // flag, so this fires on the transition and never again.
    if (previous.t === 0 && entry.t === 1 && entry.r <= LOCK_DEPTH && film) {
      cards.push({
        row: {
          kind: "locked",
          subjectId: entry.i,
          meta: {
            title: film.t,
            year: film.y,
            poster: film.p,
            rank: entry.r,
            rating: ratingOfScore(entry.s),
          },
        },
        weight: 700 - entry.r,
      });
    }
  }

  // ── The session: the work, credited to the person who did it ───────────
  //
  // One card for a sitting however much it moved, naming the single best result.
  // `activity.ts` folds repeat pushes into this same row — sync fires every ten
  // seconds while somebody is ranking, so without that a marathon would be fifty
  // of these rather than one.
  if (movedCount > 0 || addedCount > 0) {
    cards.push({
      row: {
        kind: "session",
        subjectId: "",
        meta: {
          added: addedCount,
          moved: movedCount,
          ...(best
            ? { bestTitle: best.film.t, bestPoster: best.film.p, bestRank: best.to, bestId: best.film.i }
            : {}),
        },
      },
      // Lowest, so a sitting that also produced a lock leads with the lock. The
      // session is the floor of the feed, not its headline.
      weight: 10,
    });
  }

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
