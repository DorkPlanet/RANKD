import { describe, expect, it } from "vitest";

import { BARS } from "@/lib/brand";
import { DARK_INK, LIGHT_INK, blockFor, inkOn } from "@/lib/card/palette";

// The marquee card's two colour rules, shared by the canvas renderer and the
// genre card on a public profile. They were lifted out of `marquee.ts` so those
// two surfaces cannot drift; these tests are what makes "cannot drift" true.

describe("which ink goes on the block", () => {
  it("puts dark ink on the gold, which is the whole reason this is a function", () => {
    // The five bars are not equally dark. White reads on the navy, the purple
    // and the deep red, and is close to illegible on the gold, so a single
    // fixed ink means one of the five cards is broken.
    expect(inkOn("#DAA520")).toBe(DARK_INK);
  });

  it("puts light ink on the dark bars", () => {
    for (const dark of ["#D81E26", "#1E3A8A", "#6B4E9E"]) {
      expect(inkOn(dark), dark).toBe(LIGHT_INK);
    }
  });

  it("gives every bar in the palette a legible ink", () => {
    // The real guarantee. If a sixth colour is ever added to BARS, this fails
    // unless somebody has thought about what goes on top of it.
    for (const bar of BARS) {
      expect([LIGHT_INK, DARK_INK]).toContain(inkOn(bar));
    }
  });

  it("reads teal as light rather than dark", () => {
    // Rec. 601 weights green the way the eye does. A naive average would call
    // teal bright and put black on it, which looks wrong.
    expect(inkOn("#00A3A3")).toBe(LIGHT_INK);
  });
});

describe("which block a subject gets", () => {
  it("is the same colour every single time", () => {
    // The point of hashing rather than randomising: your crime card is the same
    // red on your profile as on anything you export, today and next year. A
    // colour that changed per render would feel like a slot machine.
    expect(blockFor("Crime")).toBe(blockFor("Crime"));
    expect(blockFor("Horror")).toBe(blockFor("Horror"));
  });

  it("is always one of the brand bars", () => {
    for (const subject of ["Crime", "Horror", "Documentary", "Comedy", "Science Fiction", ""]) {
      expect(BARS as readonly string[], subject).toContain(blockFor(subject));
    }
  });

  it("spreads different subjects across the palette", () => {
    // Not a guarantee about any one pair, just that it is not returning the
    // same colour for everything, which a broken hash would.
    const genres = [
      "Crime", "Horror", "Comedy", "Documentary", "Thriller", "Romance",
      "Western", "Animation", "Science Fiction", "Drama", "War", "Musical",
    ];
    expect(new Set(genres.map(blockFor)).size).toBeGreaterThan(1);
  });

  it("survives a subject with no characters in it", () => {
    expect(BARS as readonly string[]).toContain(blockFor(""));
  });
});
