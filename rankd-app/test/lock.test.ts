import { describe, expect, it } from "vitest";

import { isHard, isPlaced, isSoft, migrateLock } from "@/lib/lock";
import type { Film } from "@/lib/types";

const film = (over: Partial<Film> & { confirmed?: boolean } = {}): Film & { confirmed?: boolean } => ({
  id: "f",
  title: "F",
  rating: 4,
  score: 7500,
  ...over,
});

describe("reading a lock", () => {
  it("treats both kinds as placed — both earn a number", () => {
    expect(isPlaced(film({ lock: "hard" }))).toBe(true);
    expect(isPlaced(film({ lock: "soft" }))).toBe(true);
    expect(isPlaced(film())).toBe(false);
  });

  it("keeps the two kinds distinct", () => {
    expect(isHard(film({ lock: "hard" }))).toBe(true);
    expect(isHard(film({ lock: "soft" }))).toBe(false);
    expect(isSoft(film({ lock: "soft" }))).toBe(true);
    expect(isSoft(film({ lock: "hard" }))).toBe(false);
  });

  it("reads an unplaced film as neither", () => {
    expect(isHard(film())).toBe(false);
    expect(isSoft(film())).toBe(false);
  });
});

// This runs against every library anyone has already saved, so it is the one
// piece of this change that can destroy real work if it is wrong.
describe("migrating a library saved before locks existed", () => {
  it("reads a legacy confirmed film as HARD", () => {
    // Auto-placement did not exist when these were written, so a `confirmed`
    // flag could only ever have been a user's own confirm.
    expect(migrateLock(film({ confirmed: true })).lock).toBe("hard");
  });

  it("leaves a legacy unconfirmed film unplaced", () => {
    expect(migrateLock(film({ confirmed: false })).lock).toBeUndefined();
    expect(migrateLock(film()).lock).toBeUndefined();
  });

  it("drops the legacy flag so nothing downstream can read it by accident", () => {
    const migrated = migrateLock(film({ confirmed: true })) as Film & { confirmed?: boolean };
    expect(migrated.confirmed).toBeUndefined();
    expect("confirmed" in migrated).toBe(false);
  });

  it("never overwrites a lock that is already there", () => {
    expect(migrateLock(film({ lock: "soft", confirmed: true })).lock).toBe("soft");
    expect(migrateLock(film({ lock: "hard" })).lock).toBe("hard");
  });

  it("is idempotent — migrating twice changes nothing", () => {
    const once = migrateLock(film({ confirmed: true }));
    expect(migrateLock(once)).toEqual(once);
  });

  it("preserves everything else about the film", () => {
    const before = film({ confirmed: true, title: "Heat", year: "1995", duels: 12, score: 7777 });
    const after = migrateLock(before);
    expect(after).toMatchObject({ id: "f", title: "Heat", year: "1995", duels: 12, score: 7777 });
  });
});
