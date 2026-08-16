import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_PREFS, loadPrefs, savePrefs } from "@/lib/prefs";
import { FILE_KEYS_BY_FORMAT, SYNC_KEYS } from "@/lib/backupFormat";

// Same standing-up as lists.test.ts: the module guards on `typeof window` and
// the round trip through JSON is part of what is being tested.
beforeEach(() => {
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = {};
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe("prefs", () => {
  it("drifts by default — the behaviour the list has always had", () => {
    expect(loadPrefs().listDrift).toBe(true);
  });

  it("survives a reload", () => {
    savePrefs({ ...DEFAULT_PREFS, listDrift: false });
    expect(loadPrefs().listDrift).toBe(false);
  });

  it("treats corrupt storage as the defaults", () => {
    localStorage.setItem("rankd-prefs-v1", "{not json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  // The reason `loadPrefs` reads field by field instead of spreading: the string
  // "false" is truthy, so a spread would show the toggle ON while storage says
  // off. A value written by an older build, or a half-applied restore, can
  // produce exactly this.
  it("ignores a non-boolean rather than trusting it", () => {
    localStorage.setItem("rankd-prefs-v1", JSON.stringify({ listDrift: "false" }));
    expect(loadPrefs().listDrift).toBe(true);
  });

  it("fills in a field the stored object does not have", () => {
    localStorage.setItem("rankd-prefs-v1", JSON.stringify({}));
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});

describe("backup key sets", () => {
  it("carries preferences on the wire, so they follow you to another device", () => {
    expect(SYNC_KEYS).toContain("rankd-prefs-v1");
  });

  // Format 1 is frozen history. It used to be an alias of SYNC_KEYS, so every
  // key added for sync was retroactively declared "owned" by it — and ownership
  // is what lets a restore CLEAR a key. Restoring an old format-1 file would
  // have deleted a preference that file never knew about.
  it("does not let format 1 claim keys it never carried", () => {
    expect(FILE_KEYS_BY_FORMAT[1]).not.toContain("rankd-prefs-v1");
    expect(FILE_KEYS_BY_FORMAT[2]).toContain("rankd-prefs-v1");
  });
});
