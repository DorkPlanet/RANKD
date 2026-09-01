// Emptying the user table, back to two accounts.
//
//   npm run wipe:users -- --dry-run     look, touch nothing
//   npm run wipe:users                  delete them
//
// ── What this is for ───────────────────────────────────────────────────────
//
// A round of testers were handed the live address. They made an account each and
// never came back, and the result is a social layer that looks populated by
// people who are not there. This puts it back to zero: @donnie and the house,
// and nobody else, as though nobody else had ever opened it.
//
// ── It only holds because the gate landed with it ──────────────────────────
//
// `events.signIn` calls `provisionUser`, which is an upsert on email. Deleting
// somebody does NOT stop them coming back — the next time they open the app and
// press the Google button they exist again, with a fresh uuid and no handle. The
// password wall in `src/middleware.ts` is what makes this permanent, and running
// this script against a deployment with no GATE_PASSWORD set will quietly undo
// itself. Ship the gate first.
//
// ── One-off, and not a route ───────────────────────────────────────────────
//
// Deleting a person takes other people's replies, likes and threads with them,
// because every foreign key to `user.id` is ON DELETE CASCADE. With almost
// everybody going that is academic. It is also the reason this is a script run
// by hand rather than a `DELETE /api/me` anybody can call.
//
// ── The footgun, borrowed from seedCanon ───────────────────────────────────
//
// It must run against the PRODUCTION database to mean anything. Run against a
// local Postgres it looks completely successful and changes nothing anybody can
// see. So it prints the host it is about to write to, before it writes, every
// time. The env comes from the RUNNER (`--env-file=.env.local` in the npm
// script) rather than a dotenv call here, because imports are hoisted and
// `src/lib/db/index.ts` would evaluate before any statement in this file runs.

import { and, eq, ne, or, sql } from "drizzle-orm";

import { client, db, users } from "../src/lib/db";

/** The one person who survives. Matched case-insensitively; handles are stored lowercased. */
const KEEP_HANDLE = "donnie";

const dryRun = process.argv.includes("--dry-run");

/**
 * Who is spared.
 *
 * Two rules and no more, both spelled here so that reading this function is the
 * whole answer to "what survives":
 *
 *   • kind = 'house' — the @rankd account. Checked on `kind` rather than on the
 *     handle string, which is what every other house check in the app does. A
 *     house account matched by name would be missed the day one is renamed.
 *   • lower(handle) = 'donnie' — you.
 *
 * Note this deliberately does NOT spare `deletedAt` or `suspendedAt` rows. A
 * soft-deleted tester is still a row, still holds a handle, and still collides
 * on email at the next sign-in. They go too.
 */
const KEEP = or(
  eq(users.kind, "house"),
  sql`lower(${users.handle}) = ${KEEP_HANDLE}`,
);

const DOOMED = and(
  ne(users.kind, "house"),
  or(sql`${users.handle} is null`, sql`lower(${users.handle}) <> ${KEEP_HANDLE}`),
);

async function main() {
  // Before anything. See the footgun note above.
  const host = new URL(process.env.DATABASE_URL ?? "postgres://unset").host;
  console.log(`\nDatabase: ${host}`);
  console.log(dryRun ? "Mode:     DRY RUN — nothing will be written\n" : "Mode:     LIVE — rows will be deleted\n");

  const keeping = await db
    .select({ id: users.id, handle: users.handle, email: users.email, kind: users.kind })
    .from(users)
    .where(KEEP);

  // ── The refusal that matters most ────────────────────────────────────────
  //
  // If @donnie is not found, the most likely explanations are a typo, a renamed
  // handle, or the wrong database — and in all three the next statement would
  // delete the account this script exists to protect. There is no safe way to
  // guess, so it stops.
  const me = keeping.find((u) => u.handle?.toLowerCase() === KEEP_HANDLE);
  if (!me) {
    console.error(
      `Refusing to run: no account with handle @${KEEP_HANDLE} on ${host}.\n` +
        `Nothing has been touched. Check you are pointed at the right database.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log("Keeping:");
  for (const u of keeping) console.log(`  @${u.handle ?? "(no handle)"}  ${u.email}  [${u.kind}]`);

  const doomed = await db
    .select({ id: users.id, handle: users.handle, email: users.email, avatarUrl: users.avatarUrl, avatarSource: users.avatarSource })
    .from(users)
    .where(DOOMED);

  console.log(`\nDeleting: ${doomed.length} account${doomed.length === 1 ? "" : "s"}`);
  for (const u of doomed) console.log(`  @${u.handle ?? "(no handle)"}  ${u.email}`);

  if (doomed.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  // ── Avatars, collected BEFORE the delete ─────────────────────────────────
  //
  // Nothing in the app has ever called `del()`, so an uploaded avatar outlives
  // the account that uploaded it. Once the row is gone the URL is gone with it
  // and the blob is unreachable forever, so the list has to be taken now.
  const avatars = doomed
    .filter((u) => u.avatarSource === "upload" && u.avatarUrl)
    .map((u) => u.avatarUrl as string);
  console.log(`Avatars:  ${avatars.length} uploaded image${avatars.length === 1 ? "" : "s"} to remove`);

  if (dryRun) {
    console.log("\nDry run — nothing written.");
    return;
  }

  const deleted = await db.delete(users).where(DOOMED).returning({ id: users.id });
  console.log(`\nDeleted ${deleted.length} accounts. Cascades took their libraries, follows, activity and threads.`);

  // After the rows, and best-effort. A blob store that refuses is a stranded
  // image, which costs pennies and nothing else; it must not abort a delete that
  // has already happened and cannot be replayed.
  if (avatars.length > 0) {
    const configured = !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.BLOB_STORE_ID;
    if (!configured) {
      console.warn("Blob storage isn't configured here, so avatars were left in place.");
    } else {
      const { del } = await import("@vercel/blob");
      let gone = 0;
      for (const url of avatars) {
        try {
          await del(url);
          gone++;
        } catch (err) {
          console.warn(`  couldn't remove ${url}:`, err instanceof Error ? err.message : err);
        }
      }
      console.log(`Removed ${gone} of ${avatars.length} avatars.`);
    }
  }

  // Left as a reminder rather than done here: rotating AUTH_SECRET is what
  // invalidates the session cookies these people are still holding.
  console.log("\nDon't forget to rotate AUTH_SECRET, or their old sessions stay signed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
