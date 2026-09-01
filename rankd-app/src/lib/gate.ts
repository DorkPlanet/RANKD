// The front-door password, and the one value that proves you got through it.
//
// ── What this is, and what it is not ───────────────────────────────────────
//
// This is a builder's safeguard, not a security boundary. It exists because a
// handful of people were given the live address, made an account each, and never
// came back — so the database filled with rows that made the social layer look
// populated when it wasn't. One shared word at the door means the next round of
// testers arrive when they're handed it, and not before.
//
// It is a SHARED secret. Everybody who gets in uses the same word, so it proves
// nothing about who is asking and it is only ever as private as the least
// careful person holding it. Nothing downstream may treat "through the gate" as
// identity: `requireUser` is still the only answer to who this is.
//
// ── Why the cookie is derived and not a flag ───────────────────────────────
//
// The obvious cookie is `rankd_gate=yes`, and it takes about four seconds to
// forge from devtools, which would make the whole wall decorative. So the cookie
// carries HMAC-SHA256 of the password under AUTH_SECRET: unguessable without
// both, and verified by recomputing rather than by storing anything.
//
// Two properties fall out of deriving it that are worth having on purpose:
//
//   • Changing GATE_PASSWORD invalidates every cookie ever issued. Rotating the
//     word is how you revoke access from someone you'd rather not have it, and
//     it takes one env var and a redeploy.
//   • Rotating AUTH_SECRET does the same. That matters here because rotating it
//     is also how the old session cookies get killed, and doing both at once
//     should not leave anyone half-in.
//
// ── Web Crypto only ────────────────────────────────────────────────────────
//
// `middleware.ts` runs on the Edge runtime, where `node:crypto` does not exist.
// `crypto.subtle` is present in both runtimes, so this one module serves the
// middleware and the route handler alike and the two can never disagree about
// what a valid cookie looks like.

/** The cookie the middleware looks for. */
export const GATE_COOKIE = "rankd_gate";

/**
 * Ninety days. Long enough that a tester types the word once and then forgets
 * this exists, short enough that an abandoned device stops being a way in.
 * Rotating the password revokes it sooner regardless, which is the real control.
 */
export const GATE_MAX_AGE = 60 * 60 * 24 * 90;

/**
 * The gate's configuration, or `null` when this deployment has no gate.
 *
 * Both halves are required. AUTH_SECRET alone is not a gate, and GATE_PASSWORD
 * without AUTH_SECRET has nothing to key the HMAC with — Auth.js requires
 * AUTH_SECRET anyway, so its absence means a deployment that could not sign
 * anybody in either.
 */
export function gateConfig(): { password: string; secret: string } | null {
  const password = process.env.GATE_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!password || !secret) return null;
  return { password, secret };
}

/** The cookie value a correct password earns. Hex HMAC-SHA256(secret, password). */
export async function gateToken(password: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(password));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison.
 *
 * The length check leaks length, which is fine — both sides are fixed-length hex
 * of a known hash. What must not leak is WHERE two values first differ, because
 * that is what turns guessing a 64-character token into guessing it one
 * character at a time. Timing attacks over the public internet against a
 * middleware are close to theoretical; writing the loop correctly costs three
 * lines, so there is no reason to be the person who left it as `===`.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
