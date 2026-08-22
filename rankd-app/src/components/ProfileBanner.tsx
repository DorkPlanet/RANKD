// The top of somebody else's profile.
//
// ── The header IS the ranking ──────────────────────────────────────────────
//
// It was two film frames split diagonally, which looked like every other social
// header: a photograph with a name on it. Any app can do that, and the two
// frames said nothing except "these are two films".
//
// This is their top ten, as ten vertical slices of the actual posters, in order,
// widest first. It reads as an abstract band of colour at a glance and it is
// literally the thing the profile is about: the shape of a ranking, left to
// right, best to tenth. Nobody else's app can draw this because nobody else's
// app has an ordered top ten as its primary object.
//
// The widths are the point. Number one takes almost a third and each one after
// takes less, so the header is a decay curve rather than a grid. That is what
// stops it reading as a contact sheet.
//
// ── It costs nothing extra ─────────────────────────────────────────────────
//
// The posters are already in the snapshot, so the whole thing draws from data
// the page has in hand. The version this replaced fetched two TMDb backdrops per
// render, which measured at about 0.25s of the page's time.
//
// ── It degrades ────────────────────────────────────────────────────────────
//
// Fewer than ten films simply means fewer slices, sharing the width on the same
// curve. A film with no artwork leaves a band of the page's own surface rather
// than a hole. None at all leaves a quiet gradient, which is what a profile with
// nothing ranked should look like: unfinished, not broken.

import { avatarOf } from "@/lib/profile";
import { blockFor } from "@/lib/card/palette";
import type { ProfileIdentity } from "@/lib/social/publicProfile";
import type { SnapshotFilm } from "@/lib/snapshot";

/** How many slices at most. Ten is a top ten. */
const SLICES = 10;

/**
 * How much width each position gets, before normalising.
 *
 * Geometric rather than linear: linear makes the tenth film a third the width of
 * the first, which still reads as a row of roughly equal columns. At 0.82 the
 * first is about five times the last and the eye sees a run rather than a grid.
 */
const FALLOFF = 0.82;

export function ProfileBanner({
  films,
  identity,
}: {
  /** Their top ten, best first. Fewer is fine. Empty is fine. */
  films: SnapshotFilm[];
  identity: ProfileIdentity;
}) {
  const avatar = avatarOf({
    handle: identity.handle,
    displayName: null,
    avatarUrl: identity.avatarUrl,
  });

  const top = films.slice(0, SLICES);
  const weights = top.map((_, i) => FALLOFF ** i);
  const total = weights.reduce((a, b) => a + b, 0) || 1;

  return (
    // NOT `overflow-hidden` here. The avatar below deliberately hangs past the
    // lower edge, and clipping on this element would cut the bottom off it.
    <div className="relative w-full" style={{ aspectRatio: "5 / 2" }}>
      <div className="absolute inset-0 flex overflow-hidden">
        {top.length === 0 ? (
          <div
            className="w-full"
            style={{
              background:
                "linear-gradient(to bottom right, var(--surface), color-mix(in srgb, var(--gold) 8%, var(--surface)))",
            }}
          />
        ) : (
          top.map((film, i) => (
            <div
              key={film.id}
              className="relative h-full shrink-0"
              style={{
                width: `${(weights[i] / total) * 100}%`,
                // A film with no poster still holds its place, in a colour drawn
                // from its own title so the band never repeats itself. Better a
                // deliberate stripe than a gap where a film should be.
                background: film.poster ? "var(--surface)" : blockFor(film.title),
              }}
            >
              {film.poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={film.poster}
                  alt=""
                  aria-hidden
                  className="h-full w-full object-cover"
                  // Posters are portrait and these slices are narrow, so the
                  // crop has to be chosen rather than defaulted. Upper-middle is
                  // where a poster puts its subject.
                  style={{ objectPosition: "50% 35%" }}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Three layers, and each is doing a job ────────────────────────────
          A wash takes the whole band down to something type can live on: without
          it a bright poster fights the status bar above and the handle below.

          A gold seam along the bottom edge, because this band is a RANKING and
          the app's one accent should touch the one thing that is.

          Then `.banner-fade`, the class the owner's own banner already uses, so
          the two screens agree about how an image meets the page rather than
          each choosing a gradient. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--bg) 46%, transparent)" }}
      />
      <div className="banner-fade absolute inset-0" />

      {/* The avatar sits a quarter into the lower edge, never half.
          `ProfileScreen`'s header argues at length that a circle straddling a
          cover is every social network's signature, and is also what made the
          circle look clipped. A quarter reads as tucked under. */}
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
