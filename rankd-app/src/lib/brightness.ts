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

// The brightness-driven tokens at position t (0 deep → 1 bright).
//
// Surfaces only. The text tokens are deliberately absent: they are fixed in
// globals.css and must stay legible at every setting rather than changing hue
// with the room.
export function brightnessVars(t: number): Record<string, string> {
  const c = clamp01(t);
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
