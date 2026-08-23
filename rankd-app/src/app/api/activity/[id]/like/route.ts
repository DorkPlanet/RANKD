// Agreeing with a placement, and taking it back.
//
// The whole public interaction on a card. A comment is expensive to write, so it
// is rare, so most people receive nothing back; a like costs one tap, so it
// happens in volume, so everybody does. Reciprocity is what brings people to
// open an app, and this is the cheapest honest way to produce it.
//
// There is no dislike. The reader is already shown privately where they differ
// — see `yourRank` in `feed.ts` — which is the honest half without building a
// scoreboard of who got voted down.

import { NextResponse } from "next/server";

import { requireHandle } from "@/lib/auth";
import { LIMITS, take } from "@/lib/rateLimit";
import { setLike } from "@/lib/social/activity";

type Params = { params: Promise<{ id: string }> };

async function toggle(request: Request, { params }: Params, on: boolean) {
  const user = await requireHandle();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // A tap is cheap by design, so the allowance is generous — this is here to
  // stop a script, not to ration a person scrolling a feed.
  const allowed = await take(user.id, LIMITS.peopleSearch);
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfter) } },
    );
  }

  const { id } = await params;
  const result = await setLike(id, user.id, on);
  // Null means "not yours to see", answered exactly as a missing card is, so
  // this cannot be used to discover that a card exists.
  if (!result) return NextResponse.json({ error: "No such card" }, { status: 404 });

  return NextResponse.json(result);
}

export const POST = (request: Request, ctx: Params) => toggle(request, ctx, true);
export const DELETE = (request: Request, ctx: Params) => toggle(request, ctx, false);
