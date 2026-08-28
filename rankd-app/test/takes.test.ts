// Takes — the tags and note somebody chose to publish.

import { describe, expect, it } from "vitest";

import {
  canTake,
  hasSubstance,
  isPublished,
  MIN_TAKE_MOVE,
  movedSince,
  takesFrom,
} from "@/lib/social/takes";
import { cleanScene, SCENE_MAX } from "@/lib/tags";
import { seedScore } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id.toUpperCase(),
  rating: 4,
  score: seedScore(4),
  lock: "hard",
  ...over,
});

describe("hasSubstance", () => {
  it("is false for a lock nobody said anything about", () => {
    expect(hasSubstance(film("heat"))).toBe(false);
  });

  it("counts a tag alone, and a note alone", () => {
    expect(hasSubstance(film("heat", { tags: ["Score"] }))).toBe(true);
    expect(hasSubstance(film("heat", { note: "the diner" }))).toBe(true);
  });

  it("does not count tags that are not tags", () => {
    expect(hasSubstance(film("heat", { tags: ["Vibes"] }))).toBe(false);
  });

  it("does not count whitespace as a note", () => {
    expect(hasSubstance(film("heat", { note: "   " }))).toBe(false);
  });
});

describe("canTake", () => {
  it("needs a hard lock — the model's own placement is not a commitment", () => {
    expect(canTake(film("heat", { lock: "soft", tags: ["Score"] }))).toBe(false);
    expect(canTake(film("heat", { lock: undefined, tags: ["Score"] }))).toBe(false);
    expect(canTake(film("heat", { tags: ["Score"] }))).toBe(true);
  });

  it("needs something said, so an empty take cannot be published", () => {
    expect(canTake(film("heat"))).toBe(false);
  });
});

describe("takesFrom", () => {
  it("publishes nothing until somebody has chosen to", () => {
    // The whole privacy promise: tagged is not published.
    expect(takesFrom([film("heat", { tags: ["Score"] })])).toEqual([]);
  });

  it("carries the rank it was written at AND the rank it holds now", () => {
    const ranked = [
      film("collateral"),
      film("heat", { tags: ["Score"], note: "the diner", take: { at: 1, rank: 12 } }),
    ];
    const [take] = takesFrom(ranked);
    expect(take.w).toBe(12);
    // Second in the array, so second in the order. 1-based, as people see it.
    expect(take.r).toBe(2);
    expect(take.g).toEqual(["Score"]);
    expect(take.n).toBe("the diner");
  });

  it("survives its film being unlocked, because the move is the point", () => {
    const ranked = [film("heat", { lock: "soft", tags: ["Score"], take: { at: 1, rank: 3 } })];
    expect(takesFrom(ranked)).toHaveLength(1);
  });

  it("drops a published film that has since been emptied of everything it said", () => {
    const ranked = [film("heat", { take: { at: 1, rank: 3 } })];
    expect(takesFrom(ranked)).toEqual([]);
  });

  it("omits absent fields rather than sending undefined over the wire", () => {
    const [take] = takesFrom([film("heat", { tags: ["Score"], take: { at: 1, rank: 1 } })]);
    expect("n" in take).toBe(false);
    expect("y" in take).toBe(false);
    expect("p" in take).toBe(false);
  });
});

describe("movedSince", () => {
  it("says nothing about a film that has barely drifted", () => {
    expect(movedSince({ w: 3, r: 3 })).toBeNull();
    expect(movedSince({ w: 3, r: 3 + MIN_TAKE_MOVE - 1 })).toBeNull();
  });

  it("reports a real move in both directions", () => {
    expect(movedSince({ w: 3, r: 40 })).toEqual({ from: 3, to: 40 });
    expect(movedSince({ w: 40, r: 3 })).toEqual({ from: 40, to: 3 });
  });
});

describe("isPublished", () => {
  it("is the presence of the marker, nothing else", () => {
    expect(isPublished(film("heat", { tags: ["Score"] }))).toBe(false);
    expect(isPublished(film("heat", { take: { at: 1, rank: 1 } }))).toBe(true);
  });
});

describe("the scene and its spoiler flag", () => {
  it("is enough on its own to be worth publishing", () => {
    expect(hasSubstance(film("heat", { scene: "the diner" }))).toBe(true);
    expect(canTake(film("heat", { scene: "the diner" }))).toBe(true);
  });

  it("travels with the take", () => {
    const [take] = takesFrom([
      film("heat", { scene: "the diner", spoiler: true, take: { at: 1, rank: 1 } }),
    ]);
    expect(take.c).toBe("the diner");
    expect(take.x).toBe(true);
  });

  it("does not warn about nothing when there is nothing to hide", () => {
    // A spoiler flag with no words behind it is a warning about an empty box.
    const [take] = takesFrom([
      film("heat", { tags: ["Score"], spoiler: true, take: { at: 1, rank: 1 } }),
    ]);
    expect("x" in take).toBe(false);
  });

  it("is left off entirely when the film is not marked", () => {
    const [take] = takesFrom([film("heat", { scene: "the diner", take: { at: 1, rank: 1 } })]);
    expect("x" in take).toBe(false);
  });
});

describe("cleanScene", () => {
  it("collapses runs of whitespace and does not eat letters", () => {
    // Regression: the regex shipped as /s+/g rather than /\s+/g, which replaced
    // every literal "s" with a space. "just" became "ju t" and nothing caught it
    // because the field was still non-empty and still under the cap.
    expect(cleanScene("the diner,  both of them   just talking")).toBe(
      "the diner, both of them just talking",
    );
    expect(cleanScene("sssss")).toBe("sssss");
  });

  it("is undefined for nothing and for whitespace", () => {
    expect(cleanScene(undefined)).toBeUndefined();
    expect(cleanScene("   ")).toBeUndefined();
  });

  it("caps at SCENE_MAX", () => {
    expect(cleanScene("x".repeat(SCENE_MAX + 20))).toHaveLength(SCENE_MAX);
  });
});
