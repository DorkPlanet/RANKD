// The feed: everybody you follow, and you.
//
// Cards are derived on the server when a snapshot lands — see
// `lib/social/feed.ts` — so there is nothing here for a client to POST. What a
// person CAN write is a comment, and that lives on its own route.

import { NextResponse } from "next/server";

import { requireHandle } from "@/lib/auth";
import { LIMITS, take } from "@/lib/rateLimit";
import { feedFor, markSeen, unreadFor } from "@/lib/social/activity";

/**
 * Signed in, with a handle.
 *
 * Unlike a public profile this is not a page a stranger can land on: it is
 * assembled from who YOU follow, so it has no meaning without a viewer.
 */
export async function GET(request: Request) {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The same bucket people search uses. Both are ways of pulling a list of who
  // exists and what they did, and a second allowance would be a second door to
  // one room.
  const allowed = await take(user.id, LIMITS.peopleSearch);
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfter) } },
    );
  }

  // ── The unread count is read BEFORE it is cleared ────────────────────────
  //
  // Opening the screen is what marks it seen, so the count has to be taken
  // first or the reader is told "nothing new" by the very act of looking. The
  // number returned is what was waiting for them when they arrived.
  const unread = await unreadFor(user);
  const items = await feedFor(user.id);

  // `peek` is how the nav asks for the dot without the act of asking clearing
  // it. Everything else is somebody actually opening the screen.
  const peek = new URL(request.url).searchParams.get("peek") === "1";
  if (!peek) await markSeen(user.id);

  return NextResponse.json({ items, unread });
}
