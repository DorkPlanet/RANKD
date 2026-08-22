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
  // The cached public identity goes with it. Left behind, the next person to
  // sign in on this browser would be met by the previous one's handle while the
  // network was being asked, and offline they would never stop being met by it.
  forgetMe();
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

// ── Who you are in public, and the one way this can hurt somebody ──────────
//
// `fetchSession` above exists because "could not ask" and "signed out" are
// different claims, and treating the first as the second puts a sign-in wall in
// front of somebody's own library on a plane.
//
// A handle gate reintroduces that exact failure through a different door. It
// asks a NEW question of the network on every open, and the naive reading of a
// failed request is "no handle yet, show the wall". That would lock a signed-in
// reader with 861 films out of a library sitting on the device in their hand,
// for want of a name they cannot claim offline anyway.
//
// So this answers in three states for the same reason `fetchSession` does, and
// the gate is only ever allowed to fire on the definite one. `rankd-me-v1` is
// what makes the offline case pleasant rather than merely safe: a browser that
// has already seen its own handle does not have to re-derive anything.

const ME_KEY = "rankd-me-v1";

export interface Me {
  /** `null` means this account has not been through the gate yet. */
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  profileVisibility: "private" | "public";
  tasteVisibility: "private" | "public";
}

/**
 * Nobody in particular.
 *
 * What the profile renders as on a first-ever open with no network and nothing
 * cached. Every field absent rather than invented, so `publicName` falls back to
 * "You" and `avatarOf` falls back to a letter, which is exactly what a
 * signed-out reader has always seen. Visibility is private, because a value
 * standing in for "we don't know" must never be the one that shows somebody.
 */
export const EMPTY_ME: Me = {
  handle: null,
  displayName: null,
  avatarUrl: null,
  bio: null,
  profileVisibility: "private",
  tasteVisibility: "private",
};

export type MeState =
  /** The server answered. This is the only state the gate may act on. */
  | { kind: "me"; me: Me }
  /** The server answered, and nobody is signed in. */
  | { kind: "out" }
  /**
   * Could not ask. `me` is whatever this browser last saw, or null if it has
   * never seen anything. Says NOTHING about whether a handle exists.
   */
  | { kind: "unknown"; me: Me | null };

/**
 * Device state, like `rankd-signed-in-v1` beside it.
 *
 * Deliberately in NEITHER backup set and never synced. It describes what this
 * browser last heard, not what is true, and restoring it onto a second device
 * from a file would be planting a stale answer somewhere it was never asked.
 * See the key index in `lib/backupFormat.ts`.
 */
export function cachedMe(): Me | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Me> | null;
    // A shape check rather than a cast. This is read on the path that decides
    // whether to show a wall, so a half-written or hand-edited value has to fail
    // as "nothing cached" and not as a `me` with undefined fields.
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.handle !== null && typeof parsed.handle !== "string") return null;
    return {
      handle: parsed.handle ?? null,
      displayName: parsed.displayName ?? null,
      avatarUrl: parsed.avatarUrl ?? null,
      bio: parsed.bio ?? null,
      profileVisibility: parsed.profileVisibility === "public" ? "public" : "private",
      tasteVisibility: parsed.tasteVisibility === "public" ? "public" : "private",
    };
  } catch {
    return null;
  }
}

function rememberMe(me: Me): void {
  try {
    localStorage.setItem(ME_KEY, JSON.stringify(me));
  } catch {
    // Storage disabled. The gate then asks the network every open, which works.
  }
}

export function forgetMe(): void {
  try {
    localStorage.removeItem(ME_KEY);
  } catch {
    // Nothing stored to forget.
  }
}

/** Who you are in public, distinguishing "nobody" and "could not ask". */
export async function fetchMe(): Promise<MeState> {
  let res: Response;
  try {
    res = await fetch("/api/me", { cache: "no-store" });
  } catch {
    return { kind: "unknown", me: cachedMe() };
  }

  if (res.status === 401) {
    // A definite "nobody". Same reasoning as `fetchSession`: clear the cache, or
    // a browser signed out elsewhere keeps answering from a stale identity.
    forgetMe();
    return { kind: "out" };
  }
  // A 5xx is the server failing, which is not a claim about your handle.
  if (!res.ok) return { kind: "unknown", me: cachedMe() };

  let me: Me;
  try {
    me = (await res.json()) as Me;
  } catch {
    return { kind: "unknown", me: cachedMe() };
  }
  rememberMe(me);
  return { kind: "me", me };
}

/**
 * May the handle gate be shown?
 *
 * ── The single most dangerous line in the social layer ─────────────────────
 *
 * It is a function, and it is tested, because getting it wrong does not look
 * like a bug. It looks like the app working perfectly for everybody on the
 * office wifi and locking somebody out of an 861-film library on a train, for
 * want of a name they could not have claimed offline anyway.
 *
 * TRUE for exactly one state: Rankd answered, and the answer was "no handle".
 *
 * FALSE for `unknown`, which is the whole point. "Could not ask" is not "has no
 * handle" any more than it is "signed out", and `fetchSession` above already
 * carries the long version of that argument. Whatever this browser has cached
 * is deliberately NOT consulted: a cached "no handle" is still not an answer
 * about now, and the cost of waiting until the next connected open is nothing.
 *
 * FALSE for `out`, because a signed-out visitor meets `SignInGate` instead and
 * two walls at once is nobody's idea of a front door.
 */
export function needsHandle(state: MeState | null): boolean {
  return state?.kind === "me" && state.me.handle === null;
}

export type ClaimOutcome = { ok: true; me: Me } | { ok: false; error: string };

/** Claim the public name. One-way: see `claimHandle` in lib/users.ts. */
export async function claimHandle(handle: string): Promise<ClaimOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/handle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle }),
    });
  } catch {
    // The one place offline gets a sentence rather than a pass. Claiming needs
    // the network by definition, so there is nothing to degrade to.
    return { ok: false, error: "Couldn't reach Rankd. Check your connection." };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? "That didn't work. Try again." };
  }

  // Read back rather than trusting the local guess, so the cache holds what the
  // server actually stored and the gate cannot re-fire on the next open.
  const after = await fetchMe();
  if (after.kind === "me") return { ok: true, me: after.me };
  return { ok: false, error: "That didn't work. Try again." };
}

/** Is this name free? Advisory, and the claim can still lose. */
export async function handleAvailable(
  handle: string,
): Promise<{ available: boolean; reason?: string } | null> {
  try {
    const res = await fetch(`/api/handle?h=${encodeURIComponent(handle)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as { available: boolean; reason?: string };
  } catch {
    // Null is "could not ask", which the field shows as nothing at all. A red
    // "taken" on a dropped request would be a lie about somebody else's name.
    return null;
  }
}

/** Edit the public half of the profile. */
export async function saveMe(patch: Partial<Me>): Promise<ClaimOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    return { ok: false, error: "Couldn't reach Rankd. Check your connection." };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? "That didn't save. Try again." };
  }
  const me = (await res.json()) as Me;
  rememberMe(me);
  return { ok: true, me };
}
