// Standing between a public URL and someone else's TMDb bill.
//
// These routes exist to keep the API key server-side, which means the key's
// quota is spent by whoever can reach them. On a deployed URL that's the entire
// internet, and /api/film?title= is a perfectly good free TMDb proxy for anyone
// who finds it. Two cheap defences, neither of which pretends to be security:
// only answer calls that came from this app, and cap how fast any one caller can
// make them.

import { NextResponse } from "next/server";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 90; // a browsing session fetches at ~8/sec, briefly

// Per-process and lost on cold start, which is fine — this stops casual abuse
// and accidental loops, not a determined attacker. A real limiter needs shared
// state, and that arrives with the backend.
const hits = new Map<string, { n: number; until: number }>();

function rateLimited(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "local";
  const now = Date.now();
  const seen = hits.get(ip);
  if (!seen || now > seen.until) {
    hits.set(ip, { n: 1, until: now + WINDOW_MS });
    return false;
  }
  seen.n++;
  return seen.n > MAX_PER_WINDOW;
}

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
  if (rateLimited(request)) {
    return NextResponse.json({ error: "Slow down" }, { status: 429 });
  }
  return null;
}
