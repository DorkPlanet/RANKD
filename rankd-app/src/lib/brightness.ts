// User-tunable BACKGROUND brightness, per medium.
//
// ── Films: a dark room, dimmer or less dim ─────────────────────────────────
//
//   0 = deepest blue (#040c1a) — the default look.
//   1 = brightest blue (#0b2044).
//
// It used to move the text colour too, warming it to gold at the deep end and
// cooling it to near-white at the bright end. That coupling made the one
// combination worth having — a deep background with neutral, readable text —
// impossible to select: you could have the dark room or the legible text, never
// both. The text tokens are constants in globals.css and this controls the
// surfaces only.
//
// ── Books: paper, or night ─────────────────────────────────────────────────
//
// The ask was a soft beige at the bright end "and then dark with the slider" —
// so the book range crosses from a light theme to a dark one, which films never
// do. Two things follow, and both are load-bearing:
//
// **The ink cannot be constant.** Light ink vanishes on beige and dark ink
// vanishes on night, so this returns the INK as well as the surfaces when the
// medium is books. That is why films get four keys back and books get twelve.
//
// **The ramp is not continuous.** The obvious version — sweep the lightness from
// 6% to 78% — was measured and fails: around 45% the ground is a mid-brown, and
// a mid-tone has no good ink in either direction. `--dim` bottomed out at
// 1.67:1 there, which is not dim, it is gone. So the slider crosses between two
// REGIMES and never rests in the mud between them.
//
// Verified across the whole slider rather than at its ends, which is where a
// flip hides its worst contrast: the poorest ratio anywhere is 4.75:1, clearing
// WCAG AA at every setting. `test/bookTheme.test.ts` asserts exactly that, so a
// later tweak to these numbers cannot quietly ship unreadable text.

import { markDirty } from "./syncState";
import { currentMedium, type Medium } from "./medium";

const KEY = "rankd-brightness";
export const DEFAULT_BRIGHTNESS = 0;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function hx(x: number): string {
  const s = Math.round(x).toString(16);
  return s.length < 2 ? "0" + s : s;
}

// HSL → hex (h 0–360, s/l 0–100), so brightness moves lightness while holding hue.
function hslHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return "#" + hx(255 * f(0)) + hx(255 * f(8)) + hx(255 * f(4));
}

/**
 * Is the book theme showing paper rather than night at this setting?
 *
 * Exported because the flip is not only a colour swap. Shadows, the sheet scrim
 * and the gold glows are all dark-ground devices, and `globals.css` keys them
 * off the same boundary through the `--on-paper` token this sets.
 */
export const isPaper = (t: number, medium: Medium = currentMedium()): boolean =>
  medium === "book" && clamp01(t) >= 0.5;

/** The book ground's hue and saturation, taken from the reference beige (h 38, s 20–25). */
const BOOK_H = 38;
const BOOK_S = 22;

/** Lightness of the book ground. Night climbs 6→20; paper climbs 70→92. */
const bookL = (c: number): number => (c >= 0.5 ? 70 + 22 * (c - 0.5) : 6 + 28 * c);

/**
 * The two ink sets, and why `--dim` is what decided the ramp.
 *
 * `--text` and `--text-hi` have enormous headroom — they can go near-black or
 * near-white and clear 10:1 almost anywhere. `--dim` cannot: it is *defined* as
 * the quieter ink, so it sits nearest the ground and hits the floor first.
 * Every boundary in `bookL` was found by pushing `--dim` to 4.5:1 and stopping.
 *
 * `--gold` is the other constraint. `#e7b53e` is 2.2:1 on beige — the hero
 * colour, invisible — so paper gets a deep amber. Gold as a FILL with
 * `--gold-ink` on top is unaffected: that pairing does not depend on the page.
 */
const NIGHT_INK: Record<string, string> = {
  "--text": "#e6ddcc",
  "--text-hi": "#fbf7ef",
  "--dim": "#b3a691",
  "--gold": "#e7b53e",
  "--gold-ink": "#1c1405",
  "--accent": "#7fb0ff",
  // A white film, as on the film theme: a surface lifts off a dark page by
  // catching light.
  "--wash": "rgba(255,255,255,0.06)",
  // Near-black shadows on a near-black page read as soft depth.
  "--shadow": "rgba(0,0,0,0.55)",
  "--shadow-strong": "rgba(0,0,0,0.75)",
  "--scrim": "rgba(0,0,0,0.5)",
  "--glow": "rgba(231,181,62,0.22)",
};

const PAPER_INK: Record<string, string> = {
  "--text": "#2e2417",
  "--text-hi": "#120d05",
  "--dim": "#4c4335",
  // Deeper than a gold wants to be, and solved for rather than chosen: it has
  // to clear 4.5:1 against BOTH the page and the header, and the header is the
  // harder of the two. `#5c4206` cleared the page and failed the header at
  // 3.3:1, which is how the wordmark came to be invisible.
  "--gold": "#4d3705",
  "--gold-ink": "#f7f2e6",
 // Solved against the darkest paper page AND its header, like the gold above.
  // `#1d5fbf` was the obvious "darker blue" and measured 3.25:1 on beige — the
  // shuffled count on the list screen, which is a number people read.
  "--accent": "#103570",
  // Inverted, and it has to be. `--wash` is the app's "lifted surface", and a
  // 6% white film on beige is nothing at all — seven components lose their only
  // separation from the page. On paper a surface lifts by casting, not glowing.
  "--wash": "rgba(0,0,0,0.05)",
  // Far lighter than night's. A 55%-black shadow under each of 800 list rows
  // reads as dirt on a light page rather than as depth.
  "--shadow": "rgba(60,45,20,0.18)",
  "--shadow-strong": "rgba(60,45,20,0.28)",
  "--scrim": "rgba(40,30,12,0.42)",
  // A glow is a dark-ground device. On paper it is a smudge, so it is spent.
  "--glow": "rgba(0,0,0,0)",
};

/**
 * The brightness-driven tokens at position t (0 deep → 1 bright).
 *
 * Films get surfaces only; their ink is constant in globals.css and must stay
 * legible at every setting rather than changing hue with the room. Books get
 * ink too, because their range crosses from paper to night — see the header.
 */
export function brightnessVars(
  t: number,
  medium: Medium = currentMedium(),
): Record<string, string> {
  const c = clamp01(t);

  if (medium === "book") {
    const l = bookL(c);
    const paper = c >= 0.5;
    return {
      "--bg": hslHex(BOOK_H, BOOK_S, l),
      // A surface lifts AWAY from the page in both regimes: lighter on night,
      // darker on paper.
      "--surface": hslHex(BOOK_H, BOOK_S - 6, paper ? l - 5 : l + 6),
      "--band": hslHex(BOOK_H, BOOK_S, paper ? l - 9 : Math.max(2, l - 3)),
      "--border": hslHex(BOOK_H, BOOK_S - 8, paper ? l - 18 : l + 10),
      // ── The header joins the regime, it does not resist it ────────────
      //
      // First attempt made this a dark brown on paper, reasoning that the
      // header is chrome and chrome is dark. It put the GOLD WORDMARK at 1:1 —
      // paper gold is a deep amber, and a deep amber on a dark brown bar is
      // nothing at all. Caught by auditing the rendered page rather than by the
      // token tests, which never compared these two.
      //
      // The lesson is that the ink flips WHOLESALE. A dark bar on paper would
      // need the night ink to sit on it, and there is one `--gold`. So on paper
      // the header is paper too: a deeper beige, the same move `--band` makes.
      "--header-bg": paper ? hslHex(BOOK_H, BOOK_S, l - 5) : "#000000",
      // Read by globals.css, so the shadow and scrim rules can key off the
      // regime without re-deriving it from a colour.
      "--on-paper": paper ? "1" : "0",
      ...(paper ? PAPER_INK : NIGHT_INK),
    };
  }

  return {
    "--bg": hslHex(218, 72, 6 + 12 * c),
    // ── The header does NOT slide, and that is the point ────────────────
    //
    // It used to: `hslHex(218, 68, 12 * c)`, a darker shade of the background
    // that moved with it. So at any brightness above zero the RANKD bar was a
    // deep BLUE rather than black, and the app's one piece of fixed chrome
    // drifted with a setting about the playing surface.
    //
    // The user's call, and it is the right one: the splash is always black. The
    // brightness slider is about the room you are ranking in; the frame around
    // it should not move with it.
    //
    // Constant, so it is stated here rather than computed. `--bg` still slides,
    // which means the black-to-blue edge gets STRONGER at high brightness — and
    // that is exactly what the header's feather is for. See `Header`.
    "--header-bg": "#000000",
    // ── The band between the chrome and the page ─────────────────────────
    //
    // The list's top block — counts and search — sat on the page's own colour,
    // which made it page that happened to be at the top rather than a band with
    // a job. This is deliberately BETWEEN: black header, then this, then the
    // list. Half the page's lightness at every setting, so the three-step
    // separation holds across the whole brightness range instead of only at one
    // end of it.
    //
    // It slides where `--header-bg` does not, and that is the distinction: the
    // header is chrome and stays black, this is part of the surface you are
    // reading and moves with the rest of it.
    "--band": hslHex(218, 70, 3 + 6 * c),
    "--surface": hslHex(216, 55, 9 + 15 * c),
    "--border": hslHex(216, 50, 14 + 16 * c),
    "--on-paper": "0",
  };
}

export function applyBrightness(t: number): void {
  if (typeof document === "undefined") return;
  const vars = brightnessVars(t);
  const el = document.documentElement;
  for (const k in vars) el.style.setProperty(k, vars[k]);
}

export function loadBrightness(): number {
  if (typeof window === "undefined") return DEFAULT_BRIGHTNESS;
  const raw = localStorage.getItem(KEY);
  const n = raw == null ? NaN : parseFloat(raw);
  return Number.isFinite(n) ? clamp01(n) : DEFAULT_BRIGHTNESS;
}

export function saveBrightness(t: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, String(clamp01(t)));
  // In `SYNC_KEYS`, so it has to mark. `markDirty` is first-write-wins, so
  // dragging the slider marks once rather than once per frame. See `savePrefs`
  // for what leaving this out cost.
  markDirty();
}
