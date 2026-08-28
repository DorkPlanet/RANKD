// Where the points of a radar sit.
//
// Two functions and no drawing, because there are two things drawing radars now
// and they cannot share a renderer: the profile's chart is SVG in the DOM, and
// the dossier card's is a canvas bitmap meant for export. What they must share
// is the GEOMETRY — if the profile's dial starts straight up and goes clockwise
// while the card's starts at three o'clock, the same taste is two different
// shapes depending on where you look at it, and the card stops being a picture
// of the thing on your profile.
//
// So the maths lives here and each surface strokes it in its own idiom. Nothing
// in this file knows about SVG, canvas, colours or sizes.

/**
 * Where an axis sits on the dial, in radians. First one straight up, then
 * clockwise — which is the direction a reader expects because it is the
 * direction a clock goes, and it is what the profile has always done.
 */
export const angleAt = (i: number, n: number): number => (-90 + (i * 360) / n) * (Math.PI / 180);

/** A point on the dial, `radius` out from `(cx, cy)` along axis `i` of `n`. */
export function pointAt(
  i: number,
  n: number,
  radius: number,
  cx: number,
  cy: number,
): [number, number] {
  const a = angleAt(i, n);
  return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
}

/** Clamp a 0..1 standing before it becomes a radius. A value outside the dial
 *  would draw outside the ring, which reads as a rendering fault rather than as
 *  a strong opinion. */
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * The corners of one shape, at `r` scaled by each value.
 *
 * Shared because both surfaces need exactly this list and only differ in what
 * they do with it — join it into an SVG `points` string, or walk it with
 * `lineTo`.
 */
export function polygonPoints(
  values: readonly number[],
  r: number,
  cx: number,
  cy: number,
): [number, number][] {
  return values.map((v, i) => pointAt(i, values.length, r * clamp01(v), cx, cy));
}

/** The corners of a reference ring at a fraction of full radius. */
export function ringPoints(
  fraction: number,
  n: number,
  r: number,
  cx: number,
  cy: number,
): [number, number][] {
  return Array.from({ length: n }, (_, i) => pointAt(i, n, r * fraction, cx, cy));
}
