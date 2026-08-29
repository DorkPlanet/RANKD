// The book theme crosses from paper to night across one slider.
//
// This file exists because that is a design somebody will tune later, and the
// failure mode of tuning it wrong is invisible in a diff and obvious on a
// phone: text you cannot read. Every number in `brightnessVars`'s book branch
// was FOUND by pushing `--dim` to the 4.5:1 floor, and these assertions are
// what stop the next person nudging it past.
//
// Sampled at a hundred points rather than at the ends. A theme that flips
// mid-slider hides its worst contrast next to the flip, which is exactly where
// coarse sampling looks.

import { describe, expect, it } from "vitest";
import { brightnessVars, isPaper } from "@/lib/brightness";

/** WCAG relative luminance. */
function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every setting a reader can actually select, finely enough to catch the flip. */
const SLIDER = Array.from({ length: 101 }, (_, i) => i / 100);

/** The tokens that carry MEANING and must therefore be readable. */
// `--accent` is in here because it is not decoration: it is the colour the list
// screen counts "shuffled" in, and a number nobody can read is a broken screen.
const INK = ["--text", "--text-hi", "--dim", "--gold", "--accent"] as const;

describe("the book theme", () => {
  it("is legible at every single setting of the slider", () => {
    // WCAG AA for body text. The floor, not the target — most settings are far
    // above it, and `--dim` at the regime boundaries is what sets it.
    for (const t of SLIDER) {
      const v = brightnessVars(t, "book");
      for (const token of INK) {
        const r = ratio(v["--bg"], v[token]);
        expect(
          r,
          `${token} on ${v["--bg"]} at t=${t} is ${r.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("never rests on a mid-tone, which is what makes that possible", () => {
    // The reason the ramp is two regimes rather than one sweep. Around 45%
    // lightness the ground is a mid-brown and NO ink works — `--dim` measured
    // 1.67:1 there. The gap is the feature.
    for (const t of SLIDER) {
      const l = lum(brightnessVars(t, "book")["--bg"]);
      expect(l < 0.12 || l > 0.35, `t=${t} sits in the mud at luminance ${l.toFixed(3)}`).toBe(
        true,
      );
    }
  });

  it("reaches the beige that was asked for at the bright end", () => {
    expect(brightnessVars(1, "book")["--bg"]).toBe("#d9d1c4");
    expect(isPaper(1, "book")).toBe(true);
  });

  it("is dark at the other end, and dark by default", () => {
    // `DEFAULT_BRIGHTNESS` is 0, so a reader who never touches the slider gets
    // night — the same darkness films open at, not a sudden white page.
    expect(lum(brightnessVars(0, "book")["--bg"])).toBeLessThan(0.02);
    expect(isPaper(0, "book")).toBe(false);
  });

  it("lifts a surface AWAY from the page in both regimes", () => {
    // On night a surface is lighter than the page; on paper it is darker. Get
    // this backwards and every card sinks into the ground it sits on.
    for (const t of SLIDER) {
      const v = brightnessVars(t, "book");
      const [page, surface] = [lum(v["--bg"]), lum(v["--surface"])];
      if (isPaper(t, "book")) expect(surface, `t=${t}`).toBeLessThan(page);
      else expect(surface, `t=${t}`).toBeGreaterThan(page);
      // And visibly so, or it is not a surface.
      expect(ratio(v["--bg"], v["--surface"]), `t=${t}`).toBeGreaterThan(1.1);
    }
  });

  it("keeps the wordmark legible on the header, in both regimes", () => {
    // This shipped broken and an audit of the RENDERED page caught it, not
    // these tests: the header was a dark brown on paper while `--gold` had
    // flipped to a deep amber, so the wordmark sat at 1:1. Invisible.
    //
    // The tests only ever compared ink against `--bg`. Chrome is a second
    // ground and needs the same guarantee, which is what this is.
    for (const t of SLIDER) {
      const v = brightnessVars(t, "book");
      const r = ratio(v["--header-bg"], v["--gold"]);
      expect(r, `gold on header at t=${t} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps ordinary text legible on the header too", () => {
    for (const t of SLIDER) {
      const v = brightnessVars(t, "book");
      expect(ratio(v["--header-bg"], v["--dim"]), `dim on header at t=${t}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("swaps the wash rather than leaving a white film on beige", () => {
    // `--wash` is the only separation seven components have. A 6% white film on
    // a beige page is nothing at all.
    expect(brightnessVars(0, "book")["--wash"]).toContain("255,255,255");
    expect(brightnessVars(1, "book")["--wash"]).toContain("0,0,0");
  });

  it("spends the gold glow on paper, where a glow is a smudge", () => {
    expect(brightnessVars(1, "book")["--glow"]).toBe("rgba(0,0,0,0)");
    expect(brightnessVars(0, "book")["--glow"]).not.toBe("rgba(0,0,0,0)");
  });

  it("keeps gold legible as a FILL in both regimes", () => {
    // Gold-on-page is one problem and ink-on-gold is another. A filled gold
    // button has to work whichever way the page went.
    for (const t of [0, 1]) {
      const v = brightnessVars(t, "book");
      expect(ratio(v["--gold"], v["--gold-ink"])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("lightens its shadows on paper", () => {
    // 55% black under each of 800 list rows reads as dirt on a light page.
    const opacity = (s: string) => Number(s.match(/[\d.]+\)$/)![0].slice(0, -1));
    expect(opacity(brightnessVars(1, "book")["--shadow"])).toBeLessThan(
      opacity(brightnessVars(0, "book")["--shadow"]),
    );
  });
});

describe("the film theme", () => {
  it("is unchanged — surfaces only, and the same numbers as before", () => {
    // Films must not move. Their ink is constant in globals.css, so returning
    // ink here would override it for every existing reader.
    const v = brightnessVars(0, "film");
    expect(v["--bg"]).toBe("#040c1a");
    expect(v["--header-bg"]).toBe("#000000");
    for (const token of ["--text", "--dim", "--gold", "--wash"]) {
      expect(v[token], `film must not set ${token}`).toBeUndefined();
    }
  });

  it("stays dark across its whole range", () => {
    for (const t of SLIDER) {
      expect(lum(brightnessVars(t, "film")["--bg"])).toBeLessThan(0.05);
      expect(isPaper(t, "film")).toBe(false);
    }
  });
});
