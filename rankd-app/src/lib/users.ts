// User provisioning. The one place a sign-in turns into a persisted account, so
// identity comes from the database and not only from the session.
//
// Kept out of the session seam (`lib/auth.ts`) deliberately: this module carries
// no auth-library dependency, so the single-seam rule holds and this logic stays
// trivial to test against a real database.

import { eq } from "drizzle-orm";

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
