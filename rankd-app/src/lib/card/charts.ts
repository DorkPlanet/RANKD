"use client";

// The three charts a card may draw, as canvas primitives.
//
// ── What these are and are not ─────────────────────────────────────────────
//
// Pure `(ctx, spec) => void`. No data shaping, no clamping of the caller's
// numbers into something plottable, no deciding whether a chart is worth
// drawing. That last one matters: `chartsFor` in `data.ts` already refuses to
// hand over a two-axis radar or a one-bar bar chart, so nothing here has to
// guess whether it has been given something meaningless. It draws what it is
// given.
//
// They take colours rather than reading the palette, because a chart on the
// dossier card sits on the app's navy and the same primitive on the business
// card sits on bone — and a primitive that knew about `--bg` could only ever
// serve one of them.
//
// ── Why a canvas radar rather than reusing the profile's ───────────────────
//
// The profile's `TasteChart` is SVG in the DOM. A card is a bitmap that has to
// survive being encoded to JPEG and posted somewhere, so it cannot use it. What
// the two DO share is `lib/radar.ts` — where the points sit, which direction the
// dial runs, how a 0..1 standing becomes a radius. Draw them differently, place
// them identically, or the same taste is two shapes.

import { polygonPoints, ringPoints } from "../radar";
import { ellipsis } from "./canvas";

export interface RadarSpec {
  cx: number;
  cy: number;
  r: number;
  /** 0..1 per axis, in order. Three or more; fewer is a line, not a shape. */
  values: readonly number[];
  labels: readonly string[];
  /** The web behind the shape. */
  grid: string;
  /** The shape's outline; it is filled with the same colour at low alpha. */
  tone: string;
  label: string;
  labelFont: string;
}

/** The shape of a taste, on a three-ring web. */
export function radar(ctx: CanvasRenderingContext2D, s: RadarSpec): void {
  const n = s.values.length;
  if (n < 3) return;

  const trace = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };

  // The web: three rings and a spoke per axis. Thin, because it is the paper the
  // shape is drawn on and not part of the shape.
  ctx.strokeStyle = s.grid;
  ctx.lineWidth = 1;
  for (const f of [1, 0.66, 0.33]) {
    trace(ringPoints(f, n, s.r, s.cx, s.cy));
    ctx.stroke();
  }
  ringPoints(1, n, s.r, s.cx, s.cy).forEach(([x, y]) => {
    ctx.beginPath();
    ctx.moveTo(s.cx, s.cy);
    ctx.lineTo(x, y);
    ctx.stroke();
  });

  // Fill first, outline second — always, and for the same reason the profile's
  // chart says so: a fill can only ever hide a line.
  const shape = polygonPoints(s.values, s.r, s.cx, s.cy);
  trace(shape);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = s.tone;
  ctx.fill();
  ctx.globalAlpha = 1;

  trace(shape);
  ctx.strokeStyle = s.tone;
  ctx.lineWidth = 1.75;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineJoin = "miter";

  // Labels sit outside the outer ring and are anchored by which side of the dial
  // they fall on, so a long genre on the right arm grows outward rather than
  // back across the chart.
  ctx.font = s.labelFont;
  ctx.fillStyle = s.label;
  ringPoints(1, n, s.r + 14, s.cx, s.cy).forEach(([x, y], i) => {
    const dx = x - s.cx;
    ctx.textAlign = dx > 3 ? "left" : dx < -3 ? "right" : "center";
    const dy = y < s.cy - s.r * 0.8 ? -2 : y > s.cy + s.r * 0.8 ? 8 : 3;
    ctx.fillText(s.labels[i] ?? "", x, y + dy);
  });
  ctx.textAlign = "left";
}

export interface BarsSpec {
  x: number;
  y: number;
  w: number;
  rows: readonly { label: string; count: number }[];
  /** Height of one row including its gap. */
  rowH: number;
  /** The filled part of a bar. */
  tone: string;
  /** The unfilled remainder, so a short bar still shows its full span. */
  track: string;
  label: string;
  value: string;
  labelFont: string;
}

/**
 * A horizontal bar per row, scaled to the largest.
 *
 * Scaled to the biggest row rather than to the total: the question a reader asks
 * of this chart is "which is the most, and by how much" — a share-of-total
 * scaling answers a different question and leaves the top bar at 30% of the
 * width, which looks like a bug.
 */
export function bars(ctx: CanvasRenderingContext2D, s: BarsSpec): void {
  const max = Math.max(...s.rows.map((r) => r.count), 1);
  const labelW = Math.round(s.w * 0.42);
  const barX = s.x + labelW + 8;
  const barW = s.x + s.w - barX;
  const h = 5;

  ctx.font = s.labelFont;
  s.rows.forEach((row, i) => {
    const y = s.y + i * s.rowH;

    ctx.fillStyle = s.label;
    ctx.fillText(ellipsis(ctx, row.label.toUpperCase(), labelW), s.x, y + h);

    ctx.fillStyle = s.track;
    ctx.beginPath();
    ctx.roundRect(barX, y, barW, h, h / 2);
    ctx.fill();

    ctx.fillStyle = s.tone;
    ctx.beginPath();
    // A floor of `h` so the smallest bar is a dot rather than nothing: a row
    // with a visible label and no visible bar reads as missing data.
    ctx.roundRect(barX, y, Math.max(h, (row.count / max) * barW), h, h / 2);
    ctx.fill();

    ctx.fillStyle = s.value;
    ctx.textAlign = "right";
    ctx.fillText(String(row.count), s.x + s.w, y + h);
    ctx.textAlign = "left";
  });
}

export interface DonutSpec {
  cx: number;
  cy: number;
  r: number;
  /** Ring thickness. The hole is what stops it being a pie. */
  thickness: number;
  slices: readonly { label: string; count: number }[];
  /** One per slice, cycled if there are fewer than slices. */
  tones: readonly string[];
  /** Drawn in the hole. Two lines: a figure and a caption. */
  centre?: { value: string; label: string; valueFont: string; labelFont: string };
  centreTone: string;
  centreLabel: string;
}

/**
 * Share of a whole, as a ring.
 *
 * A ring rather than a pie because the hole is useful: it holds the total, which
 * is the number a reader wants first and which a pie has nowhere to put. Slices
 * run clockwise from twelve o'clock, matching the radar's direction — two charts
 * side by side that wind opposite ways read as an accident.
 */
export function donut(ctx: CanvasRenderingContext2D, s: DonutSpec): void {
  const total = s.slices.reduce((n, x) => n + x.count, 0);
  if (total <= 0) return;

  let from = -Math.PI / 2;
  ctx.lineWidth = s.thickness;
  s.slices.forEach((slice, i) => {
    const sweep = (slice.count / total) * Math.PI * 2;
    ctx.strokeStyle = s.tones[i % s.tones.length];
    ctx.beginPath();
    ctx.arc(s.cx, s.cy, s.r, from, from + sweep);
    ctx.stroke();
    from += sweep;
  });
  ctx.lineWidth = 1;

  if (s.centre) {
    ctx.textAlign = "center";
    ctx.fillStyle = s.centreTone;
    ctx.font = s.centre.valueFont;
    ctx.fillText(s.centre.value, s.cx, s.cy + 4);
    ctx.fillStyle = s.centreLabel;
    ctx.font = s.centre.labelFont;
    ctx.fillText(s.centre.label, s.cx, s.cy + 18);
    ctx.textAlign = "left";
  }
}
