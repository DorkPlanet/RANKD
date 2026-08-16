import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { wipeAccount, wipeEverything } from "@/lib/reset";
import { saveFilms } from "@/lib/store";
import { isWiped, resetWipedForTests } from "@/lib/wiped";
import type { Film } from "@/lib/types";

// "Delete everything and start fresh" used to undo itself. Two separate causes,
// and this file is one test per cause plus the contract that keeps them fixed.
//
// The suite stubs storage rather than running in jsdom, on the same reasoning as
// the rest of `test/`: what is being checked is which keys go and which writes
// are refused, and neither needs a document.

class FakeStorage {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

let local: FakeStorage;
let session: FakeStorage;

beforeEach(() => {
  resetWipedForTests();
  local = new FakeStorage();
  session = new FakeStorage();
  // `Object.keys(localStorage)` is what the sweep iterates, so the stub has to
  // expose its entries as own properties the way the real one does.
  const asObject = (s: FakeStorage) =>
    new Proxy(s, {
      ownKeys: () => [...s.map.keys()],
      getOwnPropertyDescriptor: (t, k) =>
        typeof k === "string" && s.map.has(k)
          ? { value: s.map.get(k), enumerable: true, configurable: true }
          : Object.getOwnPropertyDescriptor(t, k),
    });
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", asObject(local));
  vi.stubGlobal("sessionStorage", asObject(session));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetWipedForTests();
});

describe("wipeEverything", () => {
  it("takes every rankd- key and leaves other apps on the origin alone", () => {
    local.setItem("rankd-app-v1", "[]");
    local.setItem("rankd-log-v1", "[]");
    local.setItem("rankd-sync-v1", "{}");
    local.setItem("someone-elses-key", "keep me");

    wipeEverything();

    expect(local.getItem("rankd-app-v1")).toBeNull();
    expect(local.getItem("rankd-log-v1")).toBeNull();
    expect(local.getItem("rankd-sync-v1")).toBeNull();
    expect(local.getItem("someone-elses-key")).toBe("keep me");
  });

  // Only the first of these was cleared. `visit.ts` reads its own and returns
  // the existing recap early, so leaving it meant the freshly emptied browser
  // never opened a first sitting in the tab that had just wiped it.
  it("clears BOTH per-tab sittings", () => {
    session.setItem("rankd-sitting-v1", "{}");
    session.setItem("rankd-visit-sitting-v1", "1");

    wipeEverything();

    expect(session.getItem("rankd-sitting-v1")).toBeNull();
    expect(session.getItem("rankd-visit-sitting-v1")).toBeNull();
  });

  it("raises the flag", () => {
    expect(isWiped()).toBe(false);
    wipeEverything();
    expect(isWiped()).toBe(true);
  });
});

// The second cause. `location.reload()` does not stop the page: the credits
// sweep and the duel screen's poster backfill both resolve afterwards holding
// the PRE-wipe library, and both write it straight back through `saveFilms`.
describe("writes after a wipe", () => {
  const film = (): Film => ({ id: "heat", title: "Heat", rating: 4, score: 7500 });

  it("saveFilms refuses to refill the library it just deleted", () => {
    saveFilms([film()]);
    expect(local.getItem("rankd-app-v1")).not.toBeNull();

    wipeEverything();
    saveFilms([film()]);

    expect(local.getItem("rankd-app-v1")).toBeNull();
  });

  it("and the refusal does not re-create the sync bookkeeping either", () => {
    wipeEverything();
    saveFilms([film()]);
    // `markDirty` would write this, telling the next reconciliation that a
    // browser holding nothing has unsynced work to push.
    expect(local.getItem("rankd-sync-v1")).toBeNull();
  });
});

describe("wipeAccount", () => {
  const ok = () => ({ ok: true, status: 200 }) as Response;
  const status = (n: number) => ({ ok: false, status: n }) as Response;

  it("deletes the library row and every saved list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);

    await wipeAccount();

    const called = fetchMock.mock.calls.map((c) => `${c[1].method} ${c[0]}`);
    expect(called).toContain("DELETE /api/library");
    // `?all=1`, never an empty id list — see the route.
    expect(called).toContain("DELETE /api/lists?all=1");
  });

  // Nobody is signed in, so there is no account copy and the local wipe is the
  // whole job. Treating this as a failure would make the button unusable for
  // every signed-out user, which is most of them.
  it("treats a 401 as nothing to do", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(401)));
    await expect(wipeAccount()).resolves.toBeUndefined();
  });

  // The caller must not wipe locally after this. A browser emptied while the
  // mirror survives is exactly the state that restores itself on reload.
  it("throws when the server could not be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(500)));
    await expect(wipeAccount()).rejects.toThrow();
  });
});
