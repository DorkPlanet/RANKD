// Trading the word for the cookie.
//
// The only route the middleware lets through unauthenticated, which is what
// makes it the only route worth attacking. Two things follow from that, and both
// are below: the throttle, and the deliberate vagueness of the failure.

import { NextResponse } from "next/server";

import { GATE_COOKIE, GATE_MAX_AGE, gateConfig, gateToken, safeEqual } from "@/lib/gate";

/**
 * Best-effort throttle, and deliberately described as no more than that.
 *
 * The same shape as `api/feedback`, and the same honest caveat: this map lives
 * in one serverless instance's memory, Vercel may run several, and cold starts
 * discard it. It slows a person guessing by hand. It would not slow anybody
 * running a real attack.
 *
 * The reason it is not `lib/rateLimit.ts` is structural rather than a
 * preference. That limiter keys on a `user_id` with a foreign key to `user.id`,
 * and nobody standing at this door has an account yet — there is no id to pass
 * and an IP string would violate the constraint. It also fails OPEN by design,
 * which is right for a handle lookup and wrong for a password field.
 *
 * Ten a minute: enough that mistyping the word a few times on a phone keyboard
 * never locks anybody out, few enough that guessing is not a strategy.
 */
const seen = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

function throttled(key: string): boolean {
  const now = Date.now();
  const hits = (seen.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  seen.set(key, hits);
  // Unbounded growth is the one thing an in-memory map must not do.
  if (seen.size > 500) for (const [k, v] of seen) if (v.every((t) => now - t > WINDOW_MS)) seen.delete(k);
  return hits.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const config = gateConfig();
  // No gate on this deployment. Answered rather than quietly succeeding, for the
  // same reason `api/feedback` answers 503: a form that says "in you go" while
  // setting a cookie nothing checks would be a lie that survives until somebody
  // finally sets the env var and wonders why everyone is already through.
  if (!config) {
    return NextResponse.json(
      { error: "This deployment has no gate." },
      { status: 503 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  // Checked BEFORE the body is read and before the password is compared, so a
  // flood costs one map lookup rather than a parse and an HMAC.
  if (throttled(ip)) {
    return NextResponse.json(
      { error: "Too many tries. Wait a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request isn't valid JSON." }, { status: 400 });
  }

  const { password } = (body ?? {}) as { password?: unknown };
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Enter the password." }, { status: 400 });
  }

  if (!safeEqual(password, config.password)) {
    // "That isn't it" and nothing else. Not how long the word is, not how close
    // they got, not whether a gate is even configured differently today.
    return NextResponse.json({ error: "That isn't it." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE, await gateToken(config.password, config.secret), {
    // Not readable from JavaScript: nothing in the app has any business asking
    // whether you are through the gate, and a token client code can read is a
    // token client code will eventually send somewhere.
    httpOnly: true,
    // HTTPS only in production; plain http on localhost has to keep working or
    // the gate cannot be tested before it ships.
    secure: process.env.NODE_ENV === "production",
    // "lax", not "strict": following a shared link into the app from a message
    // must not present as a stranger and bounce them back to the wall.
    sameSite: "lax",
    path: "/",
    maxAge: GATE_MAX_AGE,
  });
  return response;
}
