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
  mode: "koth",
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

  // A spotlight moves its subject before that film has earned anything, and
  // abandoning restores what it moved. Half of that, days later, is not a state
  // to come back to.
  it("refuses a spotlight", () => {
    expect(isResumable(session({ mode: "spotlight", subjectId: "a" }))).toBe(false);
  });
});
