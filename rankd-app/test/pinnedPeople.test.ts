import { describe, expect, it } from "vitest";

import { nextUp, type Achievement } from "@/lib/achievements";
import { MAX_PINNED_PEOPLE, personKey, superlatives, topPeople } from "@/lib/profile";
import type { Film } from "@/lib/types";
import type { Rating } from "@/lib/tiers";

// Pinning directors and actors (P16).
//
// The list is COMPUTED — whose films you rate highest — and `rank` slices it to
// a handful of slots. The whole feature is the option to disagree with that, so
// the property worth guarding is that a pin BEATS THE SLICE: somebody you chose
// appears even when the maths would have dropped them.

const film = (id: string, rating: Rating, director: string, cast: string[] = []): Film =>
  ({ id, title: id, year: "2000", rating, score: 0, director, cast }) as Film;

// Four directors, each with two films, at descending averages. DIRECTOR_SLOTS
// is 3, so `Low` is sliced off unless a pin rescues them.
const films: Film[] = [
  film("a1", 5, "Top", ["Star"]),
  film("a2", 5, "Top", ["Star"]),
  film("b1", 4, "Second", ["Star"]),
  film("b2", 4, "Second", ["Extra"]),
  film("c1", 3, "Third", ["Extra"]),
  film("c2", 3, "Third", ["Extra"]),
  film("d1", 1, "Low", ["Nobody"]),
  film("d2", 1, "Low", ["Nobody"]),
];

const names = (films: Film[], pinned: string[] = []) =>
  topPeople(films, pinned).directors.map((d) => d.name);

describe("pinned directors and actors", () => {
  it("drops the weakest when nothing is pinned", () => {
    // The baseline the feature exists to override.
    expect(names(films)).toEqual(["Top", "Second", "Third"]);
    expect(names(films)).not.toContain("Low");
  });

  it("rescues somebody the slice would have dropped", () => {
    expect(names(films, [personKey("director", "Low")])).toContain("Low");
  });

  it("floats a pin to the top, above better-rated people", () => {
    // "Low" is last by average and first by choice. That inversion IS the
    // feature — a computed list you can disagree with.
    expect(names(films, [personKey("director", "Low")])[0]).toBe("Low");
  });

  it("keeps everyone else in their computed order behind the pins", () => {
    const out = names(films, [personKey("director", "Third")]);
    expect(out[0]).toBe("Third");
    expect(out.slice(1)).toEqual(["Top", "Second"]);
  });

  it("treats a director and an actor of the same name as different pins", () => {
    // Plenty of people are both — Eastwood, Gerwig, Affleck — which is why the
    // role is part of the stored id rather than the bare name.
    const both = [
      film("x1", 5, "Same Name", ["Same Name"]),
      film("x2", 5, "Same Name", ["Same Name"]),
      film("y1", 1, "Other", ["Nobody"]),
      film("y2", 1, "Other", ["Nobody"]),
    ];
    const out = topPeople(both, [personKey("actor", "Same Name")]);
    expect(personKey("director", "Same Name")).not.toBe(personKey("actor", "Same Name"));
    expect(out.actors.map((a) => a.name)).toContain("Same Name");
  });

  it("skips a pin for somebody who has no films any more", () => {
    // The self-cleaning half of the contract: nothing tidies up after a removal,
    // because a pin naming nobody simply finds nothing to rescue.
    expect(() => names(films, [personKey("director", "Deleted Person")])).not.toThrow();
    expect(names(films, [personKey("director", "Deleted Person")])).toEqual([
      "Top",
      "Second",
      "Third",
    ]);
  });

  it("caps at a number of its own, larger than the rankings' cap", () => {
    // Three is right for saved rankings because they share one row. This is two
    // groups, so reusing that number would quietly halve it.
    expect(MAX_PINNED_PEOPLE).toBeGreaterThan(3);
  });
});

// ── Thin states for the facts (C13) ────────────────────────────────────────
//
// Every screen had a zero state and none of these had a THIN one, so a library
// of four films produced "Oldest" and a biggest year with the same confidence
// as a library of nine hundred. Naming the oldest of four is not a discovery,
// it is a sort — and the profile was stating it as a finding.
describe("superlatives hold their tongue on a thin library", () => {
  const f = (id: string, over: Partial<Film> = {}): Film =>
    ({ id, title: id, year: "2000", rating: 4, score: 7000, ...over }) as Film;

  it("says nothing at all below the minimum", () => {
    expect(superlatives([f("a"), f("b"), f("c")])).toEqual([]);
  });

  it("speaks once the library is big enough", () => {
    const many = Array.from({ length: 12 }, (_, i) => f("f" + i, { year: String(1990 + i) }));
    const out = superlatives(many).map((s) => s.label);
    expect(out).toContain("Oldest");
  });

  it("refuses a biggest year that only ties on sort order", () => {
    // Twelve films, every one a different year: the "busiest" year holds one.
    const spread = Array.from({ length: 12 }, (_, i) => f("f" + i, { year: String(1990 + i) }));
    expect(superlatives(spread).map((s) => s.label)).not.toContain("Most from");
  });

  it("names a year that actually won", () => {
    const clustered = [
      ...Array.from({ length: 4 }, (_, i) => f("c" + i, { year: "1999" })),
      ...Array.from({ length: 8 }, (_, i) => f("o" + i, { year: String(2001 + i) })),
    ];
    const hit = superlatives(clustered).find((s) => s.label === "Most from");
    expect(hit?.value).toBe("1999");
  });

  it("does not call one duel an argument", () => {
    const many = Array.from({ length: 12 }, (_, i) => f("f" + i, { duels: i === 0 ? 1 : 0 }));
    expect(superlatives(many).map((s) => s.label)).not.toContain("Most argued over");
  });
});

// ── The badge you are nearly at (E3) ───────────────────────────────────────
//
// The trophy case shows what you have EARNED and nothing else, which makes it a
// record rather than an invitation — it can only tell you about your past. The
// thing that pulls is the one you are close to.
describe("nextUp", () => {
  const badge = (id: string, have: number, need: number, got = false): Achievement =>
    ({ id, name: id, how: id, got, have, need, progress: `${have} of ${need}` }) as Achievement;

  it("picks by fraction, not by how many are left", () => {
    // Ten short of 100 is 90% there; ten short of 500 is 98%. Picking by "ten
    // either way" would offer whichever happened to sort first.
    const out = nextUp([badge("small", 90, 100), badge("large", 490, 500)]);
    expect(out?.id).toBe("large");
  });

  it("ignores anything already earned", () => {
    expect(nextUp([badge("done", 100, 100, true)])).toBeNull();
  });

  it("ignores a badge you have not started", () => {
    // 0 of 1,000 is not something you are close to, and offering it would be
    // the app inventing an ambition on your behalf.
    expect(nextUp([badge("untouched", 0, 1000)])).toBeNull();
  });

  it("ignores the flag badges, which have no fraction", () => {
    const flagged = { id: "flag", name: "f", how: "f", got: false } as Achievement;
    expect(nextUp([flagged])).toBeNull();
  });

  it("returns null when there is nothing to aim at", () => {
    expect(nextUp([])).toBeNull();
  });

  it("carries the progress text through, so the caller prints one thing", () => {
    expect(nextUp([badge("x", 7, 10)])?.progress).toBe("7 of 10");
  });
});
