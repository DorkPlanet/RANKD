import { describe, expect, it } from "vitest";

import { isResumable } from "@/lib/runs";
import type { PlacementSession } from "@/lib/types";

const session = (over: Partial<PlacementSession> = {}): PlacementSession => ({
  tier: 3,
  spanBelow: 0,
  spanAbove: 0,
  confirmed: [],
  unconfirmed: ["a", "b", "c"],
  contenderId: "c",
  challengerId: "b",
  needsConfirm: false,
  ...over,
});

describe("isResumable", () => {
  it("keeps a plain tier climb", () => {
    expect(isResumable(session())).toBe(true);
  });

  it("keeps nothing when there is no session", () => {
    expect(isResumable(null)).toBe(false);
  });

  // A curated run can borrow films that are in no library, so its ids are not
  // enough to rebuild it. `crossTier` is the flag those runs carry.
  it("refuses a curated run, whose guests exist nowhere else", () => {
    expect(isResumable(session({ crossTier: true }))).toBe(false);
  });

  // A promotion attempt is three duels against a neighbouring tier, and the
  // climb it interrupted is held on `resumeAfter`. `saveRun` stores that climb
  // instead, so what gets resumed is the hour of work rather than the minute.
  it("refuses a promotion attempt", () => {
    expect(isResumable(session({ promotionQueue: ["x", "y"] }))).toBe(false);
  });
});
