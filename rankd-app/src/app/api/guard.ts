// Standing between a public URL and someone else's TMDb bill.
//
// These routes exist to keep the API key server-side, which means the key's
// quota is spent by whoever can reach them. On a deployed URL that's the entire
// internet, and /api/film?title= is a perfectly good free TMDb proxy for anyone
// who finds it. One cheap defence, which doesn't pretend to be security: only
// answer calls that came from this app.
//
// There was a per-caller rate limit here too — 90 requests a minute. It was
// sized for browsing ("~8/sec, briefly") and an import is not brief: both
// backfill loops pace at 120ms, so a fresh library spent the whole minute's
// budget in about eleven seconds and then 429'd for the remaining forty-nine.
// Worse, by the time a 429 reached the client it was indistinguishable from
// "TMDb has nothing" (both arrive as {}), so those films were cached as
// answered and never asked about again that session — posters stopped and
// stayed stopped until a reload. TMDb's own limit is ~50/sec, far above
// anything this app does, so the cap was only ever protecting against
// strangers, which is what sameApp already does.

import { NextResponse } from "next/server";

// A browser always sends Origin on a cross-origin fetch and Referer on a
// same-origin one. Anything with neither is a script rather than the app, and
// anything from a host that isn't ours is someone else's page.
function sameApp(request: Request): boolean {
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (host === new URL(request.url).host) return true;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;
  // Vercel gives every deployment its own hostname as well as the stable one,
  // so preview builds have to be allowed through too.
  return host.endsWith(".vercel.app");
}

// Returns a response to send back, or null to carry on with the request.
export function refuse(request: Request): NextResponse | null {
  if (!sameApp(request)) {
    return NextResponse.json({ error: "Not available from here" }, { status: 403 });
  }
  return null;
}
