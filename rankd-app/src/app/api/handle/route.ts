// Claiming a public name, and asking whether one is free.
//
// ── Why availability and claiming are the same file but not the same promise ─
//
// GET is a courtesy. It tells somebody mid-typing that `sam` has gone, so they
// find out while they are still deciding rather than after they have committed
// to it. Its answer is true for an instant and is never relied on.
//
// POST is the decision, and it can fail after GET said yes. That is not a race
// worth closing with a reservation table: reservations expire, get abandoned,
// and turn "somebody has this name" into "somebody thought about this name in
// the last ten minutes". The unique index on `lower(handle)` already settles it
// correctly under any amount of concurrency, so the honest design is to let the
// loser be told, once, in a sentence.

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { validateHandle } from "@/lib/handles";
import { claimHandle, isHandleAvailable } from "@/lib/users";
import { LIMITS, take } from "@/lib/rateLimit";

/** A 429 with a sentence and a Retry-After, never a bare status. */
function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Slow down a moment." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function GET(request: Request) {
  // Signed in only. Handle availability is a map of who exists, and an open
  // endpoint that answers it is an enumeration tool for anyone who wants to
  // find out which names are worth impersonating.
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // This endpoint answers "does this person exist", so without a bound it is a
  // way to enumerate every handle on Rankd. Sized well above what the gate's
  // own debounce can produce; see LIMITS.
  const allowed = await take(user.id, LIMITS.handleCheck);
  if (!allowed.ok) return tooMany(allowed.retryAfter);

  const raw = new URL(request.url).searchParams.get("h") ?? "";
  const check = validateHandle(raw);
  // A malformed handle is not "taken", and saying so would show the wrong
  // sentence. The reason travels back so the field can explain itself without
  // a second round trip.
  if (!check.ok) return NextResponse.json({ available: false, reason: check.reason });

  return NextResponse.json({ available: await isHandleAvailable(check.handle) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request isn't valid JSON." }, { status: 400 });
  }

  const allowed = await take(user.id, LIMITS.handleClaim);
  if (!allowed.ok) return tooMany(allowed.retryAfter);

  const { handle } = (body ?? {}) as { handle?: unknown };
  if (typeof handle !== "string") {
    return NextResponse.json({ error: "Pick a name people can find you by." }, { status: 400 });
  }

  // Validated again server-side, and not because the client is expected to
  // misbehave. The client is one caller of an endpoint that is reachable
  // without it, and the reserved list is the whole defence against `@support`.
  const check = validateHandle(handle);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const result = await claimHandle(user.id, check.handle);
  if (result.ok) return NextResponse.json({ handle: result.user.handle });

  // 409, not 400. Nothing is wrong with what they sent, somebody else just has
  // it, and the field's job now is to ask for another rather than to explain a
  // mistake.
  if (result.reason === "taken") {
    return NextResponse.json({ error: "That one just went. Try another." }, { status: 409 });
  }
  return NextResponse.json(
    { error: "This account already has a name." },
    { status: 409 },
  );
}
