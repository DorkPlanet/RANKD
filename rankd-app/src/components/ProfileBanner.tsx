// The top of somebody else's profile.
//
// ── Two frames, split corner to corner ─────────────────────────────────────
//
// The public profile started with a small avatar on a flat background, which is
// the thinnest a page can be. The owner's own profile has a banner and it is the
// best thing on that screen, so a visitor should get one too.
//
// It is their top TWO films rather than one, because a profile is a claim about
// taste and one film is an anecdote. Split diagonally rather than side by side:
// a vertical seam reads as two panels, a diagonal reads as one image made of two
// things, which is what a taste is.
//
// ── Scenes, not posters, where a scene exists ──────────────────────────────
//
// A poster is the library's currency and there are ten of them a few hundred
// pixels below. A frame from inside the film is the thing the profile can show
// that the list cannot. `backdropsFor` in lib/tmdb.ts sorts textless images
// first, which matters more here than anywhere: a frame with the film's own
// title baked across it would sit directly under somebody's name and fight it.
//
// ── It degrades, and it never shows a hole ─────────────────────────────────
//
// Two frames, then one frame full width, then two posters, then one poster, then
// nothing at all. A library with a single placed film is a real state, and so is
// a film TMDb has no art for. A grey box would be worse than no banner.

import { avatarOf } from "@/lib/profile";
import type { ProfileIdentity } from "@/lib/social/publicProfile";

/** Where the diagonal cuts. Top-left triangle, then bottom-right. */
const LEFT = "polygon(0 0, 100% 0, 0 100%)";
const RIGHT = "polygon(100% 0, 100% 100%, 0 100%)";

export function ProfileBanner({
  images,
  identity,
}: {
  /** Zero, one or two. Frames if they were available, posters otherwise. */
  images: string[];
  identity: ProfileIdentity;
}) {
  const avatar = avatarOf({
    handle: identity.handle,
    displayName: null,
    avatarUrl: identity.avatarUrl,
  });

  // Deliberately still rendered with no images: the avatar has to sit at the
  // bottom of this block either way, and a profile with nothing placed yet
  // should look like a quiet version of a full one rather than a broken one.
  return (
    <div className="relative w-full" style={{ aspectRatio: "16 / 7" }}>
      {images.length >= 2 ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[0]}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            style={{ clipPath: LEFT }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[1]}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            style={{ clipPath: RIGHT }}
          />
          {/* The seam. A hairline of the page colour, so the two frames read as
              deliberately cut rather than as one image failing to load. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom left, transparent calc(50% - 1px), var(--bg) calc(50% - 1px), var(--bg) calc(50% + 1px), transparent calc(50% + 1px))",
            }}
          />
        </>
      ) : images.length === 1 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={images[0]}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "var(--surface)" }} />
      )}

      {/* The same class the owner's banner uses, so the two screens agree about
          how an image meets the page without anybody choosing a gradient twice.
          It is what makes this read as part of the page rather than a photograph
          stuck on top of one. */}
      <div className="banner-fade absolute inset-0" />

      {/* The avatar sits a quarter into the banner's lower edge. Not straddling
          it: `ProfileScreen`'s header argues at length that a circle half in and
          half out is every social network's signature and also what makes the
          circle look clipped. A quarter reads as tucked under. */}
      <div className="absolute inset-x-0 -bottom-7 flex justify-center">
        {avatar.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar.url}
            alt=""
            className="h-20 w-20 rounded-full object-cover"
            style={{ border: "3px solid var(--bg)" }}
          />
        ) : (
          <span
            className="flex h-20 w-20 items-center justify-center rounded-full font-display text-3xl text-gold"
            style={{ background: "var(--surface)", border: "3px solid var(--bg)" }}
          >
            {avatar.letter}
          </span>
        )}
      </div>
    </div>
  );
}
