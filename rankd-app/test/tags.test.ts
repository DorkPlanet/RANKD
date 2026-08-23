// Tags, and the signature they add up to.

import { describe, expect, it } from "vitest";

import {
  cleanNote,
  cleanTags,
  MAX_TAGS,
  MIN_FOR_SIGNATURE,
  NOTE_MAX,
  signatureOf,
  SIGNATURE_DEPTH,
  TAGS,
} from "@/lib/tags";

const tagged = (n: number, tags: string[]) => Array.from({ length: n }, () => ({ tags }));

describe("the vocabulary", () => {
  it("has no duplicates and nothing empty", () => {
    expect(new Set(TAGS).size).toBe(TAGS.length);
    expect(TAGS.every((t) => t.trim().length > 0)).toBe(true);
  });

  it("stays short enough to read to the end of", () => {
    // A list you have to scroll is a list where the last options never get
    // picked, which quietly biases every signature.
    expect(TAGS.length).toBeLessThanOrEqual(12);
  });
});

describe("cleanTags", () => {
  it("keeps only real tags", () => {
    expect(cleanTags(["Score", "Vibes", "Pacing"])).toEqual(["Score", "Pacing"]);
  });

  it("drops duplicates", () => {
    expect(cleanTags(["Score", "Score"])).toEqual(["Score"]);
  });

  it("never returns more than the cap", () => {
    // Three forces a choice, and the choosing is where the signal is.
    expect(cleanTags([...TAGS])).toHaveLength(MAX_TAGS);
  });

  it("copes with nothing", () => {
    expect(cleanTags(undefined)).toEqual([]);
    expect(cleanTags([])).toEqual([]);
  });
});

describe("cleanNote", () => {
  it("collapses whitespace so a note cannot be padded", () => {
    expect(cleanNote("  the   ending   ")).toBe("the ending");
  });

  it("treats blank as absent rather than empty", () => {
    expect(cleanNote("   ")).toBeUndefined();
    expect(cleanNote(undefined)).toBeUndefined();
  });

  it("cuts at the cap", () => {
    expect(cleanNote("x".repeat(NOTE_MAX + 50))).toHaveLength(NOTE_MAX);
  });
});

describe("signatureOf", () => {
  it("refuses to draw one from too few films", () => {
    // An honest nothing beats a shape built from three taps.
    expect(signatureOf(tagged(MIN_FOR_SIGNATURE - 1, ["Score"]))).toEqual([]);
  });

  it("counts once the floor is cleared", () => {
    const sig = signatureOf(tagged(MIN_FOR_SIGNATURE, ["Score"]));
    expect(sig).toEqual([{ tag: "Score", count: MIN_FOR_SIGNATURE }]);
  });

  it("puts the most-tagged axis first", () => {
    const films = [...tagged(6, ["Score"]), ...tagged(5, ["Pacing"])];
    expect(signatureOf(films)[0].tag).toBe("Score");
  });

  it("only counts the films somebody ranks HIGHLY", () => {
    // Otherwise the things you were indifferent to outvote the things you love,
    // purely by being more numerous. The window has to be full of Score before
    // the Pacing starts, or the test is only proving that a list has an end.
    const top = tagged(SIGNATURE_DEPTH, ["Score"]);
    const buried = tagged(200, ["Pacing"]);
    const sig = signatureOf([...top, ...buried]);
    expect(sig).toEqual([{ tag: "Score", count: SIGNATURE_DEPTH }]);
    expect(sig.some((s) => s.tag === "Pacing")).toBe(false);
  });

  it("ignores untagged films when counting toward the floor", () => {
    const films = [...tagged(3, ["Score"]), ...tagged(50, [])];
    expect(signatureOf(films)).toEqual([]);
  });

  it("gives the same answer twice for the same library", () => {
    // Ties break on the fixed vocabulary order, not on insertion, so a signature
    // cannot shuffle between two renders of identical data.
    const films = [...tagged(3, ["Pacing"]), ...tagged(3, ["Score"])];
    expect(signatureOf(films)).toEqual(signatureOf(films));
    expect(signatureOf(films)[0].tag).toBe("Score"); // earlier in TAGS
  });

  it("throws nothing away inside one film's cap", () => {
    const films = tagged(MIN_FOR_SIGNATURE, ["Score", "Pacing", "Ending"]);
    expect(signatureOf(films)).toHaveLength(3);
  });
});
