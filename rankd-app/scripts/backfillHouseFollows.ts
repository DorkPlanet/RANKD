// Pointing every existing reader at the house account.
//
//   npm run backfill:house -- --dry-run     count, touch nothing
//   npm run backfill:house                  write the edges
//
// ── Why this exists as a one-off ───────────────────────────────────────────
//
// `claimHandle` now follows @rankd for every account that claims a handle, so
// everybody who arrives from here on is covered by the app itself. This is the
// catch-up for the accounts that were already through the gate when that landed,
// and it should be needed exactly once.
//
// ── What it is honest about ────────────────────────────────────────────────
//
// It writes a row under somebody else's name for something they did not do.
// That is a deliberate product decision — a house account is a reference
// object, not a person, and an empty feed on day one is what makes people
// leave — but it is still a row they can see in their own "following" list and
// remove. Which they can: `unfollow` has no special case for the house.
//
// It does NOT touch the feed. Activity is derived server-side by diffing pushed
// snapshots (see `lib/social/feed.ts`) and `activityKind` has no follow value,
// so no amount of following writes a card into anybody's timeline. That was the
// thing worth checking before running this over every account at once.
//
// ── The footgun, same as seedCanon's ───────────────────────────────────────
//
// This has to run against PRODUCTION to mean anything, and against a local
// Postgres it looks completely successful and changes nothing anybody can see.
// So it prints the host before it writes, every time.
//
// The env comes from the RUNNER (`--env-file=.env.local` in the npm script) and
// not from a dotenv call here. Imports are hoisted, so `src/lib/db/index.ts` is
// evaluated before a statement in this file runs and would throw at import time
// on an unset DATABASE_URL. See the longer note at the top of seedCanon.ts.

import { and, eq, isNotNull, isNull, ne, notExists, sql } from "drizzle-orm";

import { client, db, follows, users } from "../src/lib/db";
import { HOUSE_HANDLE } from "../src/lib/social/follow";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const host = new URL(process.env.DATABASE_URL!).host;
  console.log(`\ndatabase: ${host}`);
  console.log(dryRun ? "mode:     DRY RUN, nothing will be written\n" : "mode:     WRITING\n");

  // ── The target ──────────────────────────────────────────────────────────
  //
  // Matched on `kind` as well as handle, for the reason the schema gives: if
  // the account were ever absent and `rankd` left RESERVED, a handle match
  // alone would point every account in the database at a stranger.
  const house = await db.query.users.findFirst({
    where: and(eq(users.handle, HOUSE_HANDLE), eq(users.kind, "house")),
    columns: { id: true, handle: true, deletedAt: true },
  });
  if (!house || house.deletedAt) {
    throw new Error(`No live @${HOUSE_HANDLE} on ${host}. Run \`npm run seed:canon\` first.`);
  }
  console.log(`house:    @${house.handle} (${house.id.slice(0, 8)})`);

  // ── Who gets one ────────────────────────────────────────────────────────
  //
  // Every clause matches something the app already enforces, so a backfilled
  // account and a new one end up under the same rule:
  //
  //  · `id <> house.id`    — `follow_not_self` is a CHECK, and violating it
  //                          aborts the whole statement rather than one row.
  //  · `handle IS NOT NULL`— what `claimHandle` keys on. An account that never
  //                          finished the gate is not in the network.
  //  · `kind = 'person'`   — the schema: a house account may not follow anybody.
  //  · not deleted/suspended — the two states `follow()` itself refuses.
  const eligible = and(
    ne(users.id, house.id),
    isNotNull(users.handle),
    eq(users.kind, "person"),
    isNull(users.deletedAt),
    isNull(users.suspendedAt),
  );

  const [{ n: total }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eligible);

  // Counted separately from the insert so the dry run reports the number of
  // rows that would actually appear, not the number considered. `ON CONFLICT
  // DO NOTHING` makes re-running safe either way; this makes it legible.
  const [{ n: missing }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        eligible,
        notExists(
          db
            .select({ one: sql`1` })
            .from(follows)
            .where(and(eq(follows.followerId, users.id), eq(follows.followeeId, house.id))),
        ),
      ),
    );

  console.log(`eligible: ${total.toLocaleString()} accounts`);
  console.log(`to write: ${missing.toLocaleString()} (${(total - missing).toLocaleString()} already follow)\n`);

  if (dryRun) {
    console.log("Dry run. Nothing written.\n");
    await client.end();
    return;
  }
  if (missing === 0) {
    console.log("Nothing to do.\n");
    await client.end();
    return;
  }

  // ── Why not INSERT ... SELECT ────────────────────────────────────────────
  //
  // That was the first version and Drizzle rejects it: its insert-select
  // requires the selected fields to match the target table's definition
  // exactly, and `follow` has a third column (`created_at`) that wants its
  // default. Rather than name a default to satisfy a type check, the ids come
  // back and go out as one multi-row INSERT — which is still a single
  // statement, so it still cannot leave half the network pointed at the house.
  //
  // The set is small by construction: it is bounded by the number of accounts
  // that existed before `claimHandle` started doing this, and it shrinks to
  // nothing on a re-run.
  const rows = await db.select({ id: users.id }).from(users).where(eligible);

  const written = await db
    .insert(follows)
    .values(rows.map((r) => ({ followerId: r.id, followeeId: house.id })))
    .onConflictDoNothing()
    .returning({ followerId: follows.followerId });

  console.log(`Wrote ${written.length.toLocaleString()} follow rows.`);
  console.log(`\nUndo:  delete from "follow" where followee_id = '${house.id}';\n`);

  await client.end();
}

main().catch(async (e) => {
  console.error("\nFailed:", e instanceof Error ? e.message : e);
  await client.end().catch(() => {});
  process.exit(1);
});
