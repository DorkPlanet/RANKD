"use client";

// The client's side of the session seam.
//
// `lib/auth.ts` is the only module that imports the auth library, and that rule
// holds on the client too: this talks to Auth.js's own HTTP endpoints rather
// than importing `next-auth/react`. The cost is a few lines of form-posting; the
// benefit is that swapping the provider stays a change to one server module, and
// no React provider has to wrap `AppShell` (which would put a context around the
// duel screen for the sake of a settings panel).

export interface AccountInfo {
  email: string;
  name?: string;
  image?: string;
}

/** Who is signed in, or null. Auth.js answers `{}` for a signed-out visitor. */
export async function fetchAccount(): Promise<AccountInfo | null> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (!res.ok) return null;
    const session = (await res.json()) as { user?: { email?: string; name?: string; image?: string } };
    const email = session?.user?.email;
    if (!email) return null;
    return { email, name: session.user?.name, image: session.user?.image };
  } catch {
    // Offline, or the routes aren't configured. Signed out is the safe reading:
    // the app works fully without an account, so this degrades to "as before".
    return null;
  }
}

// Auth.js requires a CSRF token on both sign-in and sign-out, and OAuth needs a
// real navigation rather than a fetch — so both go through a submitted form.
async function post(path: string): Promise<void> {
  const res = await fetch("/api/auth/csrf", { cache: "no-store" });
  const { csrfToken } = (await res.json()) as { csrfToken: string };

  const form = document.createElement("form");
  form.method = "POST";
  form.action = path;
  form.style.display = "none";
  for (const [name, value] of [
    ["csrfToken", csrfToken],
    ["callbackUrl", window.location.href],
  ]) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export async function signInWithGoogle(): Promise<void> {
  await post("/api/auth/signin/google");
}

export async function signOutOfAccount(): Promise<void> {
  // Forgotten BEFORE the navigation, not after: `post` submits a form and the
  // document is torn down, so anything queued after it never runs.
  forgetSignedIn();
  await post("/api/auth/signout");
}

// ── Is anyone signed in, and do we actually know? ──────────────────────────
//
// `fetchAccount` answers `null` for two very different situations: nobody is
// signed in, and we could not ask. That conflation is harmless when the answer
// only decides whether to show an avatar. It is not harmless now that it
// decides whether the app opens at all — treating "offline" as "signed out"
// would put the sign-in wall in front of somebody's own library on a plane,
// which is precisely the failure the local-first design exists to avoid.
//
// So the gate asks this instead, and gets three answers rather than two.

const SIGNED_IN_KEY = "rankd-signed-in-v1";

export type SessionState =
  | { kind: "in"; account: AccountInfo }
  | { kind: "out" }
  /** The network could not be asked. Says nothing about whether anyone is signed in. */
  | { kind: "unknown" };

/**
 * Has this browser ever completed a sign-in?
 *
 * Device state, like the install hint: it describes this browser rather than
 * the person, so it is deliberately in neither backup set and never synced. Its
 * only job is to answer the offline case — see `sessionKnown` below.
 *
 * Not a security boundary and not pretending to be one. Every route that
 * matters re-checks the real session server-side (`requireUser`), so the worst
 * a forged flag buys is a look at a library already on the device it was forged
 * on.
 */
export function hasSignedInBefore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberSignedIn(): void {
  try {
    localStorage.setItem(SIGNED_IN_KEY, "1");
  } catch {
    // Storage disabled. The gate then asks the network every open, which works.
  }
}

export function forgetSignedIn(): void {
  try {
    localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // Nothing stored to forget.
  }
}

/** Who is signed in, distinguishing "nobody" from "could not ask". */
export async function fetchSession(): Promise<SessionState> {
  let res: Response;
  try {
    res = await fetch("/api/auth/session", { cache: "no-store" });
  } catch {
    return { kind: "unknown" };
  }
  // A 5xx is the server failing to answer, which is not the same claim as "you
  // are signed out" either. Only a successful response with no user is.
  if (!res.ok) return res.status >= 500 ? { kind: "unknown" } : { kind: "out" };

  let session: { user?: { email?: string; name?: string; image?: string } };
  try {
    session = (await res.json()) as typeof session;
  } catch {
    return { kind: "unknown" };
  }

  const email = session?.user?.email;
  if (!email) {
    // A definite "no". Clear the remembered flag, or a browser that signed out
    // somewhere else would keep letting itself in whenever it went offline.
    forgetSignedIn();
    return { kind: "out" };
  }
  rememberSignedIn();
  return { kind: "in", account: { email, name: session.user?.name, image: session.user?.image } };
}
