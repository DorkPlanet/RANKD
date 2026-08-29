import { describe, expect, it } from "vitest";

import { BackupError, FORMAT, parseBackup, validateBackup } from "@/lib/backupFormat";

// This validator now guards two doors: a file the user picked, and a payload
// arriving over the network. A rejection it gets wrong on either side is a
// corrupt library nobody notices, so the rejections are the point of these
// tests rather than the happy path.

const film = { id: "heat-1995", rating: 5, score: 1200 };

function payload(over: Partial<Record<string, string>> = {}) {
  return {
    format: FORMAT,
    savedAt: "2026-08-13T10:00:00.000Z",
    keys: { "rankd-app-v1": JSON.stringify([film]), ...over },
  };
}

const log = (rows: unknown[]) => JSON.stringify({ v: 1, f: ["heat-1995", "collateral-2004"], r: rows });

describe("validateBackup", () => {
  it("accepts a minimal library and counts it", () => {
    const { summary } = validateBackup(payload());
    expect(summary).toEqual({ films: 1, books: 0, judgements: 0, hadProfile: false });
  });

  it("counts the evidence log and notices a profile", () => {
    const { summary } = validateBackup(
      payload({
        "rankd-log-v1": log([["j1", 0, 1, "a", "k", 1], ["j2", 1, 0, "b", "k", 2]]),
        "rankd-profile-v1": JSON.stringify({ name: "You", bio: "" }),
      }),
    );
    expect(summary).toEqual({ films: 1, books: 0, judgements: 2, hadProfile: true });
  });

  it("returns the payload unchanged so the caller can store it verbatim", () => {
    const p = payload();
    expect(validateBackup(p).backup).toEqual(p);
  });

  it.each([
    ["null", null],
    ["a string", "not a backup"],
    ["an object with no keys", { format: FORMAT, savedAt: "x" }],
  ])("rejects %s", (_label, value) => {
    expect(() => validateBackup(value)).toThrow(BackupError);
  });

  it("rejects a format it does not read", () => {
    expect(() => validateBackup({ ...payload(), format: 99 })).toThrow(/format 99/);
  });

  it("rejects a payload with no library in it", () => {
    expect(() => validateBackup({ format: FORMAT, savedAt: "x", keys: {} })).toThrow(/no library/);
  });

  it("rejects a corrupt library", () => {
    expect(() => validateBackup(payload({ "rankd-app-v1": "{{{" }))).toThrow(/corrupt/);
  });

  it("rejects an empty library", () => {
    expect(() => validateBackup(payload({ "rankd-app-v1": "[]" }))).toThrow(/empty/);
  });

  // The check that matters most: a film without a score is a film the ladder
  // cannot place, and storing one would break the list rather than the import.
  it("rejects films missing an id, rating or score", () => {
    expect(() =>
      validateBackup(payload({ "rankd-app-v1": JSON.stringify([film, { id: "x", rating: 4 }]) })),
    ).toThrow(/id, rating or score/);
  });

  it("rejects a log in a shape this version cannot read", () => {
    expect(() => validateBackup(payload({ "rankd-log-v1": JSON.stringify({ v: 2, f: [], r: [] }) }))).toThrow(
      /isn't in a format/,
    );
  });

  // A backup written before the log existed is still a perfectly good backup.
  it("accepts a payload with no log at all", () => {
    expect(validateBackup(payload()).summary.judgements).toBe(0);
  });
});

describe("parseBackup", () => {
  it("reads a file's text", () => {
    expect(parseBackup(JSON.stringify(payload())).summary.films).toBe(1);
  });

  it("rejects text that isn't JSON", () => {
    expect(() => parseBackup("not json")).toThrow(/valid JSON/);
  });
});
