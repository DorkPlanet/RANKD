import { beforeEach, describe, expect, it, vi } from "vitest";

import { importBackup } from "@/lib/backup";

// A tiny localStorage, because this is the one module whose whole job is to
// write it and the failure being guarded here is destructive.
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

const LIBRARY = JSON.stringify([{ id: "a", title: "A", rating: 4, score: 7500 }]);

const file = (format: number, keys: Record<string, string>) =>
  JSON.stringify({ format, savedAt: "2026-08-15T00:00:00.000Z", keys });

describe("importBackup", () => {
  it("restores the library", () => {
    const out = importBackup(file(2, { "rankd-app-v1": LIBRARY }));
    expect(out.films).toBe(1);
    expect(store.get("rankd-app-v1")).toBe(LIBRARY);
  });

  it("still reads format 1, so files already saved are not stranded", () => {
    expect(() => importBackup(file(1, { "rankd-app-v1": LIBRARY }))).not.toThrow();
  });

  it("refuses a format it does not know", () => {
    expect(() => importBackup(file(99, { "rankd-app-v1": LIBRARY }))).toThrow(/format 99/);
  });
});

// ── The trap this file exists for ──────────────────────────────────────────
//
// The restore loop clears any key it owns that the file does not carry, which is
// correct — a restore replaces state wholesale. It becomes destructive the
// moment a key is added, because a backup written before that key existed cannot
// mention it, and its absence would read as "delete this".
describe("restoring an OLD backup", () => {
  it("does not delete saved rankings the file never knew about", () => {
    store.set("rankd-lists-v1", JSON.stringify({ v: 2, lists: [{ id: "x" }] }));
    importBackup(file(1, { "rankd-app-v1": LIBRARY }));
    expect(store.get("rankd-lists-v1")).toBeDefined();
  });

  it("leaves the tour flag and review dismissals alone too", () => {
    store.set("rankd-tour-v1", '["duel"]');
    store.set("rankd-review-dismissed-v1", "[1]");
    importBackup(file(1, { "rankd-app-v1": LIBRARY }));
    expect(store.get("rankd-tour-v1")).toBe('["duel"]');
    expect(store.get("rankd-review-dismissed-v1")).toBe("[1]");
  });

  // The wholesale-replace rule still holds for the keys that format DID own.
  it("still clears a key its own format owned and omitted", () => {
    store.set("rankd-profile-v1", '{"name":"Old"}');
    importBackup(file(1, { "rankd-app-v1": LIBRARY }));
    expect(store.get("rankd-profile-v1")).toBeUndefined();
  });
});

describe("restoring a current backup", () => {
  it("clears saved rankings when the file deliberately has none", () => {
    store.set("rankd-lists-v1", JSON.stringify({ v: 2, lists: [{ id: "x" }] }));
    importBackup(file(2, { "rankd-app-v1": LIBRARY }));
    expect(store.get("rankd-lists-v1")).toBeUndefined();
  });

  it("carries saved rankings back in", () => {
    const lists = JSON.stringify({ v: 2, lists: [{ id: "x", name: "Villeneuve" }] });
    importBackup(file(2, { "rankd-app-v1": LIBRARY, "rankd-lists-v1": lists }));
    expect(store.get("rankd-lists-v1")).toBe(lists);
  });
});
