// Following somebody, and asking where you stand with them.
//
// GET is the only one a signed-out visitor may call, and it answers with counts
// and three falses. The profile page is server-rendered and public, so the
// button on it has to say something sensible before anybody has signed in.

import { NextResponse } from "next/server";

import { requireHandle, requireUser } from "@/lib/auth";
import { follow, followStateFor, unfollow } from "@/lib/social/follow";
import { db, users } from "@/lib/db";
import { LIMITS, take } from "@/lib/rateLimit";
import { eq } from "drizzle-orm";

/** A 429 with a sentence and a Retry-After, never a bare status. */
function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Slow down a moment." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/** Resolve `?handle=` to an id, or null. Shared by all three verbs. */
async function targetIdFor(request: Request): Promise<string | null> {
  const handle = new URL(request.url).searchParams.get("handle")?.trim().toLowerCase();
  if (!handle) return null;
  const row = await db.query.users.findFirst({
    where: eq(users.handle, handle),
    columns: { id: true },
  });
  return row?.id ?? null;
}

export async function GET(request: Request) {
  const targetId = await targetIdFor(request);
  if (!targetId) return NextResponse.json({ error: "No such person" }, { status: 404 });

  // `requireUser`, not `requireHandle`: this READS, and a signed-out visitor is
  // a legitimate caller who gets the counts and no edges.
  const viewer = await requireUser();
  return NextResponse.json(await followStateFor(targetId, viewer?.id ?? null));
}

export async function POST(request: Request) {
  // `requireHandle`, because following is a PUBLIC act: it puts you in somebody
  // else's follower list under a name they can read. An account with no handle
  // has no name to appear under. See lib/auth.ts.
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const handle = new URL(request.url).searchParams.get("handle")?.trim();
  if (!handle) return NextResponse.json({ error: "No such person" }, { status: 404 });

  // Counted on the WRITE only. Unfollowing is not limited: it is how somebody
  // undoes a mistake, and a limiter that can strand you as a follower of
  // somebody you want nothing to do with has the trade backwards.
  const allowed = await take(user.id, LIMITS.follow);
  if (!allowed.ok) return tooMany(allowed.retryAfter);

  const result = await follow(user.id, handle);
  if (!result.ok) {
    return result.reason === "self"
      ? NextResponse.json({ error: "You already know what you think." }, { status: 400 })
      : NextResponse.json({ error: "No such person" }, { status: 404 });
  }

  const targetId = await targetIdFor(request);
  return NextResponse.json(await followStateFor(targetId!, user.id));
}

export async function DELETE(request: Request) {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const handle = new URL(request.url).searchParams.get("handle")?.trim();
  if (!handle) return NextResponse.json({ error: "No such person" }, { status: 404 });

  const result = await unfollow(user.id, handle);
  if (!result.ok) return NextResponse.json({ error: "No such person" }, { status: 404 });

  const targetId = await targetIdFor(request);
  return NextResponse.json(await followStateFor(targetId!, user.id));
}
