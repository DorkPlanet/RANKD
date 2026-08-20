"use client";

// What the library is made of.
//
// A ring rather than a pie, because the hole is useful: the total sits in it and
// the chart stops being a shape you have to decode before it says anything.
//
// ── Nothing is hidden, and that forced the layout ──────────────────────────
//
// The first version drew five slices and folded the rest into a grey "13 more".
// The objection was immediate and right: the thirteen ARE the interesting part,
// and a chart answering "what is my library made of" by declining to name most
// of it has not answered.
//
// But nineteen genres do not read as nineteen slices, and they do not read as a
// nineteen-row legend under a ring either — that is a wall of swatches. So there
// are two panes, one swipe apart: the ring is the glance, the ranked list is the
// detail, and everything appears in both.
//
// ── This is NOT the shelf pattern the profile is being cured of ────────────
//
// A shelf is an unknown number of items scrolling off into the dark, and there
// were four of them stacked. This is exactly two pages that say so, which is
// what earns it snapping and dots.
//
// Scroll-snap rather than a gesture handler: the browser already knows how to do
// this, and it keeps working with a trackpad, a keyboard and a screen reader,
// none of which a hand-rolled swipe would.

import { useState } from "react";

import { genresIn } from "@/lib/genres";
import { axisLabel } from "@/lib/taste";
import type { Film } from "@/lib/types";

// Enough hues that the big slices each have an identity, then repeated. The
// smallest are hairlines where an exact hue cannot be read anyway, and the list
// pane is what actually identifies them.
const HUES = ["#e7b53e", "#4c93ff", "#7CC4A6", "#C9739B", "#8E7BD0", "#E08A5B", "#6FB2C9", "#B8894F"];

const R = 44;
const STROKE = 18;
const CIRC = 2 * Math.PI * R;

export function GenreRing({ films }: { films: Film[] }) {
  const [pane, setPane] = useState(0);

  const tally = genresIn(films);
  // Two is not a breakdown, it is a pair of facts, and the lines above the chart
  // already name the commonest genre.
  if (tally.length < 3) return null;

  const total = tally.reduce((n, g) => n + g.count, 0);
  const lengths = tally.map((g) => (g.count / total) * CIRC);
  // Each slice starts where the ones before it end. Summed per slice rather than
  // carried in a running variable, because reassigning one during render is a
  // lint error here and a real hazard under concurrent rendering. Nineteen
  // genres is the ceiling, so the quadratic cost is nothing.
  const slices = tally.map((g, i) => ({
    ...g,
    len: lengths[i],
    offset: lengths.slice(0, i).reduce((n, l) => n + l, 0),
    colour: HUES[i % HUES.length],
  }));

  return (
    <div>
      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          setPane(el.scrollLeft > el.clientWidth / 2 ? 1 : 0);
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
      >
        {/* Pane one — the shape */}
        <div className="w-full flex-shrink-0 snap-center">
          <svg
            viewBox="0 0 120 120"
            className="mx-auto block w-[58%]"
            role="img"
            aria-label={`Your library by genre. ${tally.map((g) => `${g.name} ${g.count}`).join(", ")}.`}
          >
            <g transform="translate(60,60) rotate(-90)" fill="none" strokeWidth={STROKE}>
              {slices.map((s) => (
                <circle
                  key={s.name}
                  r={R}
                  stroke={s.colour}
                  // The dash IS the slice; the rest of the circumference is the
                  // gap. A literal gap would let the backdrop show through.
                  strokeDasharray={`${s.len} ${CIRC - s.len}`}
                  strokeDashoffset={-s.offset}
                />
              ))}
            </g>
            <text x="60" y="58" textAnchor="middle" fill="var(--text-hi)" fontSize="19" fontWeight="700">
              {films.length.toLocaleString()}
            </text>
            <text x="60" y="71" textAnchor="middle" fill="var(--dim)" fontSize="7" letterSpacing="1.4">
              FILMS
            </text>
          </svg>
          <p className="mt-2 text-center text-[10px] text-dim">
            {slices.length} genres. Swipe for all of them.
          </p>
        </div>

        {/* Pane two — every one of them, largest first, with the bar doing the
            comparing. Same order as the ring, so the eye can move between. */}
        <div className="w-full flex-shrink-0 snap-center">
          <div className="space-y-[3px]">
            {slices.map((s) => (
              <div key={s.name} className="flex items-center gap-2.5 text-[10.5px]">
                <span className="w-[70px] flex-shrink-0 truncate text-dim">{axisLabel(s.name)}</span>
                <span className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-border">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(s.count / slices[0].count) * 100}%`, background: s.colour }}
                  />
                </span>
                <span className="w-[30px] flex-shrink-0 text-right tabular-nums text-text-hi">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two dots, because a pane giving no sign it has a neighbour is a pane
          nobody swipes. */}
      <div className="mt-3 flex justify-center gap-1.5">
        {[0, 1].map((i) => (
          <span
            key={i}
            className="h-[5px] w-[5px] rounded-full transition-colors"
            style={{ background: pane === i ? "var(--gold)" : "var(--border)" }}
          />
        ))}
      </div>
    </div>
  );
}
