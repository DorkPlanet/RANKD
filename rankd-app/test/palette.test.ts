import { describe, expect, it } from "vitest";

import { BARS } from "@/lib/brand";
import { DARK_INK, LIGHT_INK, blockFor, inkOn } from "@/lib/card/palette";
import { genreTypeSize } from "@/lib/card/genreType";

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

describe("how large the genre gets to be", () => {
  it("keeps a short genre enormous", () => {
    expect(genreTypeSize("Crime")).toBe(52);
    expect(genreTypeSize("Horror")).toBe(52);
  });

  it("steps a long one down rather than letting it run out of its block", () => {
    // "DOCUMENTARY" overlapped the numbers beside it on a real profile. That is
    // what this whole function exists to stop.
    expect(genreTypeSize("Documentary")).toBe(30);
  });

  it("measures the LONGEST WORD, not the whole string", () => {
    // The bug that made this a tested function. Sizing by total length would
    // shrink a two-word genre to fit a width it never needs, because it wraps
    // and each line only has to hold its own word.
    expect(genreTypeSize("Science Fiction")).toBe(44); // longest word is 7
    expect(genreTypeSize("Science Fiction").valueOf()).toBeGreaterThan(
      genreTypeSize("Documentary"),
    );
  });

  it("splits on whitespace, not on the letter s", () => {
    // The typo it shipped with: `/s+/` rather than `/\s+/`. It broke words on
    // "s", so "Musical" measured as four characters and came out enormous.
    expect(genreTypeSize("Musical")).toBe(44); // seven characters, one word
  });

  it("survives a genre with nothing in it", () => {
    expect(genreTypeSize("")).toBe(52);
    expect(genreTypeSize("   ")).toBe(52);
  });
});
