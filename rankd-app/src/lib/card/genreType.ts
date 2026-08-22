// How large the genre gets to be on a marquee card.
//
// ── Why this is a function in its own file ─────────────────────────────────
//
// The canvas marquee calls `fitText`, which shrinks until it fits because it has
// a rendering context to measure with. The DOM card has no such thing at render
// time, so the size has to be DERIVED from the string instead.
//
// It lives here rather than inline in the component because the first version
// was inline and had a typo nobody could see: it split on `/s+/` rather than
// `/\s+/`, so it broke words on the letter "s" and sized "Musical" as though it
// were four characters. That is a bug a test catches instantly and an eye never
// does.

/**
 * Point size for a genre name on the card.
 *
 * Measured against the LONGEST WORD, not the whole string. A two-word genre
 * wraps onto two lines and each line only has to fit its own word, so sizing by
 * total length would shrink "Science Fiction" to fit a width it never needs.
 *
 * Degrades in the right direction: short genres stay enormous, which is where
 * the format's loudness actually matters, and the handful of long ones step down
 * rather than run out of their block.
 */
export function genreTypeSize(name: string): number {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 52;
  const longest = Math.max(...words.map((w) => w.length));
  if (longest <= 6) return 52;
  if (longest <= 8) return 44;
  if (longest <= 10) return 36;
  return 30;
}
