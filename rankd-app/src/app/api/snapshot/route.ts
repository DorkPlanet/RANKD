// The answer other people read.
//
// PUT and DELETE, no GET, and that asymmetry is the design. A snapshot is derived from a
// library that lives on a device, so the device is the only thing that can
// produce one and the server is the only thing that needs to keep it. Nothing
// reads it back: a GET here would invite somebody to rebuild state from it, and
// it is a stale opinion rather than a source of truth. Strangers read it through
// `/api/u/[handle]`, which decides what they are allowed to see.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { requireHandle } from "@/lib/auth";
import { db, tasteSnapshots } from "@/lib/db";
import type { SnapshotEntry, SnapshotSummary } from "@/lib/snapshot";
import { writeFeedCards } from "@/lib/social/activity";

/**
 * A ceiling on what will be stored.
 *
 * The largest real library in the fixtures is 861 films. Ten thousand is far
 * past anything a person ranks by hand and still small enough that a bad client
 * cannot fill a jsonb column with a novel.
 */
const MAX_ENTRIES = 10_000;

/**
 * ── Why this asks `requireHandle` rather than `requireUser` ─────────────────
 *
 * Publishing a snapshot is creating something PUBLIC. It is the object every
 * other person's view of you is built from, and a row with no handle has no
 * address anybody could reach it at, so storing one would be writing a page
 * nobody can visit. Same boundary every social write uses. See lib/auth.ts.
 */
export async function PUT(request: Request) {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request isn't valid JSON." }, { status: 400 });
  }

  const { entries, filmCount, duelCount, summary } = (body ?? {}) as Record<string, unknown>;

  // Shape-checked rather than trusted, because this is the one table a stranger
  // reads out of. The contents are not INSPECTED beyond this — the client owns
  // what a snapshot means — but the container has to be the right shape or the
  // profile page renders somebody else's mistake.
  if (!Array.isArray(entries)) {
    return NextResponse.json({ error: "That snapshot isn't valid." }, { status: 400 });
  }
  if (entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: "That snapshot is too large." }, { status: 413 });
  }
  if (typeof filmCount !== "number" || typeof duelCount !== "number") {
    return NextResponse.json({ error: "That snapshot isn't valid." }, { status: 400 });
  }
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return NextResponse.json({ error: "That snapshot isn't valid." }, { status: 400 });
  }

  const updatedAt = new Date();

  // ── The feed is written HERE, from the diff, and nowhere else ─────────────
  //
  // Read the stored order before it is overwritten. That is the only moment the
  // server holds both what somebody's ranking WAS and what it now is, and every
  // card in the feed falls out of comparing the two.
  //
  // Doing it here is what lets the client stay out of it entirely: it pushes its
  // ranking exactly as it always did and asserts nothing, so there is no event
  // anybody can fake and no emission route to rate limit. It is also idempotent
  // by construction — pushing the same library twice diffs to nothing.
  await writeFeedCards(user, entries as SnapshotEntry[], summary as SnapshotSummary);

  // Replaced whole. There is no history and there should not be: a snapshot is
  // the CURRENT answer, and last week's guess about somebody's taste is of no
  // use to anybody, including them.
  await db
    .insert(tasteSnapshots)
    .values({
      userId: user.id,
      entries: entries as SnapshotEntry[],
      filmCount: Math.max(0, Math.floor(filmCount)),
      duelCount: Math.max(0, Math.floor(duelCount)),
      summary: summary as SnapshotSummary,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: tasteSnapshots.userId,
      set: {
        entries: entries as SnapshotEntry[],
        filmCount: Math.max(0, Math.floor(filmCount)),
        duelCount: Math.max(0, Math.floor(duelCount)),
        summary: summary as SnapshotSummary,
        updatedAt,
      },
    });

  return NextResponse.json({ updatedAt: updatedAt.toISOString() });
}

/**
 * Unpublish. What a library with nothing left in it sends.
 *
 * ── Why "nothing to publish" cannot just mean "send nothing" ───────────────
 *
 * `worthPublishing` skips the push for a library with no placements, which is
 * right for an account that has never ranked anything. It is exactly wrong for
 * one that HAS and then cleared its ranking: skipping leaves the previous
 * snapshot in place, so a profile keeps showing a top ten its owner has
 * deliberately thrown away, indefinitely, with no way to take it down.
 *
 * So an empty library is a statement and it is sent as one. Same shape of bug
 * `pushLists` documents at length about an empty shelf, and the same fix.
 *
 * Deleting the row rather than storing an empty one is deliberate: no row is
 * already the state a never-published account is in, and `getPublicProfile`
 * reads it as zeroes.
 */
export async function DELETE() {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await db.delete(tasteSnapshots).where(eq(tasteSnapshots.userId, user.id));
  return NextResponse.json({ deleted: true });
}
