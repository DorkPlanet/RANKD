import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncNow, startSync } from "@/lib/sync";
import { isDirty, markDirty } from "@/lib/syncState";

// A push that fails has to come BACK for the work.
//
// It used to return with a comment saying the next tick would retry, and there
// was no next tick: `schedule` is armed from `notify`, and `markDirty` only
// notifies on the clean→dirty transition, so an already-dirty browser generates
// no further notifications however many more duels are fought. One failed
// request stranded the session until the tab was backgrounded or the app
// reopened.
//
// These assert on `isDirty()`, never on a returned string. `falseConflict`
// showed why: an outcome can report success while the browser stays dirty,
// which is exactly the bug that hid for three fixes.

const LOG = JSON.stringify({ v: 1, f: [], r: [] });
const store = new Map<string, string>();

beforeEach(() => {
  vi.useFakeTimers();
  store.clear();
  store.set("rankd-app-v1", JSON.stringify([{ id: "heat", title: "Heat", rating: 5, score: 9000 }]));
  store.set("rankd-log-v1", LOG);
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { addEventListener: () => {}, visibilityState: "visible" });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ok = () => ({ ok: true, status: 200, json: async () => ({ updatedAt: new Date().toISOString() }) }) as Response;
const dead = () => ({ ok: false, status: 503, json: async () => ({}) }) as Response;

describe("a push that fails", () => {
  it("comes back for the work rather than stranding it", async () => {
    // One failure, then success. Without a retry the browser stays dirty
    // forever, because nothing else will ever arm the timer.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(dead())
      .mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);

    startSync();
    markDirty();
    expect(isDirty()).toBe(true);

    await syncNow();
    expect(isDirty()).toBe(true); // the failure left it unsent, correctly

    // The retry is armed on a timer, so let it come around.
    await vi.advanceTimersByTimeAsync(11_000);
    await vi.runOnlyPendingTimersAsync();

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(isDirty()).toBe(false);
  });

  it("keeps the local write regardless — nothing is lost to a bad connection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    startSync();
    markDirty();
    await syncNow();

    expect(store.get("rankd-app-v1")).toContain("heat");
    expect(isDirty()).toBe(true);
  });
});
