// Flagging a comment.
//
// Thin on purpose — see `reports` in the schema. A report says "a person looked
// at this and objected", which is the whole signal; the comment itself is right
// there to read. No reason text, because that would be a second free-text field
// to moderate on a surface that exists because free text is hard.

import { NextResponse } from "next/server";

import { requireHandle } from "@/lib/auth";
import { db, reports } from "@/lib/db";
import { LIMITS, take } from "@/lib/rateLimit";
import { canSeeComment } from "@/lib/social/activity";

export async function POST(request: Request) {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The comment bucket. Reporting and commenting are both "a person acting on a
  // thread", and a separate allowance would be a second door to one room.
  const allowed = await take(user.id, LIMITS.comment);
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request isn't valid JSON." }, { status: 400 });
  }

  const commentId = (body as { commentId?: unknown })?.commentId;
  if (typeof commentId !== "string") {
    return NextResponse.json({ error: "Nothing to report." }, { status: 400 });
  }

  // You may only report something you were entitled to read. Otherwise this
  // route becomes a way to find out whether a comment id exists at all.
  if (!(await canSeeComment(commentId, user.id))) {
    return NextResponse.json({ error: "No such comment" }, { status: 404 });
  }

  await db
    .insert(reports)
    .values({ reporterId: user.id, commentId })
    // Reporting twice is the same objection. Silently fine, so the reader is
    // never told off for tapping again.
    .onConflictDoNothing();

  return NextResponse.json({ reported: true });
}
