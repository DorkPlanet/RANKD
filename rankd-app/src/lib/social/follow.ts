// Following, and the one thing it unlocks.
//
// ── Follow is plumbing. FRIENDSHIP is the feature ──────────────────────────
//
// A one-way follow is cheap and asymmetric: it says "show me what they do" and
// asks nothing of them. That is the right shape for a feed and the wrong shape
// for comparison, which is intimate. Knowing that somebody rates Heat above
// Collateral is fine. Being shown, film by film, where a specific person and I
// disagree is a conversation, and a conversation needs both people to have
// turned up.
//
// So a MUTUAL follow is the interesting state, and it is not a separate record.
// It is two rows, and `isFriend` is one existence check for the reverse edge.
// Nothing to keep in step, nothing to migrate when somebody unfollows, and no
// question about who ended it.

import { and, count, eq, inArray } from "drizzle-orm";

import { db, follows, users } from "@/lib/db";

/** Where a viewer stands with the person whose page they are on. */
export interface FollowState {
  /** Do I follow them? */
  following: boolean;
  /** Do they follow me? */
  followsMe: boolean;
  /** Both directions. What unlocks comparison and, later, private threads. */
  friends: boolean;
  /**
   * The viewer is looking at their own profile.
   *
   * Reported rather than left for the client to work out by comparing handles.
   * The button was rendering "Follow" on your own page: every edge is correctly
   * false for yourself, which is indistinguishable from a stranger you have not
   * followed. Tapping it got a 400 from a route that already knew better, so the
   * knowledge existed and simply was not being passed on.
   */
  isSelf: boolean;
  followerCount: number;
  followingCount: number;
}

/**
 * Counts anybody may see, without a viewer.
 *
 * Split from `followStateFor` because a signed-out visitor still gets numbers on
 * a public profile, and asking for a viewer's edges when there is no viewer
 * would mean either a null-shaped query or a second code path.
 */
export async function followCounts(
  userId: string,
): Promise<{ followerCount: number; followingCount: number }> {
  const [followers, following] = await Promise.all([
    db.select({ n: count() }).from(follows).where(eq(follows.followeeId, userId)),
    db.select({ n: count() }).from(follows).where(eq(follows.followerId, userId)),
  ]);
  return { followerCount: followers[0]?.n ?? 0, followingCount: following[0]?.n ?? 0 };
}

/**
 * Where `viewerId` stands with `userId`.
 *
 * Both directions are fetched in ONE query rather than two. They are the same
 * table and the same two ids, so asking twice is a second round trip to learn
 * the other half of something already in hand.
 */
export async function followStateFor(userId: string, viewerId: string | null): Promise<FollowState> {
  const counts = await followCounts(userId);
  if (!viewerId || viewerId === userId) {
    return {
      following: false,
      followsMe: false,
      friends: false,
      isSelf: viewerId === userId,
      ...counts,
    };
  }

  const edges = await db
    .select({ followerId: follows.followerId, followeeId: follows.followeeId })
    .from(follows)
    .where(
      and(
        inArray(follows.followerId, [viewerId, userId]),
        inArray(follows.followeeId, [viewerId, userId]),
      ),
    );

  const following = edges.some((e) => e.followerId === viewerId && e.followeeId === userId);
  const followsMe = edges.some((e) => e.followerId === userId && e.followeeId === viewerId);
  return { following, followsMe, friends: following && followsMe, isSelf: false, ...counts };
}

/** Are these two people mutual? The gate on comparison and private threads. */
export async function isFriend(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const edges = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(and(inArray(follows.followerId, [a, b]), inArray(follows.followeeId, [a, b])));
  return edges.length === 2;
}

export type FollowResult = { ok: true } | { ok: false; reason: "self" | "gone" };

/**
 * Follow somebody.
 *
 * Idempotent by construction: the primary key IS the pair, so following twice
 * conflicts with itself and does nothing, rather than needing a read-then-write
 * that two taps could race through. Same argument as `provisionUser`.
 *
 * ── You can only follow somebody you could have found ──────────────────────
 *
 * The target has to be publicly visible. Without that check a handle is an
 * oracle: a private account could be confirmed to exist by whether following it
 * succeeded, which is precisely what `getPublicProfile` refuses to confirm by
 * returning the same null for "no such person" and "not for you".
 */
export async function follow(followerId: string, handle: string): Promise<FollowResult> {
  const target = await db.query.users.findFirst({
    where: eq(users.handle, handle.toLowerCase()),
    columns: { id: true, profileVisibility: true, suspendedAt: true, deletedAt: true },
  });

  // One answer for every reason, matching `getPublicProfile`.
  if (!target || target.deletedAt || target.suspendedAt || target.profileVisibility !== "public") {
    return { ok: false, reason: "gone" };
  }
  // Also a CHECK constraint on the table. Caught here so it is a sentence rather
  // than a 500, and enforced there so no future caller can route around it.
  if (target.id === followerId) return { ok: false, reason: "self" };

  await db
    .insert(follows)
    .values({ followerId, followeeId: target.id })
    .onConflictDoNothing();

  return { ok: true };
}

/**
 * Stop following somebody.
 *
 * Deliberately does NOT check whether the target is still visible. Somebody who
 * has gone private, been suspended or deleted their account is exactly the case
 * where a follower most wants the edge gone, and refusing on the same grounds
 * `follow` refuses would strand the row forever.
 */
export async function unfollow(followerId: string, handle: string): Promise<FollowResult> {
  const target = await db.query.users.findFirst({
    where: eq(users.handle, handle.toLowerCase()),
    columns: { id: true },
  });
  if (!target) return { ok: false, reason: "gone" };

  await db
    .delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, target.id)));

  return { ok: true };
}
