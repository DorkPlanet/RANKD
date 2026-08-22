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

import { bannerImages, getProfileView } from "@/lib/social/publicProfile";
import { PublicProfileView } from "@/components/PublicProfileView";
import { PrivateProfileView } from "@/components/PrivateProfileView";

// Always fresh. A profile changes whenever its owner ranks anything, and a
// cached copy of somebody's top ten is worse than a slightly slower page.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const view = await getProfileView(handle);
  if (!view) return { title: "Not found" };

  // A private profile gets a title and its own bio, and NOTHING derived from a
  // library. The description falls back to a plain sentence rather than a count,
  // because a count is exactly the thing being withheld.
  const identity = view.kind === "public" ? view.profile : view.identity;
  const description =
    identity.bio ??
    (view.kind === "public"
      ? `${view.profile.filmCount} films, ranked against each other.`
      : "This profile is private.");

  return {
    title: `${identity.handle} on Rankd`,
    description,
    // The pretty address is the real one. Without this, `/u/handle` is what
    // gets shared and indexed, and the rewrite becomes a detail people see.
    alternates: { canonical: `/@${identity.handle}` },
    // Belt and braces with app/robots.ts. That file asks crawlers not to come;
    // this says so on the page itself, for anything that ignores it.
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: Props) {
  const { handle } = await params;
  const view = await getProfileView(handle);

  // `null` now means only: no such handle, suspended, or deleted. A private
  // account renders its own view rather than a 404, so that search and the
  // profile agree with each other. See the header of publicProfile.ts for the
  // trade that was made deliberately.
  if (!view) notFound();

  if (view.kind === "private") return <PrivateProfileView identity={view.identity} />;

  // Resolved here rather than inside the view, so the view stays a pure render
  // of what it is handed and the two TMDb calls sit on the server where they can
  // be cached for a day.
  const banner = await bannerImages(view.profile.summary);
  return <PublicProfileView profile={view.profile} banner={banner} />;
}
