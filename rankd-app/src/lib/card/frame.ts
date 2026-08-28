// The shape every card is cut to, and the rule that makes one file work on two
// differently-shaped surfaces.
//
// ── Why 9:16 ───────────────────────────────────────────────────────────────
//
// The cards were 1920x1080 landscape, which is the one shape that is awkward
// everywhere a phone app's card actually goes: letterboxed to a strip in a
// story, cropped in a feed, a small wide sliver in a message thread. Rankd is a
// portrait app and its only outward-facing artefact was shaped for a desktop
// timeline.
//
// 1080x1920 is full screen in Instagram and Facebook Stories, WhatsApp Status,
// Snapchat and TikTok — which is where a ranking card goes. It is also 3.5x the
// vertical room at the same width, which is what makes the dossier card
// possible at all.
//
// ── The safe area, which is the actual design constraint ───────────────────
//
// A feed post caps portrait at 4:5 and centre-crops anything taller. So the
// canvas is 9:16 and everything that MATTERS lives inside the centred 4:5
// region; the bands above and below carry atmosphere only — a colour field, the
// brand bars, the wordmark, the date.
//
// The consequence is worth stating plainly because it is easy to erode: a story
// gets the whole canvas, a feed crop loses decoration rather than content, and
// both read as finished. One render, two surfaces.
//
// **No text, artwork, chart or rule may cross a safe edge.** That is the whole
// bargain. `test/cardFrame.test.ts` asserts the arithmetic and the browser pass
// reads back the pixels in the bleed bands to prove no ink lands there — because
// this is a rule that fails silently and only on somebody else's phone.

/** Layout units. Everything a renderer draws is in these; `scale` doubles them. */
export const W = 540;
export const H = 960;

/** 2 -> a 1080x1920 bitmap, which is the native size on every phone worth caring about. */
export const SCALE = 2;

/** The gutter inside the safe area. Not the safe area itself. */
export const PAD = 40;

/**
 * The centred 4:5 region, in layout units.
 *
 * Derived rather than typed in, so the two numbers cannot drift from each other
 * or from `W`/`H` if the canvas ever changes.
 */
export const SAFE_H = Math.round((W * 5) / 4); // 675
export const SAFE_TOP = Math.round((H - SAFE_H) / 2); // 142
export const SAFE_BOT = SAFE_TOP + SAFE_H; // 817

/** The bleed bands, top and bottom. Atmosphere only. */
export const BLEED = SAFE_TOP;

/** Content edges, for anything that also wants the horizontal gutter. */
export const LEFT = PAD;
export const RIGHT = W - PAD;
export const CONTENT_W = RIGHT - LEFT;
