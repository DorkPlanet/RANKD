// A take: why a film you locked is where it is, said out loud.
//
// ── Not a new object. The one that already exists, published ───────────────
//
// `lib/tags.ts` has asked "what puts it there?" at every lock since it shipped,
// and the answer — up to three tags and one short line — has been sitting in the
// library ever since, private. `types.ts` promised exactly that: they "sit HERE,
// beside `lock`… That keeps them local, synchronous, backed up with everything
// else." So a take is not a second kind of writing and does not get a second
// editor. It is the answer somebody already gave, with permission attached.
//
// ── Which is why publishing is its own act ─────────────────────────────────
//
// Everything already tagged was tagged under that promise. Making every existing
// note public because a feature shipped would break it retroactively, for people
// who are not here to be asked. So publication is recorded ON the film and its
// ABSENCE means private — which is what every film written before today is, at
// no cost and with no migration.
//
// ── The rank is stored, never derived ──────────────────────────────────────
//
// A take keeps the position its film held when it was written, so it can say
// "was #3 · now #40". That cannot be recovered afterwards: the ranking is a live
// order and the old position is gone the instant it changes. This is the one
// place in the app where changing your mind is the content rather than the
// bookkeeping, and it only works because the earlier number was kept at the time.

import { isHard } from "@/lib/lock";
import { cleanNote, cleanScene, cleanTags } from "@/lib/tags";
import type { Film } from "@/lib/types";

/**
 * When a take was published, and where its film sat then.
 *
 * Absent on a film means the tags and note are private, which is every film
 * tagged before takes existed.
 */
export interface Take {
  /** Epoch milliseconds. */
  at: number;
  /** 1-based position among placed films when it was written. */
  rank: number;
}

/**
 * A published take, as it travels.
 *
 * Single-letter keys for the same reason `SnapshotEntry` uses them: these ride
 * the snapshot on every push and nothing human reads the wire format.
 */
export interface SnapshotTake {
  /** `slugId`, matching `SnapshotEntry.i`. Cross-user stable. */
  i: string;
  /** Rank when written. */
  w: number;
  /** Rank now. Sent rather than derived so the server never re-sorts. */
  r: number;
  /** Published at, epoch ms. */
  a: number;
  g?: string[];
  n?: string;
  /** The favourite scene. */
  c?: string;
  /** Hide the scene and the note until a reader asks. */
  x?: boolean;
  /** Title, year and artwork, so a card can draw without a second read. */
  t: string;
  y?: string;
  p?: string;
}

/**
 * How many takes a profile shows.
 *
 * The user's own instinct, and it is the right one: ten is a top ten, and a
 * shelf you can read to the end of is worth reading. Note this is a DISPLAY
 * rule, not a write rule — a take is earned by locking a film, and gating
 * writing at ten would mean a feed that runs dry after fifty people have each
 * said ten things.
 */
export const TAKE_SHELF = 10;

/**
 * How far a film must move before the take says so.
 *
 * Borrowed from `MIN_MOVE` in `feed.ts`, whose comment puts it best: a small
 * move is "noise wearing a fact's clothes". A take that announces a one-place
 * drift teaches people to stop reading the line.
 */
export const MIN_TAKE_MOVE = 3;

/** Something was actually said. An empty take is a tap, not a statement. */
export function hasSubstance(film: Film): boolean {
  return (
    cleanTags(film.tags).length > 0 ||
    cleanNote(film.note) !== undefined ||
    cleanScene(film.scene) !== undefined
  );
}

/**
 * May this film carry a take?
 *
 * The lock is the gate, and it is the app's own rule rather than a new one:
 * every mechanic here is earn-it-by-duelling and nothing is assert-it. A hard
 * lock is the moment somebody stopped, looked at a position and committed to it,
 * which is both the strongest signal they give and the only one worth attaching
 * writing to.
 *
 * Read separately from `isPublished` on purpose: a take SURVIVES its film being
 * unlocked or demoted. That is the whole point of storing the rank — losing the
 * take at the moment it became interesting would delete the only record that
 * somebody changed their mind.
 */
export function canTake(film: Film): boolean {
  return isHard(film) && hasSubstance(film);
}

export function isPublished(film: Film): boolean {
  return film.take !== undefined;
}

/**
 * Every published take, in the order the ranking currently holds them.
 *
 * Takes `ranked` already sorted best-first — the caller has that ordering and
 * computing a second one here would be a second, possibly disagreeing answer.
 * The same contract `signatureOf` uses, for the same reason.
 */
export function takesFrom(ranked: readonly Film[]): SnapshotTake[] {
  const out: SnapshotTake[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const film = ranked[i];
    const take = film.take;
    if (!take || !hasSubstance(film)) continue;
    const tags = cleanTags(film.tags);
    const note = cleanNote(film.note);
    const scene = cleanScene(film.scene);
    out.push({
      i: film.id,
      w: take.rank,
      // Positions are 1-based everywhere a person sees one.
      r: i + 1,
      a: take.at,
      ...(tags.length ? { g: tags } : {}),
      ...(note ? { n: note } : {}),
      ...(scene ? { c: scene } : {}),
      // Only ever sent alongside something it could hide. A spoiler flag on a
      // take with no words is a warning about nothing.
      ...(film.spoiler && (scene || note) ? { x: true } : {}),
      t: film.title,
      ...(film.year ? { y: film.year } : {}),
      ...(film.poster ? { p: film.poster } : {}),
    });
  }
  return out;
}

/**
 * What the take says about where its film has got to since.
 *
 * `null` when it has not meaningfully moved, so a card can leave the line out
 * rather than print "was #3 · now #3", which reads as a bug.
 */
export function movedSince(take: { w: number; r: number }): { from: number; to: number } | null {
  if (Math.abs(take.w - take.r) < MIN_TAKE_MOVE) return null;
  return { from: take.w, to: take.r };
}
