"use client";

// The shape of your taste, and how it moved this sitting.
//
// A graphic here rather than a number, which is the bar the old "this app speaks
// in TYPE" rule set and the reason the two tier maps failed it. Progress IS a
// number: `77/134` says everything a bar could. A shape is not — eight genres
// each sitting somewhere in your order is a relationship between eight figures,
// and reading it as eight figures is exactly what nobody does.
//
// What it plots is in `taste.ts`: mean POSITION per genre, never win rate and
// never library share. The comment there is the one to read before changing
// anything about this.

import { axisLabel, MOVED, type TasteAxis, type TasteShape } from "@/lib/taste";

// Wider than it is tall, because the labels that overflow are always the ones on
// the left and right arms. "Science Fiction" ran off the right edge the first
// time this shipped; `axisLabel` shortens the worst offenders and this carries
// the rest.
const R = 62;
const CX = 150;
const CY = 112;
const LABEL_R = 80;

/** Where an axis sits on the dial. First one straight up, then clockwise. */
const angleAt = (i: number, n: number): number => (-90 + (i * 360) / n) * (Math.PI / 180);

const pointAt = (i: number, n: number, radius: number): [number, number] => {
  const a = angleAt(i, n);
  return [CX + Math.cos(a) * radius, CY + Math.sin(a) * radius];
};

const polygon = (values: number[]): string =>
  values.map((v, i) => pointAt(i, values.length, R * Math.max(0, Math.min(1, v))).join(",")).join(" ");

const ring = (fraction: number, n: number): string =>
  Array.from({ length: n }, (_, i) => pointAt(i, n, R * fraction).join(",")).join(" ");

export function TasteChart({
  axes,
  was,
  rankd,
  locked,
}: {
  axes: TasteAxis[];
  /** Your shape when this sitting began. Absent on a first sitting. */
  was?: TasteShape;
  /**
   * The films Rankd placed for you, in blue.
   *
   * This used to be "Rankd's ORDER over the same films", which was the same
   * order — a soft lock's score is written in belief order, so the two shapes
   * came out identical and the chart drew one line twice. It is a different
   * POPULATION now: everything with a position you did not lock.
   */
  rankd?: TasteShape;
  /**
   * The films you LOCKED, in gold, when there are enough of them to mean
   * anything. Absent below `MIN_FOR_LOCKED`, and then the gold line falls back
   * to the whole placed list — which is `axes` and what it always drew.
   */
  locked?: TasteShape;
}) {
  const n = axes.length;
  // Three axes is the fewest that encloses an area. Two would draw a line and
  // call it a shape, which is worse than saying nothing.
  if (n < 3) return null;

  // ── One line, or two, and the colour follows the population ───────────────
  //
  // Gold means "you settled this" everywhere in the app, so it may only ever be
  // drawn over films you actually locked. Below `MIN_FOR_LOCKED` there is no
  // locked shape, and what used to happen then was that gold fell back to your
  // whole placed list — which with 82 shuffled films and one lock drew a gold
  // web labelled YOUR LIST over data that was 82/83 Rankd's. Reported exactly
  // that way, and it made no sense because it was not true.
  //
  // So the single line below the threshold is the SHUFFLED shape itself, in
  // blue, named for what it is. No fallback to the placed list at all: that
  // fallback was the whole bug, and it was drawing a third population that had
  // no name and no colour of its own.
  //
  // Each is drawn only where it has a value for every axis, so no polygon can
  // close across a gap and imply a number it does not hold.
  const mine = locked && axes.every((a) => locked[a.genre] !== undefined) ? axes.map((a) => locked[a.genre]) : null;
  const shuffled = rankd && axes.every((a) => rankd[a.genre] !== undefined) ? axes.map((a) => rankd[a.genre]) : null;

  // The filled hero line. Yours when you have earned one, Rankd's otherwise.
  const now = mine ?? shuffled ?? axes.map((a) => a.standing);
  const soleTone = mine ? "var(--gold)" : "var(--accent)";
  // The second opinion exists only when the hero is yours. Without a gold line
  // to compare it WITH, blue would be drawn twice in the same place.
  const theirs = mine ? shuffled : null;
  // Only draw the earlier shape where every axis existed then too, and only if
  // something actually moved. A dashed outline sitting exactly under the filled
  // one reads as a rendering fault rather than as "nothing changed".
  const before = was && axes.every((a) => was[a.genre] !== undefined) ? axes.map((a) => was[a.genre]) : null;
  const shifted = before?.some((v, i) => Math.abs(v - now[i]) >= MOVED) ?? false;

  return (
    <svg
      viewBox="0 0 300 236"
      className="w-full"
      role="img"
      aria-label={`Your taste by genre. ${axes
        .map((a) => `${a.genre} ${Math.round(a.standing * 100)} percent`)
        .join(", ")}.`}
    >
      <g fill="none" stroke="var(--border)" strokeWidth="1">
        {[1, 0.66, 0.33].map((f) => (
          <polygon key={f} points={ring(f, n)} />
        ))}
        {axes.map((a, i) => {
          const [x, y] = pointAt(i, n, R);
          return <line key={a.genre} x1={CX} y1={CY} x2={x} y2={y} />;
        })}
      </g>

      {/* ── Fill first, then EVERY outline on top of it. ──────────────────────
          Rankd's line was drawn before the gold polygon and the gold polygon
          carries a fill, so wherever Rankd's shape sat inside yours — which is
          most of the chart — the fill painted over it and the blue vanished.
          Reported as "I see the yellow but not the blue".
          A fill can only ever hide a line. Lines last, always. */}
      <polygon points={polygon(now)} fill={soleTone} fillOpacity="0.15" stroke="none" />

      {before && shifted && (
        <polygon
          points={polygon(before)}
          fill="none"
          stroke="var(--dim)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeLinejoin="round"
        />
      )}

      {/* Outline only, never a second fill: two translucent fills mix into a
          third colour across the overlap, which is most of the chart. Blue
          because `--accent` is the structural colour and gold is the hero one.
          Yours is the answer; this is the second opinion. */}
      {theirs && (
        <polygon
          points={polygon(theirs)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      )}

      <polygon
        points={polygon(now)}
        fill="none"
        stroke={soleTone}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />

      <g fontSize="9" fill="var(--dim)" letterSpacing="0.05em">
        {axes.map((a, i) => {
          const [x, y] = pointAt(i, n, LABEL_R);
          const dx = x - CX;
          const anchor = dx > 3 ? "start" : dx < -3 ? "end" : "middle";
          // Nudge the top and bottom labels off the shape's own points.
          const dy = y < CY - R * 0.8 ? -2 : y > CY + R * 0.8 ? 8 : 3;
          return (
            <text key={a.genre} x={x} y={y + dy} textAnchor={anchor}>
              {axisLabel(a.genre).toUpperCase()}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
