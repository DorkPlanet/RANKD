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
// are two panes, one swipe apart: the ring with its five biggest named, and the
// full ranked list. Everything appears in one or the other.
//
// ── This is NOT the shelf pattern the profile is being cured of ────────────
//
// A shelf is an unknown number of items scrolling off into the dark, and there
// were four of them stacked. This is exactly two pages that say so, which is
// what earns it snapping and dots.

import { useState } from "react";

import { genresIn } from "@/lib/genres";
import { axisLabel } from "@/lib/taste";
import type { Film } from "@/lib/types";

// Enough hues that the big slices each have an identity, then repeated. The
// smallest are hairlines where an exact hue cannot be read anyway, and the list
// pane is what actually identifies them.
const HUES = ["#e7b53e", "#4c93ff", "#7CC4A6", "#C9739B", "#8E7BD0", "#E08A5B", "#6FB2C9", "#B8894F"];

const R_OUT = 53;
const R_IN = 35;
const MID = 60;

/**
 * One donut segment, as an explicit path.
 *
 * ── Why not a dashed circle ────────────────────────────────────────────────
 *
 * The first version drew each slice as a circle with a dash array — one visible
 * dash and the rest gap, which is the usual trick for this. It broke here.
 *
 * With nineteen genres the smallest dashes are shorter than the stroke is wide,
 * and a dash that short does not render as a short segment of the band: it
 * renders as a wedge spilling out of it. Reported as a visual bug, and clearly
 * visible as coloured triangles pointing into the middle of the ring.
 *
 * An arc has no dash pattern to go wrong. Out along the outer edge, in, back
 * along the inner edge, close.
 */
function slicePath(fromTurn: number, toTurn: number): string {
  // Start at the top and run clockwise, which is where a reader expects a chart
  // to begin. Clamped a hair under a full turn so a single dominant genre can
  // never ask for a 360-degree arc — that draws nothing at all, because both
  // ends land on the same point.
  const a0 = (fromTurn * 360 - 90) * (Math.PI / 180);
  const a1 = (Math.min(toTurn, 0.9999) * 360 - 90) * (Math.PI / 180);
  const big = toTurn - fromTurn > 0.5 ? 1 : 0;
  const at = (r: number, a: number) =>
    `${(MID + Math.cos(a) * r).toFixed(2)},${(MID + Math.sin(a) * r).toFixed(2)}`;
  return [
    `M${at(R_OUT, a0)}`,
    `A${R_OUT},${R_OUT} 0 ${big} 1 ${at(R_OUT, a1)}`,
    `L${at(R_IN, a1)}`,
    `A${R_IN},${R_IN} 0 ${big} 0 ${at(R_IN, a0)}`,
    "Z",
  ].join(" ");
}

export function GenreRing({ films }: { films: Film[] }) {
  const [pane, setPane] = useState(0);

  const tally = genresIn(films);
  // Two is not a breakdown, it is a pair of facts, and the lines above the chart
  // already name the commonest genre.
  if (tally.length < 3) return null;

  const total = tally.reduce((n, g) => n + g.count, 0);
  // Cumulative start per slice, summed rather than carried in a running
  // variable: reassigning one during render is a lint error here and a real
  // hazard under concurrent rendering. Nineteen genres is the ceiling.
  const slices = tally.map((g, i) => {
    const before = tally.slice(0, i).reduce((n, x) => n + x.count, 0);
    return {
      ...g,
      from: before / total,
      to: (before + g.count) / total,
      colour: HUES[i % HUES.length],
    };
  });

  return (
    <div>
      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          setPane(el.scrollLeft > el.clientWidth / 2 ? 1 : 0);
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
      >
        {/* Pane one — the shape.
            A horizontal scroller is as tall as its tallest child, and the list
            pane is taller than the ring. Left to itself the ring sat at the top
            with a block of dead space under it, which read as a fault. Centring
            turns that into even breathing room, with no height measuring and no
            state to keep in sync. */}
        <div className="flex w-full flex-shrink-0 snap-center flex-col justify-center">
          <svg
            viewBox="0 0 120 120"
            className="mx-auto block w-[58%]"
            role="img"
            aria-label={`Your library by genre. ${tally.map((g) => `${g.name} ${g.count}`).join(", ")}.`}
          >
            {slices.map((s) => (
              <path key={s.name} d={slicePath(s.from, s.to)} fill={s.colour} />
            ))}
            <text x={MID} y="58" textAnchor="middle" fill="var(--text-hi)" fontSize="19" fontWeight="700">
              {films.length.toLocaleString()}
            </text>
            <text x={MID} y="71" textAnchor="middle" fill="var(--dim)" fontSize="7" letterSpacing="1.4">
              FILMS
            </text>
          </svg>

          {/* The five biggest, named, under the ring. A ring on its own is a
              shape with no words on it. The "N more" row is honest here in a way
              it was not when this was the only view: the rest are one swipe away
              and the line underneath says so. */}
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {slices.slice(0, 5).map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-[10px]">
                <span className="h-2 w-2 flex-shrink-0 rounded-[2px]" style={{ background: s.colour }} />
                <span className="min-w-0 truncate text-dim">{axisLabel(s.name)}</span>
                <span className="ml-auto flex-shrink-0 tabular-nums text-text">{s.count}</span>
              </div>
            ))}
            {slices.length > 5 && (
              <div className="flex items-center gap-2 text-[10px]">
                <span className="h-2 w-2 flex-shrink-0 rounded-[2px] bg-border" />
                <span className="min-w-0 truncate text-dim">{slices.length - 5} more</span>
                <span className="ml-auto flex-shrink-0 tabular-nums text-text">
                  {slices.slice(5).reduce((n, s) => n + s.count, 0)}
                </span>
              </div>
            )}
          </div>
          <p className="mt-2.5 text-center text-[10px] text-dim">Swipe for all {slices.length}.</p>
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
