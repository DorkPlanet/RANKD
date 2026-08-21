import { describe, expect, it } from "vitest";

import { MAX_PINNED_PEOPLE, personKey, topPeople } from "@/lib/profile";
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
