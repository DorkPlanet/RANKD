// The medium decides which store every per-medium module reads. Getting this
// wrong does not produce an error — it produces the wrong library, silently.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fresh module instance over a fresh storage.
 *
 * `currentMedium` caches its answer for the life of the document, deliberately
 * (see the header of lib/medium.ts), so every case that starts from a different
 * stored value needs the module re-imported rather than merely re-called.
 */
async function load(stored?: string) {
  vi.resetModules();
  const store = new Map<string, string>();
  if (stored !== undefined) store.set("rankd-medium-v1", stored);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  // `setMedium` fades the page before it reloads, so it needs a document to put
  // the class on and a timer to fire the navigation. Stubbed rather than mocked
  // away: the fade is part of the contract now — see the tests below.
  const root = { dataset: {} as Record<string, string>, classList: { add: vi.fn() } };
  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("window", {
    localStorage: {},
    location: { reload: vi.fn() },
    // Fires immediately, so a test does not have to wait out the fade.
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
  });
  return { mod: await import("@/lib/medium"), store, root };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("currentMedium", () => {
  it("is film when nothing is stored", async () => {
    const { mod } = await load();
    expect(mod.currentMedium()).toBe("film");
  });

  it("reads a stored medium", async () => {
    const { mod } = await load("book");
    expect(mod.currentMedium()).toBe("book");
  });

  it("falls back to film on a value it does not recognise", async () => {
    // Total, and film-ward on purpose: film is the medium that already has data,
    // so answering "book" to a bad read would show an empty library to somebody
    // with 861 films in it.
    const { mod } = await load("vinyl");
    expect(mod.currentMedium()).toBe("film");
  });

  it("falls back to film when storage throws", async () => {
    vi.resetModules();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("disabled");
      },
    });
    vi.stubGlobal("window", {});
    const mod = await import("@/lib/medium");
    expect(mod.currentMedium()).toBe("film");
  });
});

describe("keyFor", () => {
  it("leaves the film keys exactly as they were", async () => {
    // Load-bearing, not cosmetic. Every device already holding a library keeps
    // it byte-for-byte, and there is nothing to migrate.
    const { mod } = await load("film");
    expect(mod.keyFor("rankd-app-v1")).toBe("rankd-app-v1");
    expect(mod.keyFor("rankd-log-v1")).toBe("rankd-log-v1");
  });

  it("suffixes every other medium", async () => {
    const { mod } = await load("book");
    expect(mod.keyFor("rankd-app-v1")).toBe("rankd-app-v1:book");
  });

  it("keeps the rankd- prefix, so a wipe still reaches it", async () => {
    // `wipeEverything` sweeps by that prefix, and the file backup's own notes
    // rely on it too. A suffixed key that lost the prefix would survive a wipe.
    const { mod } = await load("book");
    for (const k of mod.allKeysFor("rankd-app-v1")) expect(k.startsWith("rankd-")).toBe(true);
  });
});

describe("allKeysFor", () => {
  it("names every medium's key, film first and unsuffixed", async () => {
    const { mod } = await load("book");
    expect(mod.allKeysFor("rankd-app-v1")).toEqual(["rankd-app-v1", "rankd-app-v1:book"]);
  });

  it("agrees with keyFor about whichever medium is active", async () => {
    // The two state the same rule and are used in different places — the stores
    // call `keyFor`, sync and backup call `allKeysFor`. If they ever disagreed,
    // a library would sync to a key nothing reads.
    for (const m of ["film", "book"] as const) {
      const { mod } = await load(m);
      expect(mod.allKeysFor("rankd-app-v1")).toContain(mod.keyFor("rankd-app-v1"));
    }
  });
});

describe("setMedium", () => {
  it("stores the choice and reloads", async () => {
    const { mod, store } = await load("film");
    mod.setMedium("book");
    expect(store.get("rankd-medium-v1")).toBe("book");
    expect(window.location.reload).toHaveBeenCalled();
  });

  it("fades the page out before the reload, on the medium being opened", async () => {
    // Both halves matter. The class is what covers the navigation, and the
    // attribute is what the fade lands ON — set now rather than after the
    // reload, so the page fades to the colour of the library being opened
    // rather than to the one being left.
    const { mod, root } = await load("film");
    mod.setMedium("book");
    expect(root.dataset.medium).toBe("book");
    expect(root.classList.add).toHaveBeenCalledWith("medium-swap");
  });

  it("still reloads when the document will not take the class", async () => {
    // Losing the animation is not worth losing the switch.
    vi.resetModules();
    const store = new Map<string, string>([["rankd-medium-v1", "film"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("document", {
      get documentElement(): never {
        throw new Error("no document");
      },
    });
    const reload = vi.fn();
    vi.stubGlobal("window", {
      location: { reload },
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
    });
    const mod = await import("@/lib/medium");
    mod.setMedium("book");
    expect(reload).toHaveBeenCalled();
  });

  it("does nothing when the medium is already active", async () => {
    // A stray tap on the medium you are already in must not be a page refresh.
    const { mod } = await load("film");
    mod.setMedium("film");
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("changes nothing when storage refuses the write", async () => {
    // Reloading would land back on the old medium, so the honest thing is to
    // change nothing rather than to appear to.
    vi.resetModules();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("full");
      },
    });
    const reload = vi.fn();
    vi.stubGlobal("document", { documentElement: { dataset: {}, classList: { add: vi.fn() } } });
    vi.stubGlobal("window", {
      location: { reload },
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
    });
    const mod = await import("@/lib/medium");
    mod.setMedium("book");
    expect(reload).not.toHaveBeenCalled();
  });
});
