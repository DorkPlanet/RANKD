// Writing feed cards, and reading them back.
//
// The deciding is in `feed.ts` and is pure. This is the database half: what gets
// stored, who is allowed to produce it, and the one query the feed screen makes.

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { activity, db, follows, tasteSnapshots, users } from "@/lib/db";
import { diffToActivity } from "@/lib/social/feed";
import type { SnapshotEntry, SnapshotSummary } from "@/lib/snapshot";

/** How far back the feed reaches in one read. */
const PAGE = 40;

/**
 * Turn a push into cards, if this account is one that should produce any.
 *
 * Called from the snapshot route with the INCOMING order, before the stored one
 * is overwritten. Never throws into the caller: a feed is decoration on top of a
 * sync, and a failure to work out that a film climbed must not cost somebody the
 * push of their actual ranking.
 */
export async function writeFeedCards(
  user: { id: string; kind: "person" | "house" },
  entries: SnapshotEntry[],
  summary: SnapshotSummary,
): Promise<void> {
  // ── A house account publishes nothing ────────────────────────────────────
  //
  // `@rankd` re-derives its canon on a schedule, so without this it would post
  // a fistful of climbs into every follower's feed every time the cron ran —
  // the astroturf the `accountKind` enum exists to prevent, arriving by the back
  // door. Its ranking is a place you visit, not a thing that shouts.
  if (user.kind !== "person") return;

  try {
    const stored = await db.query.tasteSnapshots.findFirst({
      where: eq(tasteSnapshots.userId, user.id),
      columns: { entries: true },
    });
    const rows = diffToActivity(stored?.entries ?? [], entries, summary.topFilms ?? []);
    if (rows.length === 0) return;

    await db
      .insert(activity)
      .values(rows.map((r) => ({ actorId: user.id, kind: r.kind, subjectId: r.subjectId, meta: r.meta })))
      // Nothing to conflict with any more — see the schema for why the daily
      // dedupe index is gone. Kept as a no-op guard so a future unique
      // constraint cannot turn a duplicate into a failed sync.
      .onConflictDoNothing();
  } catch {
    // See above: the sync is the job, this is not.
  }
}

export interface FeedItem {
  id: string;
  kind: string;
  subjectId: string;
  meta: Record<string, unknown>;
  createdAt: string;
  handle: string;
  avatarUrl: string | null;
}

/**
 * The feed for one reader: everybody they follow, and themselves.
 *
 * ── Yourself is in it, and that is the empty state ───────────────────────
 *
 * Following nobody would otherwise be a blank screen telling you to go and find
 * people, which is the same broken promise the Activity cell used to make. Your
 * own cards mean the screen always demonstrates what it is FOR, and they are the
 * cards you are best placed to judge.
 *
 * ── Fanned out on READ ───────────────────────────────────────────────────
 *
 * One indexed join over a few hundred rows. Fanning out on write multiplies
 * every push by the follower count and needs a backfill on every new follow,
 * which is the wrong trade at any scale this app will see for years.
 */
export async function feedFor(viewerId: string, limit = PAGE): Promise<FeedItem[]> {
  const following = await db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, viewerId));

  const actors = [...new Set([viewerId, ...following.map((f) => f.id)])];

  const rows = await db
    .select({
      id: activity.id,
      kind: activity.kind,
      subjectId: activity.subjectId,
      meta: activity.meta,
      createdAt: activity.createdAt,
      handle: users.handle,
      avatarUrl: users.avatarUrl,
      suspendedAt: users.suspendedAt,
      deletedAt: users.deletedAt,
    })
    .from(activity)
    .innerJoin(users, eq(users.id, activity.actorId))
    .where(
      and(
        inArray(activity.actorId, actors),
        // A suspended or deleted account stops speaking immediately, without
        // anybody having to go and delete its history first.
        isNull(users.suspendedAt),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(desc(activity.createdAt))
    .limit(limit);

  return rows
    .filter((r) => r.handle !== null)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      subjectId: r.subjectId,
      meta: r.meta,
      createdAt: r.createdAt.toISOString(),
      handle: r.handle as string,
      avatarUrl: r.avatarUrl,
    }));
}
