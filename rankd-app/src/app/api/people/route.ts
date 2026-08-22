// Searching for somebody by name.
//
// Signed-in only, and rate-limited. Handle search answers "does this person
// exist", so an open, unbounded version of it is an enumeration tool for the
// whole user base. `/api/handle` carries the same limit for the same reason.

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { MIN_QUERY, searchPeople } from "@/lib/social/people";
import { LIMITS, take } from "@/lib/rateLimit";

export async function GET(request: Request) {
  // `requireUser`, not `requireHandle`: this READS. Somebody who has not been
  // through the gate yet still has an account, and refusing them a search would
  // be refusing them the one thing that makes claiming a handle worth doing.
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const allowed = await take(user.id, LIMITS.peopleSearch);
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(allowed.retryAfter) } },
    );
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  // An empty answer rather than a 400. A field somebody is still typing into is
  // not a malformed request, and an error flashing under two characters would be
  // the app telling somebody off for typing.
  if (q.trim().length < MIN_QUERY) return NextResponse.json({ people: [] });

  return NextResponse.json({ people: await searchPeople(q, user.id) });
}
