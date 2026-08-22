// Writing feed cards, reading them back, and everything said on them.
//
// The deciding is in `feed.ts` and is pure. This is the database half.

import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import { activity, activityComments, db, follows, tasteSnapshots, users } from "@/lib/db";
import { diffToActivity, type CommentItem, type FeedItem } from "@/lib/social/feed";
import { mentionedHandles } from "@/lib/social/mentions";
import type { SnapshotEntry, SnapshotSummary } from "@/lib/snapshot";

/** How far back the feed reaches in one read. */
const PAGE = 40;

// Shapes live in `feed.ts`, which imports no database — see `COMMENT_MAX` there
// for why that matters. Re-exported so server callers have one place to look.
export type { CommentItem, FeedItem } from "@/lib/social/feed";

/**
 * Turn a push into cards, if this account is one that should produce any.
 *
 * Called from the snapshot route with the INCOMING order, before the stored one
 * is overwritten. Never throws into the caller: a feed is decoration on top of a
 * sync, and failing to work out that a film climbed must not cost somebody the
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
  // fistful of climbs into every follower's feed every time the cron ran — the
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
      summary.topFilms ?? [],
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

    await db
      .insert(activity)
      .values(rows.map((r) => ({ actorId: user.id, kind: r.kind, subjectId: r.subjectId, meta: r.meta })));
  } catch {
    // See above: the sync is the job, this is not.
  }
}

/**
 * The feed for one reader: everybody they follow, and themselves.
 *
 * ── Yourself is in it, and that is the empty state ───────────────────────
 *
 * Following nobody would otherwise be a blank screen telling you to go and find
 * people, which is the same broken promise the Activity cell used to make. Your
 * own cards mean the screen always demonstrates what it is FOR.
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

  const counts = await commentCounts(rows.map((r) => r.id));

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
      comments: counts.get(r.id) ?? 0,
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

async function commentCounts(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: activityComments.activityId, n: sql<number>`count(*)::int` })
    .from(activityComments)
    .where(and(inArray(activityComments.activityId, ids), isNull(activityComments.deletedAt)))
    .groupBy(activityComments.activityId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/**
 * One thread, oldest first, because a conversation is read downward.
 *
 * Returns null when the reader is not entitled to the card it hangs off — the
 * same answer as "no such card", so a thread cannot be used to confirm one
 * exists.
 */
export async function commentsFor(activityId: string, viewerId: string): Promise<CommentItem[] | null> {
  if (!(await canSee(activityId, viewerId))) return null;

  const rows = await db
    .select({
      id: activityComments.id,
      body: activityComments.body,
      createdAt: activityComments.createdAt,
      authorId: activityComments.authorId,
      handle: users.handle,
      avatarUrl: users.avatarUrl,
    })
    .from(activityComments)
    .innerJoin(users, eq(users.id, activityComments.authorId))
    .where(
      and(
        eq(activityComments.activityId, activityId),
        isNull(activityComments.deletedAt),
        isNull(users.suspendedAt),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(activityComments.createdAt);

  return rows
    .filter((r) => r.handle !== null)
    .map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      handle: r.handle as string,
      avatarUrl: r.avatarUrl,
      mine: r.authorId === viewerId,
    }));
}

/**
 * Whether this reader may see this card at all.
 *
 * The same rule the feed uses, asked of a single row: it is yours, or it belongs
 * to somebody you follow. Following is what grants sight, so unfollowing takes
 * it away — including the right to keep talking.
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

export type SaidResult = { ok: true; comment: CommentItem } | { ok: false; error: string };

/** Say something on a card. The caller has already checked the rate limit and the text. */
export async function addComment(
  activityId: string,
  author: { id: string; handle: string | null; avatarUrl: string | null },
  body: string,
): Promise<SaidResult> {
  if (!(await canSee(activityId, author.id))) return { ok: false, error: "No such card" };

  const [row] = await db
    .insert(activityComments)
    .values({ activityId, authorId: author.id, body })
    .returning({ id: activityComments.id, createdAt: activityComments.createdAt });

  return {
    ok: true,
    comment: {
      id: row.id,
      body,
      createdAt: row.createdAt.toISOString(),
      handle: author.handle ?? "",
      avatarUrl: author.avatarUrl,
      mine: true,
    },
  };
}

/**
 * Take back something you said.
 *
 * Only ever your own line, and soft — see the schema. The owner of a CARD
 * cannot delete comments on it: that is moderation, and handing it to whoever
 * happens to own the post turns every disagreement into a race to delete.
 */
export async function removeComment(commentId: string, authorId: string): Promise<boolean> {
  const done = await db
    .update(activityComments)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(activityComments.id, commentId),
        eq(activityComments.authorId, authorId),
        isNull(activityComments.deletedAt),
      ),
    )
    .returning({ id: activityComments.id });
  return done.length > 0;
}

/**
 * How many things have been said TO this reader since they last looked.
 *
 * Two ways to be spoken to: somebody commented on a card of yours, or somebody
 * named you anywhere. Both are answered against one timestamp on the user rather
 * than a notifications table — see `activitySeenAt` in the schema.
 *
 * The mention half is narrowed in SQL with a LIKE and then decided in JS by
 * `mentionedHandles`, because only the parser knows that `sam@example.com` is an
 * email and `@sammy` is somebody else. The LIKE is the cheap filter; the parser
 * is the correct one.
 */
export async function unreadFor(user: {
  id: string;
  handle: string | null;
  activitySeenAt: Date | null;
}): Promise<number> {
  const since = user.activitySeenAt ?? new Date(0);
  const handle = user.handle;

  const rows = await db
    .select({ body: activityComments.body, cardOwner: activity.actorId })
    .from(activityComments)
    .innerJoin(activity, eq(activity.id, activityComments.activityId))
    .where(
      and(
        gt(activityComments.createdAt, since),
        isNull(activityComments.deletedAt),
        // Your own words are never news to you.
        sql`${activityComments.authorId} <> ${user.id}`,
        handle
          ? or(eq(activity.actorId, user.id), sql`${activityComments.body} ILIKE ${"%@" + handle + "%"}`)
          : eq(activity.actorId, user.id),
      ),
    )
    .limit(50);

  if (!handle) return rows.length;
  return rows.filter((r) => r.cardOwner === user.id || mentionedHandles(r.body).includes(handle)).length;
}

/** They have looked. Anything older stops being news. */
export async function markSeen(userId: string): Promise<void> {
  await db.update(users).set({ activitySeenAt: new Date() }).where(eq(users.id, userId));
}
