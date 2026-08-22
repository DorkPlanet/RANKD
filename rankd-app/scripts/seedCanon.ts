// Bringing the house account into existence.
//
//   npm run seed:canon -- --dry-run     look, touch nothing
//   npm run seed:canon                  create the account and publish the canon
//
// ── This is a ONE-OFF, and the recurring job is a different thing ──────────
//
// The canon's ingest lives here, outside the app, because it is 250 detail calls
// to TMDb and it happens once. The scheduled job that keeps the ranking current
// reads published snapshots and touches TMDb not at all: that split is what
// keeps the cron under a second, removes every rate limit and batching concern
// from it, and means a TMDb outage can never corrupt what is already published.
//
// ── It cannot go through the app's own routes ─────────────────────────────
//
// `app/api/guard.ts` refuses any request with neither an Origin nor a Referer,
// which is exactly what a script looks like, so `/api/film` would 403 its own
// seeding job. That is why `detailOf` was lifted into `lib/tmdb.ts`.
//
// ── The footgun this script is built to avoid ─────────────────────────────
//
// It must run against the PRODUCTION database to seed the live account. Run
// against a local Postgres it looks completely successful and changes nothing
// anybody can see. So it prints the host it is about to write to, before it
// writes, every time.

// ── The env comes from the RUNNER, not from a call in this file ───────────
//
// The obvious version calls dotenv at the top and imports the database below it.
// It does not work, and it fails looking like a missing .env.local: imports are
// HOISTED, so `src/lib/db/index.ts` is evaluated before any statement here runs,
// and it throws at import time when DATABASE_URL is unset.
//
// So the npm script passes `--env-file=.env.local`, which Node applies before a
// line of this is parsed. Nothing in this file can reorder itself into breaking
// it, which a dotenv call at the top very much can.

import { and, eq, gte } from "drizzle-orm";

import { client, db, follows, rankingHistory, tasteSnapshots, users } from "../src/lib/db";
import { discoverPage, detailOf, type DiscoveredFilm } from "../src/lib/tmdb";
import { placeCanon } from "../src/lib/canon/place";
import { buildSnapshot } from "../src/lib/snapshot";
import { slugId } from "../src/lib/importCsv";
import type { Film } from "../src/lib/types";

/** How many films the canon publishes. See the plan for why 250 and not 100. */
const CANON_SIZE = 250;

/**
 * The era-adjusted vote floor, which is the whole reason this uses `/discover`.
 *
 * Measured against the real 861-film fixture, all at 1000 films:
 *
 *   /movie/top_rated        113 shared,  237 pre-1980,  47% under 1500 votes
 *   /discover, flat >=3000  212 shared,   82 pre-1980,   0% under 1500
 *   /discover, era-adjusted 188 shared,  300 pre-1980,   0% under 1500
 *
 * Old films have fewer TMDb votes because fewer people log them, not because
 * they matter less, and a flat floor collapses pre-1980 from 300 films to 82.
 * Trading 11% of the shared films for 3.6x the historical depth is the right way
 * round for an audience that cares about Kurosawa.
 */
/**
 * A canon is films that have LASTED, so the seed will not take this year's.
 *
 * Without this the dry run put Michael (2026) at number three and Project Hail
 * Mary (2026) at number four, above The Godfather Part II. Both are real TMDb
 * scores and both are early enthusiasm: a film released weeks ago is rated by
 * the people who chose to see it immediately, and that average regresses.
 *
 * Two years is enough for it to settle. This bars a recent film from being
 * SEEDED, not from being in the canon: membership is open, so a film the
 * community actually rates highly can climb in on its own merits. TMDb's launch
 * hype cannot.
 */
const SETTLE_YEARS = 2;

function settledBefore(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - SETTLE_YEARS);
  return d.toISOString().slice(0, 10);
}

const MODERN = { minVotes: 3000, from: "1980-01-01", to: settledBefore() };
const CLASSIC = { minVotes: 700, to: "1979-12-31" };

/** TMDb allows ~50 requests a second. This is nowhere near it. */
const PACE_MS = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Midnight UTC, so "today" means the same thing wherever this is run from. */
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The one account the house follows, as a credit. */
const CREATOR = "donnie";

/** The account. `rankd` is in RESERVED, so it is guaranteed free. */
const HOUSE = {
  handle: "rankd",
  email: "house@rankd.invalid", // RFC 2606 reserved: can never route anywhere.
  // Every clause true in the present tense. The first two say what it IS, the
  // third says what happens next rather than what is already happening. Revisit
  // when the consensus lands and the third becomes present tense.
  bio: "250 films in one order. Right now it's the world's list. The more people rank, the more it becomes ours.",
};

async function fetchPool(key: string): Promise<DiscoveredFilm[]> {
  const out: DiscoveredFilm[] = [];
  const seen = new Set<number>();

  // Enough pages of each to have well over CANON_SIZE after the merge, so the
  // cut is made on quality rather than on whichever query ran out first.
  for (const [label, opts, pages] of [
    ["modern", MODERN, 16],
    ["classic", CLASSIC, 8],
  ] as const) {
    for (let page = 1; page <= pages; page++) {
      const films = await discoverPage(key, { ...opts, page });
      if (films.length === 0) break;
      for (const f of films) {
        // TMDb can return the same film across overlapping queries, and a film
        // with no release date has no year, which would produce an id that
        // matches nobody.
        if (!seen.has(f.tmdbId) && f.year) {
          seen.add(f.tmdbId);
          out.push(f);
        }
      }
      process.stdout.write(`\r  ${label}: ${out.length} films`);
      await sleep(PACE_MS);
    }
    process.stdout.write("\n");
  }

  // One order across both queries, so a 1950s film and a 2010s film are ranked
  // against each other rather than living in separate lists.
  return out.sort((a, b) => b.voteAverage - a.voteAverage).slice(0, CANON_SIZE);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");

  // ── Say where this is going, before it goes there ───────────────────────
  const host = new URL(process.env.DATABASE_URL!).host;
  console.log(`\ndatabase: ${host}`);
  console.log(dryRun ? "mode:     DRY RUN, nothing will be written\n" : "mode:     WRITING\n");

  console.log(`Fetching the pool (era-adjusted floor, target ${CANON_SIZE})`);
  const pool = await fetchPool(key);
  console.log(`  ranked pool: ${pool.length} films`);
  console.log(`  oldest: ${pool.reduce((a, b) => (a.year < b.year ? a : b)).title}`);
  console.log(`  top: ${pool.slice(0, 3).map((f) => f.title).join(", ")}\n`);

  console.log("Fetching details");
  const placed = placeCanon(pool.length);
  const films: Film[] = [];

  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    const meta = await detailOf(p.tmdbId, key);
    // A film whose detail call fails keeps its position with what the discovery
    // query already gave us. Dropping it would silently shorten the canon and
    // shift every rank below it.
    films.push({
      id: slugId(p.title, p.year),
      title: p.title,
      year: p.year,
      rating: placed[i].rating,
      score: placed[i].score,
      // SOFT, never hard. `isHard` is what sets `t: 1` in a snapshot, and `t`
      // means the reader confirmed this placement themselves. Nobody did. Soft
      // is enough to count as placed, and it is the truth.
      lock: "soft",
      poster: meta?.poster,
      director: meta?.director,
      cast: meta?.cast,
      genres: meta?.genres,
      keywords: meta?.keywords,
      runtime: meta?.runtime,
      countries: meta?.countries,
      language: meta?.language,
      tmdbId: p.tmdbId,
      // Nothing may re-guess these later: they came from an id, not a title
      // search, so a backfill sweep must not overwrite them with a worse match.
      pinnedMeta: true,
    });
    if (i % 25 === 0) process.stdout.write(`\r  ${i}/${pool.length}`);
    await sleep(PACE_MS);
  }
  process.stdout.write(`\r  ${pool.length}/${pool.length}\n\n`);

  // `duelCount` is 0 because the account has fought none. VOICE.md rule 3:
  // never invent a number.
  const snapshot = buildSnapshot(films, 0);
  console.log(`Snapshot: ${snapshot.filmCount} films, ${snapshot.entries.length} ranked`);
  console.log(`  top ten: ${snapshot.summary.topFilms.map((f) => f.title).join(", ")}`);
  console.log(`  genre:   ${snapshot.summary.genre?.name} (${snapshot.summary.genre?.count})\n`);

  if (dryRun) {
    console.log("Dry run. Nothing written.\n");
    await client.end();
    return;
  }

  const existing = await db.query.users.findFirst({ where: eq(users.handle, HOUSE.handle) });
  const capturedAt = new Date();

  await db.transaction(async (tx) => {
    // Idempotent: re-running refreshes the canon rather than failing on the
    // unique index or creating a second account.
    // ── A refresh updates the account, not just the canon ─────────────────
    //
    // The first version took the existing row untouched, so changing the bio and
    // re-running looked like it worked and changed nothing. The canon refreshed
    // and the words above it did not.
    //
    // Only the fields this script OWNS. `handleClaimedAt` is not re-stamped,
    // because the handle was claimed once and that date is a fact about when.
    const [account] = existing
      ? await tx
          .update(users)
          .set({
            bio: HOUSE.bio,
            kind: "house",
            profileVisibility: "public",
            tasteVisibility: "public",
          })
          .where(eq(users.id, existing.id))
          .returning()
      : await tx
          .insert(users)
          .values({
            email: HOUSE.email,
            handle: HOUSE.handle,
            handleClaimedAt: capturedAt,
            kind: "house",
            bio: HOUSE.bio,
            // The only account in Rankd that is public by default, because
            // there is nobody to ask and being unreadable would defeat it.
            profileVisibility: "public",
            tasteVisibility: "public",
          })
          .returning();

    const row = {
      userId: account.id,
      entries: snapshot.entries,
      filmCount: snapshot.filmCount,
      duelCount: snapshot.duelCount,
      summary: snapshot.summary,
      updatedAt: capturedAt,
    };
    await tx.insert(tasteSnapshots).values(row).onConflictDoUpdate({
      target: tasteSnapshots.userId,
      set: row,
    });

    // ── One capture per day, not one per run ────────────────────────────
    //
    // The primary key is (user, capturedAt) and `capturedAt` is `new Date()`,
    // so two runs an hour apart are two rows and `onConflictDoNothing` never
    // fires. Re-running this script to pick up a new field is a normal thing to
    // do and it was quietly writing a second capture each time: two rows
    // seconds apart, both claiming to be the state at that moment, and
    // retention would keep both inside its weekly window.
    //
    // Today's capture is replaced instead. A re-seed corrects the day's answer
    // rather than adding a second one. Same idea as the cron's self-gate.
    await tx
      .delete(rankingHistory)
      .where(
        and(
          eq(rankingHistory.userId, account.id),
          gte(rankingHistory.capturedAt, startOfDay(capturedAt)),
        ),
      );

    // Written in the SAME transaction as the snapshot. A snapshot with no
    // matching history row breaks movement silently for that window.
    await tx.insert(rankingHistory).values({
      userId: account.id,
      capturedAt,
      entries: snapshot.entries,
      filmCount: snapshot.filmCount,
      // Nobody has fed this yet. It is the honest denominator behind every
      // movement number the profile will eventually show.
      contributors: 0,
    });

    // ── The one person it follows ─────────────────────────────────────
    //
    // The creator, as a credit. Written here rather than through `follow()`,
    // which refuses a house account outright: this is the deliberate exception
    // and it should be visible in the script that makes it rather than be a
    // hole in the rule.
    //
    // Idempotent, and silent if that account does not exist on this deployment.
    const creator = await tx.query.users.findFirst({
      where: eq(users.handle, CREATOR),
      columns: { id: true },
    });
    if (creator && creator.id !== account.id) {
      await tx
        .insert(follows)
        .values({ followerId: account.id, followeeId: creator.id })
        .onConflictDoNothing();
    }

    console.log(`${existing ? "Refreshed" : "Created"} @${HOUSE.handle} (${account.id.slice(0, 8)})`);
    console.log(creator ? `  follows @${CREATOR}` : `  @${CREATOR} not on this deployment, no follow written`);
  });

  console.log(`\nDone. Open /@${HOUSE.handle}\n`);
  await client.end();
}

main().catch(async (e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  // postgres.js keeps the process alive until the pool closes.
  await client.end().catch(() => {});
  process.exit(1);
});
