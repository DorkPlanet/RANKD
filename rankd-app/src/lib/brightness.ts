// User-tunable background brightness for the duel screen.
//   0 = deepest blue (#040c1a) with gold text — the default look.
//   1 = brightest blue (#0b2044) with whiteish text.
// The slider lives in Settings; the choice persists in localStorage. --accent
// (blue) and --gold stay constant across the range, so they aren't recomputed.

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

function parseHex(c: string): [number, number, number] {
  const n = c.replace("#", "");
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  return "#" + hx(pa[0] + (pb[0] - pa[0]) * t) + hx(pa[1] + (pb[1] - pa[1]) * t) + hx(pa[2] + (pb[2] - pa[2]) * t);
}

// The brightness-driven tokens at position t (0 deep → 1 bright).
export function brightnessVars(t: number): Record<string, string> {
  const c = clamp01(t);
  return {
    "--bg": hslHex(218, 72, 6 + 9.5 * c),
    // Header sits ~6 lightness points below --bg, so it's the blackest at t=0
    // and a deep blue at t=1 — a darker shade of the background that slides with it.
    "--header-bg": hslHex(218, 68, 9.5 * c),
    "--surface": hslHex(216, 55, 9 + 13 * c),
    "--border": hslHex(216, 50, 14 + 14 * c),
    "--text": lerpHex("#e7b53e", "#c6d3ea", c),
    "--text-hi": lerpHex("#f4dd90", "#eaf0fa", c),
    "--dim": lerpHex("#a5822f", "#8ca0c0", c),
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
  if (typeof window !== "undefined") localStorage.setItem(KEY, String(clamp01(t)));
}
