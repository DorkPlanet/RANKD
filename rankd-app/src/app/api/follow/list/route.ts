// Who follows somebody, and who they follow.
//
// Readable by anyone who could see the profile itself, which is what makes the
// network grow: you browse the follows of somebody whose taste you trust. A
// private account has no lists, the same way it has no counts.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { followList, type Direction } from "@/lib/social/follow";
import { LIMITS, take } from "@/lib/rateLimit";

export async function GET(request: Request) {
  // ── Readable signed OUT, unlike search ──────────────────────────────────
  //
  // The rule is "anyone who can see the profile can see its lists", and a public
  // profile is visible to a signed-out stranger. Requiring an account here would
  // mean the counts on the page were readable and the names behind them were
  // not, which is a distinction nobody asked for.
  //
  // Nothing new is exposed: every handle in a list is already public and already
  // findable. What IS new is that the social graph can be walked without an
  // account, which the per-user limiter below cannot bound because a signed-out
  // caller has no id to count against. Acceptable at this scale and worth
  // revisiting with an IP-based limit before the graph is worth scraping.
  const user = await requireUser();

  if (user) {
    // The same bucket people search uses. Both are ways of enumerating who
    // exists, and a separate allowance would be a second door to one room.
    const allowed = await take(user.id, LIMITS.peopleSearch);
    if (!allowed.ok) {
      return NextResponse.json(
        { error: "Slow down a moment." },
        { status: 429, headers: { "Retry-After": String(allowed.retryAfter) } },
      );
    }
  }

  const params = new URL(request.url).searchParams;
  const handle = params.get("handle")?.trim().toLowerCase();
  const dir = params.get("dir");
  if (!handle) return NextResponse.json({ error: "No such person" }, { status: 404 });
  if (dir !== "followers" && dir !== "following") {
    return NextResponse.json({ error: "Which direction?" }, { status: 400 });
  }

  const target = await db.query.users.findFirst({
    where: eq(users.handle, handle),
    columns: { id: true, profileVisibility: true, deletedAt: true, suspendedAt: true },
  });

  // One answer for every reason a profile is unreadable, matching
  // `getProfileView`. A private account's lists are as private as its counts.
  if (!target || target.deletedAt || target.suspendedAt || target.profileVisibility !== "public") {
    return NextResponse.json({ error: "No such person" }, { status: 404 });
  }

  return NextResponse.json({
    people: await followList(target.id, dir as Direction, user?.id ?? null),
  });
}
