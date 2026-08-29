// Dragging a row, as evidence rather than as a lock.
//
// The design is the user's: "the user deciding the item belongs in that position
// for the moment. Maybe not with a hard lock as that would be assumptive… it
// should count as one win if its within 10, then more the further it jumps.
// Same for going down."
//
// So the tests are about the CURRENCY. A drag has to produce the same kind of
// rows a duel produces, in a quantity that matches how hard the reader meant it,
// or it is either a shout or a whisper regardless of the gesture.

import { describe, expect, it } from "vitest";
import { judgementsForMove, ratingAfterMove, weightOf, MAX_MOVE_WEIGHT } from "@/lib/reorder";
import { seedScore } from "@/lib/tiers";
import type { Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, rating: Rating = 4): Film => ({
  id,
  title: id,
  rating,
  score: seedScore(rating),
});

/** A list of n films, best first, all one rating unless `at` says otherwise. */
const list = (n: number, at: Record<number, Rating> = {}): Film[] =>
  Array.from({ length: n }, (_, i) => film(`f${i}`, at[i] ?? 4));

describe("weightOf", () => {
  it("is one duel for a move within a screenful", () => {
    for (const d of [1, 5, 10]) expect(weightOf(d)).toBe(1);
  });

  it("grows with the distance, in both directions", () => {
    expect(weightOf(11)).toBe(2);
    expect(weightOf(25)).toBe(3);
    expect(weightOf(-25)).toBe(3);
  });

  it("is capped", () => {
    // A drag from the bottom of an 861-film library to the top would otherwise
    // write 86 judgements from one gesture — outweighing every real duel that
    // film ever fought, and impossible to undo by dragging it back.
    expect(weightOf(861)).toBe(MAX_MOVE_WEIGHT);
  });
});

describe("judgementsForMove", () => {
  it("records a win when a film is dragged up", () => {
    const js = judgementsForMove(list(20), 5, 3);
    // `a` is always the moved film, so the outcome reads directly. `f3` is the
    // row it came to rest ABOVE — the destination end, which is the claim that
    // actually places it.
    expect(js[0]).toMatchObject({ a: "f5", b: "f3", o: "a", m: "drag" });
  });

  it("also records the film it STOPPED under", () => {
    // The wins alone say "better than everything from here down" and never say
    // stop, so the model carries on upward. Seen on the first real run: a book
    // dropped at position 3 settled at position 1. One row the other way, against
    // the nearest film it did not pass, is what makes it land where the finger
    // did.
    const js = judgementsForMove(list(20), 5, 3);
    expect(js).toHaveLength(2);
    // Dropped at index 3, so f2 is the row it came to rest under.
    expect(js[1]).toMatchObject({ a: "f5", b: "f2", o: "b", m: "drag" });
  });

  it("records the stop the other way round when dragged down", () => {
    const js = judgementsForMove(list(20), 3, 5);
    expect(js[js.length - 1]).toMatchObject({ a: "f3", b: "f6", o: "a" });
  });

  it("has no stop at the very top of the list", () => {
    // Nothing above index 0 to have stopped under, so the claim is only the win.
    const js = judgementsForMove(list(20), 5, 0);
    expect(js.every((j) => j.o === "a")).toBe(true);
  });

  it("records a loss when a film is dragged down", () => {
    const js = judgementsForMove(list(20), 3, 5);
    expect(js[0]).toMatchObject({ a: "f3", o: "b", m: "drag" });
  });

  it("writes more duels the further it moves", () => {
    // The wins scale with distance; the single stop row rides along with each.
    const wins = (from: number, to: number) =>
      judgementsForMove(list(60), from, to).filter((j) => j.o === "a").length;
    expect(wins(50, 45)).toBe(1);
    expect(wins(50, 25)).toBe(3);
  });

  it("judges its WINS against films it actually passed", () => {
    // A move claims "I belong above all of these". Recording a win against a
    // film it never passed would be inventing a comparison. The one row it does
    // record about a film it did not pass is the stop, and that is a loss.
    const order = list(20);
    const js = judgementsForMove(order, 10, 4);
    const passed = new Set(order.slice(4, 10).map((f) => f.id));
    for (const j of js.filter((x) => x.o === "a")) expect(passed.has(j.b)).toBe(true);
  });

  it("always includes the film it came to rest above", () => {
    // The claim that PLACES something is the one nearest where it landed. This
    // ordering ran from the origin end once, and a six-row drag then recorded a
    // single win over the row it started beside — which said almost nothing and
    // left the book at the bottom of its new tier instead of where the finger
    // put it.
    const js = judgementsForMove(list(20), 10, 4);
    expect(js.map((j) => j.b)).toContain("f4");
  });

  it("spreads its picks across the span rather than bunching them", () => {
    // Taken from one end, a long drag would record the same lucky pairing
    // several times and say nothing about the reach of the move.
    const js = judgementsForMove(list(60), 50, 20);
    expect(new Set(js.map((j) => j.b)).size).toBe(js.length);
    // Landing AT index 20 means sitting on top of f20, so f20 is the far end
    // of the reach — not f21, which it merely also passed.
    expect(js.map((j) => j.b)).toContain("f20");
  });

  it("never judges a film against itself", () => {
    for (const j of judgementsForMove(list(30), 20, 2)) expect(j.a).not.toBe(j.b);
  });

  it("gives every row a distinct id, as the log requires", () => {
    const js = judgementsForMove(list(60), 50, 10);
    expect(new Set(js.map((j) => j.id)).size).toBe(js.length);
  });

  it("is empty for a move that goes nowhere", () => {
    expect(judgementsForMove(list(10), 4, 4)).toEqual([]);
  });

  it("is empty rather than throwing for an index off the end", () => {
    expect(judgementsForMove(list(10), 99, 2)).toEqual([]);
    expect(judgementsForMove(list(10), 2, -1)).toEqual([]);
  });
});

describe("ratingAfterMove", () => {
  it("takes the rating of where it landed", () => {
    // Drag a 3★ up AMONG the 4★s and it becomes a 4★ — the user's call, and the
    // only way a drag across a boundary can mean anything: bands do not overlap,
    // so a film that kept its 3★ would be re-scored straight back below them.
    const order = [film("a", 5), film("b", 4), film("c", 4), film("low", 3)];
    expect(ratingAfterMove(order, 3, 2)).toBe(4);
  });

  it("takes the HIGHER rating when dropped on a boundary", () => {
    // Dropped between the 5★ and the 4★s, it claims to beat every 4★ — so it
    // becomes a 5★. Taking the lower one would place it at the top of the 4★
    // band, below the film it was dropped above, and the drag would appear to
    // undo itself on the next respread.
    const order = [film("a", 5), film("b", 4), film("c", 4), film("low", 3)];
    expect(ratingAfterMove(order, 3, 1)).toBe(5);
  });

  it("gives the film ABOVE the tie", () => {
    // Dropping onto the boundary between a 4★ and a 3★ is a claim to be above
    // that 3★. Taking the lower rating would make the drop undo itself.
    const order = [film("a", 4), film("b", 3), film("mover", 5)];
    expect(ratingAfterMove(order, 2, 1)).toBe(4);
  });

  it("is undefined when the rating would not change", () => {
    // Nothing to write, so the caller has nothing to decide.
    expect(ratingAfterMove(list(10), 8, 2)).toBeUndefined();
  });

  it("is undefined for a move that goes nowhere", () => {
    expect(ratingAfterMove(list(10), 3, 3)).toBeUndefined();
  });

  it("reads the neighbours AFTER the film is lifted out", () => {
    // Otherwise "the row above" can be the moved film itself, and a drag would
    // read its own rating back and never change anything.
    const order = [film("top", 5), film("mover", 3), film("x", 4)];
    expect(ratingAfterMove(order, 1, 2)).toBe(4);
  });
});
