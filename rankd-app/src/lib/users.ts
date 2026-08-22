// User provisioning. The one place a sign-in turns into a persisted account, so
// identity comes from the database and not only from the session.
//
// Kept out of the session seam (`lib/auth.ts`) deliberately: this module carries
// no auth-library dependency, so the single-seam rule holds and this logic stays
// trivial to test against a real database.

import { and, eq, isNull, sql } from "drizzle-orm";

import { db, users, type User } from "./db";

export interface ProvisionInput {
  /** The provider identity a repeat sign-in resolves back to. */
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Resolve a sign-in to exactly one `user` row: create it on first sign-in,
 * return the existing row on every sign-in after.
 *
 * Idempotent and concurrency-safe by construction. Correctness rests on the
 * unique index on `email`, not on an application-level read-then-write: the
 * insert uses `ON CONFLICT DO NOTHING`, so under concurrent first sign-ins for
 * one identity exactly one insert wins and the losers no-op, then read back the
 * winner. Provider fields on an existing row are left untouched, so a later
 * profile edit is not clobbered by simply signing in again.
 */
export async function provisionUser(input: ProvisionInput): Promise<User> {
  const [inserted] = await db
    .insert(users)
    .values({
      email: input.email,
      displayName: input.displayName ?? null,
      avatarUrl: input.avatarUrl ?? null,
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (inserted) return inserted;

  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (!existing) {
    // Only reachable if the row vanished between insert and select, which the
    // app never does. Surfacing it beats returning a phantom user.
    throw new Error(`Failed to provision an account for ${input.email}`);
  }
  return existing;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}

// ── Claiming a handle ───────────────────────────────────────────────────────

/**
 * Was this a unique-index collision?
 *
 * The check WALKS THE CAUSE CHAIN, and that is the whole reason this exists as
 * a function. Drizzle wraps the driver's error, so the postgres.js error object
 * carrying `code: "23505"` is not the object that gets thrown. Reading
 * `(e as { code?: string }).code` compiles, type-checks, and is `undefined`
 * every single time, which turns a lost race into a 500 instead of "try
 * another".
 */
export function isUniqueViolation(error: unknown): boolean {
  let cursor: unknown = error;
  // Bounded rather than `while (cursor)`: a cause chain is not guaranteed to be
  // acyclic, and a hang here would be inside an error path nobody is watching.
  for (let depth = 0; depth < 8 && cursor; depth++) {
    if (typeof cursor === "object" && (cursor as { code?: unknown }).code === "23505") return true;
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Is this handle free RIGHT NOW?
 *
 * Advisory only, and every caller has to treat it that way. It answers about a
 * moment, and the moment is over before the reader has finished typing. The
 * claim below is what actually decides, and it can still fail after this said
 * yes. Used to tell somebody early, never to authorise anything.
 */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const existing = await db.query.users.findFirst({
    where: sql`lower(${users.handle}) = ${handle.toLowerCase()}`,
    columns: { id: true },
  });
  return !existing;
}

export async function findUserByHandle(handle: string): Promise<User | undefined> {
  return db.query.users.findFirst({
    where: sql`lower(${users.handle}) = ${handle.toLowerCase()}`,
  });
}

export type ClaimResult =
  | { ok: true; user: User }
  /** Somebody else got there first, between the check and the write. */
  | { ok: false; reason: "taken" }
  /** This account already has one. Changing it is a different feature. */
  | { ok: false; reason: "already" };

/**
 * Give this account its public name.
 *
 * ── Why the WHERE clause carries `handle IS NULL` ──────────────────────────
 *
 * Not defensiveness. It makes the claim a one-way door in the database rather
 * than in whatever route happens to call it: a second request that raced the
 * first matches zero rows and reports `already`, instead of quietly renaming
 * somebody whose old handle is already in a link a friend sent.
 *
 * Changing a handle later is a real feature and a different one, because it has
 * to decide what happens to the old address. It is deliberately not this.
 *
 * Correctness under two people racing for the SAME name rests on the unique
 * index on `lower(handle)`, not on `isHandleAvailable` above. One update wins,
 * the other raises 23505, and the loser is told to try another.
 */
export async function claimHandle(userId: string, handle: string): Promise<ClaimResult> {
  let updated: User[];
  try {
    updated = await db
      .update(users)
      .set({ handle, handleClaimedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.handle)))
      .returning();
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: "taken" };
    throw e;
  }

  // No rows matched, so the guard above caught it: this account already has a
  // handle. Not an error worth throwing, just an answer.
  if (updated.length === 0) return { ok: false, reason: "already" };
  return { ok: true, user: updated[0] };
}

/**
 * The public half of a profile, edited by its owner.
 *
 * Takes a partial so a caller changes the one field it came to change without
 * having to hold, and risk staling, the rest of the row. Same reasoning as
 * `changePrefs` in `AppShell`.
 *
 * `handle` is deliberately absent from the input type. It is claimed once, by
 * the function above, and an update path that could also set it would be a
 * second way in with none of that function's guarantees.
 */
export interface ProfilePatch {
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  avatarSource?: "google" | "upload" | null;
  profileVisibility?: "private" | "public";
  tasteVisibility?: "private" | "public";
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<User | undefined> {
  // An empty patch is a no-op, and `db.update` with an empty set is a syntax
  // error rather than one. Cheaper to answer here than to make every caller
  // check whether it has anything to say.
  if (Object.keys(patch).length === 0) {
    return db.query.users.findFirst({ where: eq(users.id, userId) });
  }
  const [updated] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
  return updated;
}
