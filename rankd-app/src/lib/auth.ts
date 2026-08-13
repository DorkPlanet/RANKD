// The single session seam. This is the ONLY module in the app that imports the
// auth library, so every route learns who is asking through the accessors here
// and the provider stays a swappable detail (Google today, a magic link later)
// rather than something forty call sites know about.
//
// Rankd is one client-rendered page, so there are no protected server-rendered
// routes and nothing here redirects anybody: a signed-out visitor gets the whole
// app exactly as before. Only the sync routes ask who you are, and `requireUser`
// is what they ask.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import type { User } from "./db/schema";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Auth.js infers the client id and secret from AUTH_GOOGLE_ID /
  // AUTH_GOOGLE_SECRET, so the provider needs no explicit config — which is what
  // keeps it thin enough to swap.
  providers: [Google],
  events: {
    // First successful sign-in provisions exactly one `user` row; every sign-in
    // after resolves to that same row. Provisioning lives in `users.ts` so this
    // module stays the auth library's only importer; this event is just the hook
    // that hands the provider identity across.
    async signIn({ user }) {
      if (!user.email) return;
      // Imported here rather than at the top so that merely READING a session
      // never opens a database connection. `/api/auth/session` is polled by the
      // settings panel on a page whose whole promise is that it works without an
      // account — a static import would make that request fail outright on a
      // deployment with no DATABASE_URL set, instead of answering "signed out".
      const { provisionUser } = await import("./users");
      await provisionUser({
        email: user.email,
        displayName: user.name ?? null,
        avatarUrl: user.image ?? null,
      });
    },
  },
  // Session lives in a signed cookie — no database adapter, so signing in adds
  // no read to any request that isn't syncing.
  session: { strategy: "jwt" },
  // Honour the deployment's host header outside Vercel (local dev, self-host);
  // harmless on Vercel, where the host is trusted anyway.
  trustHost: true,
});

/** The active session, or null when the visitor is signed out. */
export async function getSession() {
  return auth();
}

/**
 * The account making this request, or `null`.
 *
 * Every sync route starts here rather than reading the session itself — one
 * place decides what "signed in" means, so no route can drift into its own
 * weaker version of the check. Returns the DATABASE row, not the provider's
 * claims: the routes key their writes on `user.id`, and a session cookie is not
 * proof that a row still exists.
 */
export async function requireUser(): Promise<User | null> {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return null;
  // Deferred for the same reason as the sign-in event above.
  const { findUserByEmail } = await import("./users");
  return (await findUserByEmail(email)) ?? null;
}
