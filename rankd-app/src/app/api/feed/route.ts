// The feed: everybody you follow, and you.
//
// Read-only, and there is nothing to POST to. Cards are derived on the server
// when a snapshot lands — see `lib/social/feed.ts` — so there is no route here
// for a client to assert that something happened.

import { NextResponse } from "next/server";

import { requireHandle } from "@/lib/auth";
import { LIMITS, take } from "@/lib/rateLimit";
import { feedFor } from "@/lib/social/activity";

/**
 * Signed in, with a handle.
 *
 * Unlike a public profile this is not a page a stranger can land on: it is
 * assembled from who YOU follow, so it has no meaning without a viewer.
 */
export async function GET() {
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

  return NextResponse.json({ items: await feedFor(user.id) });
}
