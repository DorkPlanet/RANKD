// Your conversations, and starting a new one.
//
// A thread is two people and one film — never a wall. See `social/threads.ts`
// for why that shape rather than a public film thread or a review.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { requireHandle } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { LIMITS, take } from "@/lib/rateLimit";
import { openThread, threadsFor } from "@/lib/social/threads";

export async function GET() {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ threads: await threadsFor(user.id) });
}

/** Open a conversation with somebody about a film, or return the one already open. */
export async function POST(request: Request) {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

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

  const { handle, subjectId, meta } = (body ?? {}) as Record<string, unknown>;
  if (typeof handle !== "string" || typeof subjectId !== "string" || !subjectId) {
    return NextResponse.json({ error: "Nothing to talk about." }, { status: 400 });
  }

  const other = await db.query.users.findFirst({
    where: eq(users.handle, handle.toLowerCase()),
    columns: { id: true, suspendedAt: true, deletedAt: true },
  });
  // One answer for every reason somebody is unreachable, so this cannot be used
  // to find out who exists.
  if (!other || other.suspendedAt || other.deletedAt) {
    return NextResponse.json({ error: "No such person" }, { status: 404 });
  }

  const result = await openThread(
    user.id,
    other.id,
    subjectId,
    (meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {}) as Record<string, unknown>,
  );
  if (!result.ok) {
    // Mutual follow is the whole access model. Said plainly rather than hidden,
    // because it is a thing the reader can actually do something about.
    return NextResponse.json(
      { error: result.reason === "self" ? "That's you." : "You both need to follow each other." },
      { status: 403 },
    );
  }

  return NextResponse.json({ threadId: result.threadId });
}
