// Writing feed cards, reading them back, and who agreed with them.
//
// The deciding is in `feed.ts` and is pure. This is the database half.

import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { activity, activityLikes, db, follows, tasteSnapshots, threadMessages, threads, users } from "@/lib/db";
import { diffToActivity, type FeedItem } from "@/lib/social/feed";
import type { SnapshotEntry, SnapshotSummary } from "@/lib/snapshot";

/** How far back the feed reaches in one read. */
const PAGE = 40;

/**
 * How long a sitting stays open.
 *
 * Sync pushes every ten seconds while somebody is ranking, so an evening is
 * dozens of pushes, and each one produces a session card unless they are folded
 * together. Two hours is long enough to cover an evening with breaks in it and
 * short enough that tomorrow is a new sitting.
 */
const SITTING_MS = 2 * 60 * 60 * 1000;

// Shapes live in `feed.ts`, which imports no database — see `MESSAGE_MAX` there
// for why that matters. Re-exported so server callers have one place to look.
export type { FeedItem } from "@/lib/social/feed";

/**
 * Turn a push into cards, if this account is one that should produce any.
 *
 * Called from the snapshot route with the INCOMING order, before the stored one
 * is overwritten. Never throws into the caller: a feed is decoration on top of a
 * sync, and failing to work out that a film was added must not cost somebody the
 * push of their actual ranking.
 */
export async function writeFeedCards(
  user: { id: string; kind: "person" | "house" },
  entries: SnapshotEntry[],
  summary: SnapshotSummary,
  counts?: { filmCount: number; duelCount: number },
): Promise<void> {
  // ── A house account publishes nothing ────────────────────────────────────
  //
  // `@rankd` re-derives its canon on a schedule, so without this it would post a
  // fistful of cards into every follower's feed every time the cron ran — the
  // astroturf the `accountKind` enum exists to prevent, arriving by the back
  // door. Its ranking is a place you visit, not a thing that shouts.
  if (user.kind !== "person") return;

  try {
    const stored = await db.query.tasteSnapshots.findFirst({
      where: eq(tasteSnapshots.userId, user.id),
      columns: { entries: true, duelCount: true },
    });
    const rows = diffToActivity(
      stored?.entries ?? [],
      entries,
      summary.named ?? [],
      // Placed films are counted from the orders themselves rather than taken
      // from `filmCount`, which is the whole LIBRARY including everything still
      // un-rnkd. A milestone is about work done, not films owned.
      counts && stored
        ? {
            was: { duels: stored.duelCount, placed: stored.entries.length },
            now: { duels: counts.duelCount, placed: entries.length },
          }
        : undefined,
    );
    if (rows.length === 0) return;

    // ── One session card per sitting, not per push ────────────────────────
    //
    // The rest are events that happened once. A session is a description of
    // ongoing work, so a second push during the same evening should UPDATE the
    // running total rather than post a second card — otherwise a marathon
    // buries everybody else's feed under its own progress bar.
    const session = rows.find((r) => r.kind === "session");
    const rest = rows.filter((r) => r.kind !== "session");

    if (rest.length > 0) {
      await db
        .insert(activity)
        .values(rest.map((r) => ({ actorId: user.id, kind: r.kind, subjectId: r.subjectId, meta: r.meta })));
    }

    if (session) await foldSession(user.id, session.meta);
  } catch {
    // See above: the sync is the job, this is not.
  }
}

/** Add this push's work to the sitting already in progress, or open a new one. */
async function foldSession(actorId: string, meta: Record<string, unknown>): Promise<void> {
  const open = await db.query.activity.findFirst({
    where: and(
      eq(activity.actorId, actorId),
      eq(activity.kind, "session"),
      gt(activity.createdAt, new Date(Date.now() - SITTING_MS)),
    ),
    orderBy: desc(activity.createdAt),
    columns: { id: true, meta: true },
  });

  if (!open) {
    await db.insert(activity).values({ actorId, kind: "session", subjectId: "", meta });
    return;
  }

  const was = open.meta as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  await db
    .update(activity)
    .set({
      meta: {
        ...was,
        added: num(was.added) + num(meta.added),
        moved: num(was.moved) + num(meta.moved),
        // The best result of the SITTING, not of the last ten seconds. A lower
        // rank number is a better placement.
        ...(meta.bestRank !== undefined &&
        (was.bestRank === undefined || num(meta.bestRank) < num(was.bestRank))
          ? {
              bestTitle: meta.bestTitle,
              bestPoster: meta.bestPoster,
              bestRank: meta.bestRank,
              bestId: meta.bestId,
            }
          : {}),
      },
    })
    .where(eq(activity.id, open.id));
}

/**
 * The feed for one reader: everybody they follow, and themselves.
 *
 * ── Yourself is in it, and that is the empty state ───────────────────────
 *
 * Following nobody would otherwise be a blank screen telling you to go and find
 * people, which is the same broken promise the cell used to make. Your own cards
 * mean the screen always demonstrates what it is FOR.
 *
 * ── Fanned out on READ ───────────────────────────────────────────────────
 *
 * One indexed join over a few hundred rows. Fanning out on write multiplies
 * every push by the follower count and needs a backfill on every new follow,
 * which is the wrong trade at any scale this app will see for years.
 */
export async function feedFor(viewerId: string, limit = PAGE): Promise<FeedItem[]> {
  const actors = await visibleActors(viewerId);

  const rows = await db
    .select({
      id: activity.id,
      kind: activity.kind,
      subjectId: activity.subjectId,
      meta: activity.meta,
      createdAt: activity.createdAt,
      actorId: activity.actorId,
      handle: users.handle,
      avatarUrl: users.avatarUrl,
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

  if (rows.length === 0) return [];

  // The reader's own ranking, once, for the "you have it at" line.
  const mine = await db.query.tasteSnapshots.findFirst({
    where: eq(tasteSnapshots.userId, viewerId),
    columns: { entries: true },
  });
  const myRank = new Map((mine?.entries ?? []).map((e) => [e.i, e.r]));

  const ids = rows.map((r) => r.id);
  const { counts, mineSet } = await likeState(ids, viewerId);

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
      mine: r.actorId === viewerId,
      // Only ever offered about somebody ELSE's card. "They have it #1, you have
      // it #1" on your own is the app agreeing with itself out loud.
      yourRank: r.actorId === viewerId ? undefined : (myRank.get(r.subjectId) ?? undefined),
      likes: counts.get(r.id) ?? 0,
      liked: mineSet.has(r.id),
    }));
}

/** Everyone whose cards this reader is entitled to see. */
async function visibleActors(viewerId: string): Promise<string[]> {
  const following = await db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, viewerId));
  return [...new Set([viewerId, ...following.map((f) => f.id)])];
}

/** How many agreed with each card, and whether the reader is one of them. */
async function likeState(
  ids: string[],
  viewerId: string,
): Promise<{ counts: Map<string, number>; mineSet: Set<string> }> {
  if (ids.length === 0) return { counts: new Map(), mineSet: new Set() };
  const rows = await db
    .select({ id: activityLikes.activityId, actorId: activityLikes.actorId })
    .from(activityLikes)
    .where(inArray(activityLikes.activityId, ids));

  const counts = new Map<string, number>();
  const mineSet = new Set<string>();
  for (const r of rows) {
    counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    if (r.actorId === viewerId) mineSet.add(r.id);
  }
  return { counts, mineSet };
}

/**
 * Agree with a placement, or take it back.
 *
 * Returns the count afterwards so the screen never has to guess. Idempotent in
 * both directions: the row IS the pair, so agreeing twice is one agreement and
 * un-agreeing something you never agreed with is a no-op.
 */
export async function setLike(
  activityId: string,
  viewerId: string,
  on: boolean,
): Promise<{ likes: number } | null> {
  if (!(await canSee(activityId, viewerId))) return null;

  if (on) {
    await db.insert(activityLikes).values({ activityId, actorId: viewerId }).onConflictDoNothing();
  } else {
    await db
      .delete(activityLikes)
      .where(and(eq(activityLikes.activityId, activityId), eq(activityLikes.actorId, viewerId)));
  }

  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activityLikes)
    .where(eq(activityLikes.activityId, activityId));
  return { likes: row?.n ?? 0 };
}

/**
 * Whether this reader may see this card at all.
 *
 * The same rule the feed uses, asked of a single row: it is yours, or it belongs
 * to somebody you follow. Following is what grants sight, so unfollowing takes
 * it away — including the right to keep agreeing.
 */
export async function canSee(activityId: string, viewerId: string): Promise<boolean> {
  const row = await db.query.activity.findFirst({
    where: eq(activity.id, activityId),
    columns: { actorId: true },
  });
  if (!row) return false;
  if (row.actorId === viewerId) return true;
  const follow = await db.query.follows.findFirst({
    where: and(eq(follows.followerId, viewerId), eq(follows.followeeId, row.actorId)),
    columns: { followerId: true },
  });
  return !!follow;
}

/**
 * How many things have been said TO this reader since they last looked.
 *
 * A message in one of their conversations, written by the other person. That is
 * the only way somebody can now speak to you directly: cards take agreement,
 * which is a tap and not a thing that needs answering, and there is no wall
 * anywhere for a stranger to post on.
 *
 * Answered against one timestamp on the user rather than a notifications table —
 * see `activitySeenAt` in the schema. A row per notification would be a second
 * copy of facts the messages already hold, kept in step by hand.
 */
export async function unreadFor(user: {
  id: string;
  handle: string | null;
  activitySeenAt: Date | null;
}): Promise<number> {
  const since = user.activitySeenAt ?? new Date(0);

  const rows = await db
    .select({ id: threadMessages.id })
    .from(threadMessages)
    .innerJoin(threads, eq(threads.id, threadMessages.threadId))
    .where(
      and(
        gt(threadMessages.createdAt, since),
        isNull(threadMessages.deletedAt),
        // Your own words are never news to you.
        ne(threadMessages.authorId, user.id),
        // One of yours, either side of the pair.
        or(eq(threads.lowId, user.id), eq(threads.highId, user.id)),
      ),
    )
    .limit(50);

  return rows.length;
}

/** They have looked. Anything older stops being news. */
export async function markSeen(userId: string): Promise<void> {
  await db.update(users).set({ activitySeenAt: new Date() }).where(eq(users.id, userId));
}
