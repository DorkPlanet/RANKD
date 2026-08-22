// What a stranger is allowed to see, and the one place that decides it.
//
// ── Why this is a module and not a query in a page ─────────────────────────
//
// A public profile is reachable two ways: the server route at /@handle renders
// it for anybody, and later the app itself will show it without a page load.
// Two data paths, ONE answer to "what may this viewer see" — written twice, the
// two would drift, and the drift would be somebody's private library appearing
// on a page they never published.
//
// So the authorization lives here, once, and returns a DTO. Neither caller gets
// a row, and neither caller gets to decide anything.

import { eq } from "drizzle-orm";

import { db, tasteSnapshots, users } from "@/lib/db";
import type { SnapshotSummary } from "@/lib/snapshot";

/**
 * A profile as a visitor sees it.
 *
 * Assembled field by field rather than spread from rows. `email` is on the user
 * row and `entries` is on the snapshot: the first must never be published at
 * all, and the second is a full rank order that belongs to comparison rather
 * than to a page. Spreading either is how one of them ends up in a response
 * nobody meant to widen.
 */
export interface PublicProfile {
  handle: string;
  bio: string | null;
  avatarUrl: string | null;
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
 * The profile at this handle, or null.
 *
 * ── One null, several reasons, and that is deliberate ──────────────────────
 *
 * No such handle, a private profile, a suspended account, a deleted one: all
 * return null and the page renders the same not-found. Distinguishing them
 * would turn this into an oracle. "That handle exists but you cannot see it" is
 * enough to confirm somebody is on Rankd, which is exactly what a private
 * profile is a request not to confirm.
 *
 * Case-insensitive, matching the unique index that made the handle unique in
 * the first place, so /@Jarrad and /@jarrad are the same person rather than one
 * page and one 404.
 */
export async function getPublicProfile(handle: string): Promise<PublicProfile | null> {
  const trimmed = handle.trim();
  if (!trimmed) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.handle, trimmed.toLowerCase()),
  });

  if (!user || !user.handle) return null;
  // Every reason to refuse, in one place, answering identically.
  if (user.deletedAt || user.suspendedAt) return null;
  if (user.profileVisibility !== "public") return null;

  const snapshot = await db.query.tasteSnapshots.findFirst({
    where: eq(tasteSnapshots.userId, user.id),
  });

  return {
    handle: user.handle,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    // Zeroes rather than nulls for somebody who has published a profile but not
    // yet a snapshot. The page says "0 films" instead of going blank, which is
    // true and is a better first impression than an error.
    filmCount: snapshot?.filmCount ?? 0,
    // The length only. The rank order itself belongs to comparison and must not
    // travel to a page: it is the one field here that would let a visitor
    // reconstruct somebody's whole library.
    rankedCount: snapshot?.entries.length ?? 0,
    duelCount: snapshot?.duelCount ?? 0,
    // The second, narrower choice. A profile can be public while the taste
    // half of it is not, because "here is what I made" and "here is what Rankd
    // worked out about me" are different offers.
    summary: user.tasteVisibility === "public" ? (snapshot?.summary ?? null) : null,
  };
}
