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
}: {
  axes: TasteAxis[];
  /** Your shape when this sitting began. Absent on a first sitting. */
  was?: TasteShape;
  /** Rankd's order over the same films. Absent until the beliefs have loaded. */
  rankd?: TasteShape;
}) {
  const n = axes.length;
  // Three axes is the fewest that encloses an area. Two would draw a line and
  // call it a shape, which is worse than saying nothing.
  if (n < 3) return null;

  const now = axes.map((a) => a.standing);
  // Rankd's answer, drawn only where it has one for every axis, so the polygon
  // can never close across a gap and imply a value it does not hold.
  const theirs = rankd && axes.every((a) => rankd[a.genre] !== undefined) ? axes.map((a) => rankd[a.genre]) : null;
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

      {/* Rankd's shape UNDER yours, and as an outline only. Two filled polygons
          would mix into a third colour where they overlap, which is most of the
          chart. Blue because `--accent` is the structural colour here and gold
          is the hero one: yours is the answer, this is the second opinion. */}
      {theirs && (
        <polygon
          points={polygon(theirs)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}

      <polygon
        points={polygon(now)}
        fill="var(--gold)"
        fillOpacity="0.17"
        stroke="var(--gold)"
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
