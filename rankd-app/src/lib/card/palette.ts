// The marquee card's colour rules, lifted so more than one surface can use them.
//
// ── Why this left marquee.ts ───────────────────────────────────────────────
//
// `marquee.ts` is a CANVAS renderer: it draws a 960x540 bitmap for export and
// knows nothing about the DOM. The genre card on a public profile wants the same
// look in HTML, and copying two functions across would mean the block colour for
// a subject could drift between the card you export and the card on your page.
// They should be the same colour because they are the same claim.
//
// So the rules live here and both read from them. `marquee.ts` keeps its layout,
// its type scale and every other decision it makes; only these two moved.

import { BARS } from "../brand";

/**
 * Ink follows the block rather than being fixed.
 *
 * The five bars are not equally dark: white reads well on the navy, the purple
 * and the deep red, and is close to illegible on the gold. Picking one ink for
 * all five means one of the five cards is broken, so it is chosen by the block's
 * own luminance instead.
 */
export const LIGHT_INK = "#fdfaf4";
export const DARK_INK = "#14100a";

export function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  // Rec. 601 luma. Good enough for a two-way choice, and it weights green the
  // way the eye does, which is what makes the teal come out light rather than
  // dark.
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? DARK_INK : LIGHT_INK;
}

/** FNV-1a. Not a hash for security, a hash for picking the same colour twice. */
function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/**
 * The block colour for a subject, stable forever.
 *
 * Deterministic rather than random, and that is the whole point: your crime card
 * is the same red every time you look at it, on your profile and on anything you
 * export. A colour that changed on each render would make the card feel like a
 * slot machine rather than like a thing that belongs to you.
 */
export function blockFor(subject: string): string {
  return BARS[Math.abs(hashOf(subject)) % BARS.length];
}
