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

import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db, follows, users } from "@/lib/db";
import type { PersonResult } from "./people";

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

export type FollowResult = { ok: true } | { ok: false; reason: "self" | "gone" | "house" };

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
  // ── A house account cannot follow anybody through here ──────────────────
  //
  // `@rankd` follows exactly one person, the creator, and that edge is written
  // by the seeding script rather than by this function. Everything else it might
  // ever follow would be a bot inflating its own reach, which is the difference
  // between a reference object and astroturf.
  //
  // Seeded rather than blocked outright because following one person permanently
  // is a signature, not a tactic. This is what stops it becoming a habit.
  const follower = await db.query.users.findFirst({
    where: eq(users.id, followerId),
    columns: { kind: true },
  });
  if (follower?.kind === "house") return { ok: false, reason: "house" };

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

// ── The one edge nobody asks for ───────────────────────────────────────────

/**
 * The house account's handle, and the single place it is spelled.
 *
 * `scripts/seedCanon.ts` creates the account and this module points new readers
 * at it, so the string has to be the same in both or the seed makes an account
 * the app never finds. The schema makes this argument at more length about
 * `kind === "house"` versus `handle === "rankd"`: a rule spread across files is
 * only load-bearing at the moment somebody forgets it.
 */
export const HOUSE_HANDLE = "rankd";

/**
 * Start a new reader off following the house account.
 *
 * ── Why this is not `follow()` ─────────────────────────────────────────────
 *
 * `follow()` is a person acting. It rate limits, it refuses a target that has
 * gone private or been suspended, and it answers with a reason a screen can
 * print. None of that applies to an edge written once, by the app, at the
 * moment an account joins — and running it through the limiter would mean a
 * handle claim could fail because of a bucket that has nothing to do with the
 * person claiming it.
 *
 * ── Why it cannot throw ───────────────────────────────────────────────────
 *
 * Claiming a handle is the critical path: it is what lets somebody past the
 * gate and into the app. This is a nicety on top of it. A deployment with no
 * house account — a preview branch, a fresh local database, anything that has
 * not run the seed script — must not fail a signup over it, so an absent house
 * is a `false` and not an error. `seedCanon.ts` already treats a missing
 * creator the same way.
 *
 * Returns whether an edge now exists, for the caller that wants to log it.
 */
export async function followHouse(userId: string): Promise<boolean> {
  const house = await db.query.users.findFirst({
    where: eq(users.handle, HOUSE_HANDLE),
    columns: { id: true, kind: true, deletedAt: true },
  });

  // The `kind` check is the load-bearing half. If the house account is ever
  // absent, somebody could claim `rankd` — it is in RESERVED, so they cannot
  // today, but a reserved list is a rule and this is a constraint — and every
  // new account would start out following a stranger.
  if (!house || house.kind !== "house" || house.deletedAt) return false;

  // The house claims its handle through the seed script rather than this path,
  // so this cannot fire today. It is here because if it ever did, the insert
  // would violate the `follow_not_self` CHECK and take a handle claim down with
  // it — a signup failing on a constraint nobody would think to look at.
  if (house.id === userId) return false;

  await db
    .insert(follows)
    .values({ followerId: userId, followeeId: house.id })
    .onConflictDoNothing();

  return true;
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

// ── The lists ──────────────────────────────────────────────────────────────
//
// Anyone who can see a profile can see its lists. That is the user's call and
// it is what makes the network grow: you browse the follows of somebody whose
// taste you trust, and follow from there.
//
// They return `PersonResult`, the same shape people search returns, so the sheet
// renders the SAME row with the same inline follow button. That reuse is the
// feature rather than a convenience: a list you can only read is a dead end.

/** Which direction of the edge to walk. */
export type Direction = "followers" | "following";

/** A screenful, matching search. Long enough to browse, short enough to end. */
const LIST_LIMIT = 50;

export async function followList(
  userId: string,
  direction: Direction,
  viewerId: string | null,
): Promise<PersonResult[]> {
  // `followers` walks to the people pointing AT this user, `following` walks to
  // the people they point at. One query either way, differing only in which
  // column is matched and which is joined.
  const matchOn = direction === "followers" ? follows.followeeId : follows.followerId;
  const joinOn = direction === "followers" ? follows.followerId : follows.followeeId;

  const rows = await db
    .select({
      id: users.id,
      handle: users.handle,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
      kind: users.kind,
      visibility: users.profileVisibility,
      at: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, joinOn))
    .where(
      and(
        eq(matchOn, userId),
        isNotNull(users.handle),
        // Gone accounts leave no trace in a list, the same way they do not
        // appear in search. The edge survives; the row is simply not shown.
        isNull(users.deletedAt),
        isNull(users.suspendedAt),
      ),
    )
    // Newest first. A follower list is a record of who arrived, and the most
    // recent arrival is the one worth seeing.
    .orderBy(desc(follows.createdAt))
    .limit(LIST_LIMIT);

  if (rows.length === 0) return [];

  // One query for every edge rather than one per row, same as search.
  const followed = new Set<string>();
  if (viewerId) {
    const edges = await db
      .select({ followeeId: follows.followeeId })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, viewerId),
          inArray(
            follows.followeeId,
            rows.map((r) => r.id),
          ),
        ),
      );
    for (const e of edges) followed.add(e.followeeId);
  }

  return rows
    // You are not a row in your own view of a list, the same reasoning as
    // search: it is a row you can do nothing with.
    .filter((r) => r.id !== viewerId)
    .map((r) => ({
      handle: r.handle!,
      bio: r.bio,
      avatarUrl: r.avatarUrl,
      house: r.kind === "house",
      private: r.visibility !== "public",
      following: viewerId ? followed.has(r.id) : null,
    }));
}
