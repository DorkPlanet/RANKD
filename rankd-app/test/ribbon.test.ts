// The ribbon: what is next door, and what counts as a swipe.

import { describe, expect, it } from "vitest";

import { pageAfterSwipe, RIBBON, stepScreen, TURN_AT } from "@/lib/ribbon";

describe("stepScreen", () => {
  it("walks the ribbon in bottom-bar order", () => {
    expect(stepScreen("list", 1)).toBe("duel");
    expect(stepScreen("duel", 1)).toBe("profile");
    expect(stepScreen("profile", -1)).toBe("duel");
    expect(stepScreen("duel", -1)).toBe("list");
  });

  it("stops at both ends rather than wrapping", () => {
    // A ribbon that looped would jump from the list to the profile, which reads
    // as the app teleporting and leaves no way to feel where you are.
    expect(stepScreen("list", -1)).toBeNull();
    expect(stepScreen("profile", 1)).toBeNull();
  });

  it("has the duel in the middle, because the bottom bar does", () => {
    expect(RIBBON[Math.floor(RIBBON.length / 2)]).toBe("duel");
  });
});

describe("pageAfterSwipe", () => {
  const W = 400;
  const far = -W * TURN_AT - 1; // just past the turn, leftward
  const back = W * TURN_AT + 1;

  it("holds the page when the swipe was too short", () => {
    expect(pageAfterSwipe(1, 3, -W * TURN_AT, W)).toBe(1);
    expect(pageAfterSwipe(1, 3, 0, W)).toBe(1);
  });

  it("turns forward and back once the swipe is long enough", () => {
    expect(pageAfterSwipe(1, 3, far, W)).toBe(2);
    expect(pageAfterSwipe(1, 3, back, W)).toBe(0);
  });

  it("reports running off each end, rather than clamping", () => {
    // Clamping is what absorbed the gesture before. Naming the overshoot is what
    // lets the caller hand it to `stepScreen`.
    expect(pageAfterSwipe(3, 3, far, W)).toBe("after");
    expect(pageAfterSwipe(0, 3, back, W)).toBe("before");
  });

  it("treats a single-page screen as both ends at once", () => {
    expect(pageAfterSwipe(0, 0, far, W)).toBe("after");
    expect(pageAfterSwipe(0, 0, back, W)).toBe("before");
  });
});

describe("the chrome holds still", () => {
  it("offsets each bar by exactly the inverse of the page", () => {
    // The whole trick, and the thing that breaks silently if either sign flips:
    // the bars sit INSIDE the screen that moves, so they only look pinned while
    // their offset is the negation of the page's.
    const page = 137;
    const bar = -page;
    expect(page + bar).toBe(0);
  });
});

describe("landing on the far page", () => {
  it("puts you next to where you came from", () => {
    // Walking back into the list from the game should land on the state nearest
    // the game — the last one — not throw you to the far end of the screen.
    const states = ["films", "locked", "shuffled", "unrnkd"];
    const fromRight = states[states.length - 1];
    expect(fromRight).toBe("unrnkd");
    // And a swipe onward from there leaves the screen rather than wrapping.
    expect(pageAfterSwipe(states.length - 1, states.length - 1, -1000, 400)).toBe("after");
  });
});
