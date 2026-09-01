// The app's first middleware, and the only thing in Rankd that runs before a
// route does.
//
// ── Why this is not a React component like the other two gates ─────────────
//
// `SignInGate` and `HandleGate` are components, and both say in their own
// comments that they are courtesies rather than boundaries: they run in a
// browser, so they are the reader's to bypass. That was the right call for what
// they do. It is the wrong call here, for one specific reason.
//
// `events.signIn` in `lib/auth.ts` calls `provisionUser`, an upsert on email. So
// anyone who can reach `/api/auth/*` can create themselves an account, and a
// wall that a determined person can step around is a wall that lets the user
// table refill. This has to be server-side or it does nothing at all.
//
// ── Everything is walled, including the public profiles ────────────────────
//
// `/u/[handle]` (and `/@handle`, which rewrites onto it) is genuinely
// server-rendered and genuinely public. It is behind the wall too. Shared
// profile links therefore do not work for outsiders while the gate is up, and
// that is the intended trade for now: the gate is meant to stop people using
// the app, and a wall with the sign-in route left open would not.
//
// `/api/auth/*` is walled DELIBERATELY. That is the line that makes the wipe
// permanent, so if a future change needs to punch a hole in this matcher, it is
// the one path that must not be the hole.
//
// ── It fails OPEN when unconfigured ────────────────────────────────────────
//
// No GATE_PASSWORD means no gate, and every request passes exactly as it did
// before this file existed. That is the same shape as `api/feedback`, which
// answers 503 rather than pretending, and it is the right way round for a
// safeguard: a missing env var on a deploy should not brick the app for
// everybody including the person who owns it. A real security boundary would
// fail closed. This is not one — see `lib/gate.ts`.

import { NextResponse, type NextRequest } from "next/server";

import { GATE_COOKIE, gateConfig, gateToken, safeEqual } from "@/lib/gate";

export async function middleware(request: NextRequest) {
  const config = gateConfig();
  if (!config) return NextResponse.next();

  const presented = request.cookies.get(GATE_COOKIE)?.value;
  if (presented) {
    const expected = await gateToken(config.password, config.secret);
    if (safeEqual(presented, expected)) return NextResponse.next();
  }

  // Rewritten, not redirected. The address bar keeps the address they asked for,
  // so typing the word lands them on the page they were trying to reach rather
  // than dumping them at the top of the app — and a shared link survives the
  // gate instead of being replaced by `/gate` in their history.
  return NextResponse.rewrite(new URL("/gate", request.url));
}

export const config = {
  matcher: [
    // Everything except: Next's own build output and image optimiser, the
    // handful of files the gate page itself needs to render, and the gate. A
    // wall that cannot draw itself is a blank screen.
    //
    // Note what is NOT excluded: `/api/auth`, `/u`, `/@handle`. Those are the
    // point.
    "/((?!_next/static|_next/image|favicon.ico|gate|api/gate|rankd\\.png|icon-192\\.png|icon-512\\.png|apple-touch-icon\\.png|manifest\\.webmanifest).*)",
  ],
};
