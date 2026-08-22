// What a stranger is allowed to see, and the one place that decides it.
//
// ── Why this is a module and not a query in a page ─────────────────────────
//
// A public profile is reachable several ways: the server route at /@handle
// renders it for anybody, people search lists it, and later the app itself will
// show it without a page load. Several data paths, ONE answer to "what may this
// viewer see" — written more than once, they would drift, and the drift would be
// somebody's private library appearing on a page they never published.
//
// So the authorization lives here, once, and returns a DTO. No caller gets a
// row, and no caller gets to decide anything.
//
// ── A private profile is now VISIBLE as a stub, and that is a real change ───
//
// This module used to answer the same `null` for "no such handle" and "private",
// deliberately, so that a handle could not be used to confirm somebody is on
// Rankd. The user's call, 22 Aug 2026: everybody is findable, and a private
// account shows its picture, its handle, its bio and a line saying it is
// private.
//
// The trade, stated plainly because it was traded away on purpose: existence is
// now confirmable. Every large social app works this way and it is a normal
// product decision, but it IS a decision. What has not changed is the part that
// matters: the CONTENTS stay hidden. No counts, no top films, no taste, nothing
// derived from the library.
//
// Suspended and deleted accounts still answer `null`. They are not private
// people who would like to be left alone; they are gone, and a stub for them
// would be a tombstone nobody asked for.

import { eq } from "drizzle-orm";

import { db, tasteSnapshots, users } from "@/lib/db";
import type { SnapshotSummary } from "@/lib/snapshot";

/**
 * The part anybody may see, whatever the account's visibility.
 *
 * Nothing here is derived from a library. A handle is public by definition, a
 * picture and a bio are things somebody wrote to be read, and that is the whole
 * of what a private profile shows.
 */
export interface ProfileIdentity {
  handle: string;
  bio: string | null;
  avatarUrl: string | null;
  /** Whether this is a person or a Rankd house account. See `accountKind`. */
  house: boolean;
}

/**
 * A profile whose owner has chosen to be seen.
 *
 * Assembled field by field rather than spread from rows. `email` is on the user
 * row and `entries` is on the snapshot: the first must never be published at
 * all, and the second is a full rank order that belongs to comparison rather
 * than to a page. Spreading either is how one ends up in a response nobody meant
 * to widen.
 */
export interface PublicProfile extends ProfileIdentity {
  /** Everything they have logged, placed or not. */
  filmCount: number;
  /** How many have a position. Counted here so `entries` itself never ships. */
  rankedCount: number;
  duelCount: number;
  /**
   * Absent when the owner has kept the taste half private, which is a separate
   * choice from whether the profile exists at all. See `taste_visibility`.
   */
  summary: SnapshotSummary | null;
}

/**
 * A union rather than a nullable field, so a caller cannot render counts for a
 * private profile by forgetting a check. The type refuses it.
 */
export type ProfileView =
  | { kind: "public"; profile: PublicProfile }
  | { kind: "private"; identity: ProfileIdentity };

/**
 * The profile at this handle, or null if there is nobody to show.
 *
 * `null` now means only: no such handle, suspended, or deleted. A private
 * account returns a `private` view instead. See the header.
 *
 * Case-insensitive, matching the unique index that made the handle unique in the
 * first place, so /@Jarrad and /@jarrad are the same person rather than one page
 * and one 404.
 */
export async function getProfileView(handle: string): Promise<ProfileView | null> {
  const trimmed = handle.trim();
  if (!trimmed) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.handle, trimmed.toLowerCase()),
  });

  if (!user || !user.handle) return null;
  // Gone, rather than quiet. No stub.
  if (user.deletedAt || user.suspendedAt) return null;

  const identity: ProfileIdentity = {
    handle: user.handle,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    house: user.kind === "house",
  };

  if (user.profileVisibility !== "public") return { kind: "private", identity };

  const snapshot = await db.query.tasteSnapshots.findFirst({
    where: eq(tasteSnapshots.userId, user.id),
  });

  return {
    kind: "public",
    profile: {
      ...identity,
      // Zeroes rather than nulls for somebody who has published a profile but not
      // yet a snapshot. The page says "0 films" instead of going blank, which is
      // true and a better first impression than an error.
      filmCount: snapshot?.filmCount ?? 0,
      // The length only. The rank order itself belongs to comparison and must not
      // travel to a page: it is the one field here that would let a visitor
      // reconstruct somebody's whole library.
      rankedCount: snapshot?.entries.length ?? 0,
      duelCount: snapshot?.duelCount ?? 0,
      // The second, narrower choice. A profile can be public while the taste half
      // of it is not, because "here is what I made" and "here is what Rankd
      // worked out about me" are different offers.
      summary: user.tasteVisibility === "public" ? (snapshot?.summary ?? null) : null,
    },
  };
}
