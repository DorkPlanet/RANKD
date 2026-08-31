import { describe, expect, it } from "vitest";

import { resolveSteps, TOURS, type TourStep } from "@/lib/tour";

const ALL = [...TOURS().duel, ...TOURS().list];

describe("the tours", () => {
  it("teaches the core loop before Rough Cut", () => {
    // Rough Cut comes last on purpose: it is the escape hatch from a tier too
    // big to duel, and it only means anything once you know what a duel costs.
    expect(TOURS().duel.map((s) => s.id)).toEqual([
      "pick",
      "flick",
      "hold",
      "strip",
      "strip-acts",
      "roughcut",
    ]);
  });

  // The duel is where the game is. If the list ever grew longer than the duel's
  // pass, the teaching would be pointed at the wrong screen.
  it("gives the duel more teaching than the list", () => {
    expect(TOURS().duel.length).toBeGreaterThan(TOURS().list.length);
  });

  it("gives every step something to point at and something to say", () => {
    for (const s of ALL) {
      expect(s.target).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.body.length).toBeGreaterThan(20);
    }
  });

  it("has no duplicate ids within a tour, so a step counter cannot lie", () => {
    for (const steps of Object.values(TOURS())) {
      expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    }
  });

  // The app records a PREFERENCE, not a verdict. "Which is better" asserts a
  // fact about the films; the library is an account of what one person would
  // rather watch, and the first thing a new user reads must not miscast the
  // question they are about to answer several thousand times.
  it("asks which film you prefer, never which is better", () => {
    const pick = TOURS().duel.find((s) => s.id === "pick")!;
    expect(pick.title).toMatch(/prefer/i);
    expect(pick.body).toMatch(/rather watch/i);
  });

  // Em dashes are the house tell of machine-written copy, and this is the first
  // text a new user reads. Applies to every step of every tour.
  it("uses no em dashes anywhere in the copy", () => {
    for (const s of ALL) {
      expect(s.title).not.toContain("—");
      expect(s.body).not.toContain("—");
    }
  });

  // "Flick up" alone teaches a motion. Where the card lands is the part nobody
  // can guess, and that it is NOT a duel is what keeps the log honest.
  it("says where a flicked card lands, and that it records nothing", () => {
    const flick = TOURS().duel.find((s) => s.id === "flick")!;
    expect(flick.body).toMatch(/top/i);
    expect(flick.body).toMatch(/bottom/i);
    expect(flick.body).toMatch(/no duel .{0,8}recorded/i);
  });

  // The list tour exists for exactly one idea: a rating is not a position.
  //
  // This used to assert it on the UN-RNKD step alone, which is precisely the
  // step `resolveSteps` is allowed to drop — so the idea was guarded on the one
  // surface where it could vanish, and the reader who had finished ranking a
  // tier never met it. It is now stated on "row", which points at the list and
  // can never be absent.
  it("explains that rated is not ranked on a step that always fires", () => {
    const row = TOURS().list.find((s) => s.id === "row")!;
    expect(row.body).toMatch(/tier/i);
    expect(row.body).toMatch(/position/i);
  });

  it("still elaborates on UN-RNKD when that divider is there", () => {
    const unrnkd = TOURS().list.find((s) => s.id === "unrnkd")!;
    expect(unrnkd.body).toMatch(/rated/i);
    expect(unrnkd.body).toMatch(/position/i);
  });
});

describe("resolveSteps", () => {
  const steps: TourStep[] = [
    { id: "a", target: "card", title: "A", body: "aaa" },
    { id: "b", target: "strip", title: "B", body: "bbb" },
    { id: "c", target: "rank", title: "C", body: "ccc" },
  ];

  it("keeps every step whose target is on screen, in order", () => {
    expect(resolveSteps(() => true, steps).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  // A spotlight on an absent element lands in a corner and explains a control
  // the reader cannot see, which is worse than not mentioning it.
  it("drops a step whose target is missing", () => {
    expect(resolveSteps((t) => t !== "strip", steps).map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("returns nothing when nothing is on screen, so the caller can bail", () => {
    expect(resolveSteps(() => false, steps)).toEqual([]);
  });

  // Both of these are real conditions rather than defensive ones: the strip is
  // part of the duel screen and not every mode renders it, and the UN-RNKD
  // divider only exists while a tier still has unplaced films in it.
  it("still runs the duel gestures when the strip is missing", () => {
    const out = resolveSteps((t) => t !== "strip", TOURS().duel);
    expect(out.map((s) => s.id)).toEqual(["pick", "flick", "hold", "roughcut"]);
  });

  it("drops the UN-RNKD step for someone who has finished ranking", () => {
    const out = resolveSteps((t) => t !== "list-unrnkd", TOURS().list);
    expect(out.map((s) => s.id)).toEqual(["row", "jump"]);
  });

  // The regression that mattered: dropping a step must never drop the idea.
  it("still teaches that a rating is not a position with no UN-RNKD divider", () => {
    const out = resolveSteps((t) => t !== "list-unrnkd", TOURS().list);
    const bodies = out.map((s) => s.body).join(" ");
    expect(bodies).toMatch(/tier/i);
    expect(bodies).toMatch(/position/i);
  });
});
