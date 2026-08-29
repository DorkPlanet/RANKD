// User-tunable BACKGROUND brightness for the duel screen.
//   0 = deepest blue (#040c1a) — the default look.
//   1 = brightest blue (#0b2044).
// The slider lives in Settings; the choice persists in localStorage.
//
// It used to move the text colour too, warming it to gold at the deep end and
// cooling it to near-white at the bright end. That coupling made the one
// combination worth having — a deep background with neutral, readable text —
// impossible to select: you could have the dark room or the legible text, never
// both. The text tokens are now constants (see globals.css) and this controls
// the surfaces only. --accent and --gold were already constant across the range.

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
 * The hue each library is lit in.
 *
 * ── Why a colour and not a badge ──────────────────────────────────────────
 *
 * Two libraries look identical: the same tiers, the same chrome, the same
 * layout, different rows. The wordmark's glyph says which you are in and it is
 * 16px in a corner. The page itself saying so is unmissable and costs nothing,
 * because every surface in the app already comes from one hue.
 *
 * ── Matched for DARKNESS, deliberately ────────────────────────────────────
 *
 * Oxblood over the obvious brown. Measured relative luminance at the deep end:
 * navy 0.0036, oxblood 0.0037, warm brown 0.0052. The first two are the same
 * darkness and differ only in hue, which is what makes the switch read as a
 * different LIBRARY rather than as somebody having nudged the brightness — and
 * brown drifts further apart as the slider comes up (0.0298 against 0.0197).
 *
 * Contrast holds either way: text sits at 13:1 on both, gold at 10:1.
 *
 * The text tokens stay cool and stay constant. They are fixed in globals.css so
 * they remain legible at every brightness, and a cool grey on oxblood is a
 * deliberate pairing rather than an oversight.
 *
 * PROVISIONAL — the behaviour is settled, the exact hue is a taste call and is
 * two numbers here.
 */
const HUES: Record<Medium, { bg: [number, number]; band: [number, number]; surface: [number, number]; border: [number, number] }> = {
  film: { bg: [218, 72], band: [218, 70], surface: [216, 55], border: [216, 50] },
  book: { bg: [355, 45], band: [355, 42], surface: [353, 34], border: [353, 30] },
};

// The brightness-driven tokens at position t (0 deep → 1 bright).
//
// Surfaces only. The text tokens are deliberately absent: they are fixed in
// globals.css and must stay legible at every setting rather than changing hue
// with the room.
export function brightnessVars(t: number, medium: Medium = currentMedium()): Record<string, string> {
  const c = clamp01(t);
  const h = HUES[medium];
  return {
    "--bg": hslHex(h.bg[0], h.bg[1], 6 + 12 * c),
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
    "--band": hslHex(h.band[0], h.band[1], 3 + 6 * c),
    "--surface": hslHex(h.surface[0], h.surface[1], 9 + 15 * c),
    "--border": hslHex(h.border[0], h.border[1], 14 + 16 * c),
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
