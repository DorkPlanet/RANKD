// Somebody's profile, to somebody who is not them.
//
// ── The first server-rendered page in Rankd ────────────────────────────────
//
// Everything else is `/`, which is one client component and a `useState` screen
// toggle. That is right for the duel loop, where an in-progress run lives in
// memory and a navigation would be a full boot. It is wrong for this: a profile
// has no session behind it, it is the thing people paste into a chat, and it has
// to answer a crawler and a signed-out stranger with no JavaScript at all.
//
// So this renders on the server, reads nothing from localStorage, and shares no
// state with the app. The two live side by side deliberately.
//
// Reached as `/@handle` through the rewrite in next.config.ts. See there for why
// the folder cannot be called `@[handle]`.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicProfile } from "@/lib/social/publicProfile";
import { PublicProfileView } from "@/components/PublicProfileView";

// Always fresh. A profile changes whenever its owner ranks anything, and a
// cached copy of somebody's top ten is worse than a slightly slower page.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);
  if (!profile) return { title: "Not found" };

  return {
    title: `${profile.handle} on Rankd`,
    description: profile.bio ?? `${profile.filmCount} films, ranked against each other.`,
    // The pretty address is the real one. Without this, `/u/handle` is what
    // gets shared and indexed, and the rewrite becomes a detail people see.
    alternates: { canonical: `/@${profile.handle}` },
    // Belt and braces with app/robots.ts. That file asks crawlers not to come;
    // this says so on the page itself, for anything that ignores it.
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: Props) {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);

  // One not-found for every reason: no such handle, private, suspended, gone.
  // `getPublicProfile` has the argument for why they must be indistinguishable.
  if (!profile) notFound();

  return <PublicProfileView profile={profile} />;
}
