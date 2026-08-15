"use client";

// A poster, or the absence of one said properly.
//
// ── Why a placeholder rather than nothing ──────────────────────────────────
//
// Not every film has artwork and some never will: a niche title TMDb does not
// hold returns no poster, and since `bestMatch` now refuses a bad match rather
// than accepting the nearest popular stranger, that will happen slightly MORE
// often than it used to. That trade is right — a blank says "not found" and the
// wrong artwork says "found it" — but it only pays if the blank is deliberate.
//
// What was there before was not. `<img>` with no `src` draws the browser's
// broken-image glyph, and the one place that guarded against it drew an empty
// grey rectangle. Both read as a loading failure, on a screen where you are
// being asked to judge the thing that failed to load.
//
// So the gap gets the mark and the title. It is the one moment the wordmark
// appears anywhere except the header and the splash, which is the point: it
// reads as the app standing in for a picture it does not have, rather than as
// something having gone wrong.

import type { Film } from "@/lib/types";

export function PosterArt({ film, className, style }: {
  film: Film;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (film.poster) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={film.poster}
        alt={film.title}
        className={className ?? "h-full w-full object-cover"}
        style={style}
        draggable={false}
        // The URL can also simply fail — a TMDb path that has since moved, a
        // phone that lost the network between the fetch and the render. Hiding
        // the broken element leaves the fallback beneath it showing through,
        // rather than the browser's own glyph.
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
      />
    );
  }

  return (
    <span
      className={`flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center ${className ?? ""}`}
      style={{
        // A shallow gradient rather than a flat fill, so it reads as a surface
        // rather than as a hole in the layout at the size these get drawn.
        background: "linear-gradient(160deg, var(--surface), color-mix(in srgb, var(--surface) 55%, var(--bg)))",
        ...style,
      }}
    >
      <span
        className="font-display leading-none tracking-[0.14em]"
        style={{ fontSize: "clamp(11px, 13cqw, 22px)", color: "color-mix(in srgb, var(--gold) 55%, transparent)" }}
      >
        RNKD
      </span>
      <span
        className="line-clamp-3 font-serif italic leading-snug text-dim"
        style={{ fontSize: "clamp(8px, 7cqw, 12px)" }}
      >
        {film.title}
      </span>
      <span className="text-[7px] font-extrabold uppercase tracking-[0.18em] text-dim opacity-60">
        No artwork
      </span>
    </span>
  );
}
