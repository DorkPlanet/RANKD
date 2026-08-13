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
  await post("/api/auth/signout");
}
