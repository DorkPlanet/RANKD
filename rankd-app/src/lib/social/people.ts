// Finding somebody.
//
// ── Everybody is findable, and private accounts included ───────────────────
//
// The alternative was to list only public profiles, which sounds more private
// and is worse: somebody who has been sent a friend's handle types it, gets
// nothing, and concludes Rankd is broken rather than that their friend is
// private. Hiding people from search does not protect them, it just makes the
// app look empty.
//
// So a private account appears with its picture, its handle and its bio, and
// nothing else. See `PrivateProfileView` for the same rule on the page, and the
// header of publicProfile.ts for the trade that was made deliberately.
//
// ── Handles only ───────────────────────────────────────────────────────────
//
// Not bios. A bio is free text somebody wrote about films, and searching it
// would turn "horror" into a way to enumerate people rather than to find one you
// already know of. Search is for reaching a person, not for browsing strangers;
// that is what discovery will be, and discovery gets to be its own decision.

import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db, follows, users } from "@/lib/db";
import { MIN_QUERY } from "./searchRules";

export interface PersonResult {
  handle: string;
  bio: string | null;
  avatarUrl: string | null;
  /** A Rankd house account rather than a person. */
  house: boolean;
  /** Shown as a locked stub. Nothing derived from a library travels with it. */
  private: boolean;
  /** Does the viewer already follow them? `null` when signed out. */
  following: boolean | null;
  /** The viewer themselves, who gets no follow button. */
  isSelf: boolean;
}

// Re-exported so a server caller has one import rather than two. The value
// itself lives apart from this file; see searchRules.ts for why.
export { MIN_QUERY };

/** A screenful. Long enough to find somebody, short enough not to be a browse. */
const LIMIT = 20;

/**
 * People whose handle matches, best match first.
 *
 * ── Prefix before substring, and that ordering is the feature ──────────────
 *
 * Somebody typing "sam" is looking for `sam` or `sam_jones`, not for
 * `notsampson`. Both are returned, because the second is occasionally what you
 * meant, but a prefix hit always sorts above a mere containment. Without that,
 * the person you were actually looking for can be pushed off the bottom of the
 * list by strangers who happen to have your query in the middle of their name.
 */
export async function searchPeople(query: string, viewerId: string | null): Promise<PersonResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return [];

  // Escaped, because `_` and `%` are LIKE wildcards and `_` is a legal handle
  // character. Without this, searching for `sam_j` quietly matches `samxj`.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const prefix = `${escaped}%`;
  const anywhere = `%${escaped}%`;

  const rows = await db
    .select({
      id: users.id,
      handle: users.handle,
      bio: users.bio,
      avatarUrl: users.avatarUrl,
      kind: users.kind,
      visibility: users.profileVisibility,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.handle),
        // Gone accounts are not findable. A stub for somebody who deleted their
        // account would be a tombstone nobody asked for.
        isNull(users.deletedAt),
        isNull(users.suspendedAt),
        or(
          sql`lower(${users.handle}) LIKE ${prefix} ESCAPE '\\'`,
          sql`lower(${users.handle}) LIKE ${anywhere} ESCAPE '\\'`,
        ),
      ),
    )
    // Prefix hits first, then alphabetical so the order is stable between two
    // identical searches rather than whatever the planner felt like.
    .orderBy(
      sql`CASE WHEN lower(${users.handle}) LIKE ${prefix} ESCAPE '\\' THEN 0 ELSE 1 END`,
      users.handle,
    )
    .limit(LIMIT);

  if (rows.length === 0) return [];

  // ── One query for every follow edge, not one per row ─────────────────────
  //
  // The obvious shape asks "do I follow this person" inside the map, which is
  // twenty round trips for twenty results and gets slower as the list grows.
  // One `IN` over the ids already in hand answers all of them at once.
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

  return rows.map((r) => ({
    handle: r.handle!,
    // A private account still shows its bio: it is a sentence somebody wrote to
    // be read, and it is the only thing that makes a locked result worth
    // looking at rather than a name and a shrug.
    bio: r.bio,
    avatarUrl: r.avatarUrl,
    house: r.kind === "house",
    private: r.visibility !== "public",
    following: viewerId ? followed.has(r.id) : null,
    isSelf: r.id === viewerId,
  }));
}
