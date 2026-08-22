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

// ── The cut ────────────────────────────────────────────────────────────────
//
// A shallow diagonal rather than a corner-to-corner one. At true 45 degrees on a
// wide box the split runs off the top edge almost immediately, so the second
// image is a thin wedge in one corner and the first is nearly everything. These
// meet at the vertical midpoint of each side, which gives both films real estate
// and reads as a deliberate cut rather than a crop that went wrong.
const LEFT = "polygon(0 0, 62% 0, 38% 100%, 0 100%)";
const RIGHT = "polygon(62% 0, 100% 0, 100% 100%, 38% 100%)";

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
    // NOT `overflow-hidden` on this element. The avatar below deliberately hangs
    // past the lower edge, and clipping here would cut the bottom off it.
    <div className="relative w-full" style={{ aspectRatio: "5 / 2" }}>
      {/* The clipping belongs to the images, which is what actually needs it:
          `object-cover` on a clip-path can otherwise bleed a pixel at the seam. */}
      <div className="absolute inset-0 overflow-hidden">
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
          {/* ── The seam is a HIGHLIGHT, not a gap ─────────────────────────
              It was a hairline of the page colour, which on this palette is
              near-black: on a real profile it read as a crack down the middle
              rather than as a cut. A faint warm line reads as an edge where two
              things meet, which is what it is. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(102deg, transparent calc(50% - 0.5px), color-mix(in srgb, var(--gold) 45%, transparent) calc(50% - 0.5px), color-mix(in srgb, var(--gold) 45%, transparent) calc(50% + 0.5px), transparent calc(50% + 0.5px))",
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

      {/* ── Two layers, and both are doing a job ─────────────────────────────
          The wash sits under everything and takes the frames down to something
          type can live on. Without it a bright still fights the status bar at the
          top and the handle underneath.

          Then `.banner-fade`, which is the class the owner's own banner already
          uses, so the two screens agree about how an image meets the page
          without anybody choosing a gradient twice. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--bg) 42%, transparent)" }}
      />
      <div className="banner-fade absolute inset-0" />
      </div>

      {/* A quarter into the lower edge, never half. `ProfileScreen`'s header
          argues at length that a circle straddling a cover is every social
          network's signature and is also what made the circle look clipped. A
          quarter reads as tucked under the edge rather than pinned to it. */}
      <div className="absolute inset-x-0 -bottom-6 flex justify-center">
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
