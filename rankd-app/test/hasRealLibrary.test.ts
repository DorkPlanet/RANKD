// `hasRealLibrary` is the single input that decides whether sync PULLS.
//
// It is here because getting it wrong is not a wrong number on a screen — it is
// an infinite reload loop the reader cannot escape, because `pull()` ends in
// `window.location.reload()` and the splash is all they ever see. That shipped.
// See the header of the function itself for the full sequence.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A fresh module graph over a storage we control, in a chosen medium. */
async function load(medium: "film" | "book", seed: Record<string, string> = {}) {
  vi.resetModules();
  const store = new Map<string, string>(Object.entries(seed));
  store.set("rankd-medium-v1", medium);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", {});
  return import("@/lib/store");
}

/** A library of n placed films, as JSON. */
const lib = (n: number) =>
  JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      id: `f${i}`,
      title: `Film ${i}`,
      rating: 4,
      score: 40,
    })),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("hasRealLibrary", () => {
  // ── The regression ──────────────────────────────────────────────────────

  it("is TRUE in book medium when the film library is real and books are empty", async () => {
    // THE test in this file. False here means `reconcile` answers "pull",
    // `pull()` reloads, the app reopens in books with books still empty, and it
    // asks again — splash screen forever, with no way back to the header.
    const store = await load("book", { "rankd-app-v1": lib(861) });
    expect(store.hasRealLibrary()).toBe(true);
  });

  it("is TRUE in film medium when only books have anything", async () => {
    // The same trap facing the other way, for a reader who came to Rankd for
    // books and has never logged a film.
    const store = await load("film", { "rankd-app-v1:book": lib(40) });
    expect(store.hasRealLibrary()).toBe(true);
  });

  // ── Unchanged for a film-only browser ───────────────────────────────────

  it("is FALSE on a browser holding nothing at all", async () => {
    // A genuinely new device. This is the case `pull` exists for and it must
    // keep working — it is how a second phone gets your library.
    const store = await load("film");
    expect(store.hasRealLibrary()).toBe(false);
  });

  it("is TRUE for a present-but-empty film library", async () => {
    // Deliberate, and it is what kept films out of the loop above: the app has
    // run on this browser, so it is not a fresh install.
    const store = await load("film", { "rankd-app-v1": "[]" });
    expect(store.hasRealLibrary()).toBe(true);
  });

  it("is FALSE for nothing but the untouched legacy sample set", async () => {
    // The bug `isUntouchedSeed` exists to prevent: a conflict chooser offering
    // "10 films" against "861 films" on the one device with nothing to lose.
    const seed = JSON.stringify(
      [
        "the-godfather-1972",
        "dune-2021",
        "inception-2010",
        "the-dark-knight-2008",
        "interstellar-2014",
        "la-la-land-2016",
        "ex-machina-2014",
        "sicario-2015",
        "gone-girl-2014",
        "drive-2011",
      ].map((id) => ({ id, title: id, rating: 4, score: 40 })),
    );
    const store = await load("film", { "rankd-app-v1": seed });
    expect(store.hasRealLibrary()).toBe(false);
  });

  it("still sees a real library when the sample set is not the only thing", async () => {
    const store = await load("book", { "rankd-app-v1": lib(3), "rankd-app-v1:book": lib(2) });
    expect(store.hasRealLibrary()).toBe(true);
  });

  // ── Failure modes ───────────────────────────────────────────────────────

  it("treats an unreadable library as real rather than as absent", async () => {
    // Something IS stored here. Calling it nothing invites the pull that
    // overwrites it, which is the one outcome worse than showing an error.
    const store = await load("film", { "rankd-app-v1": "{{{not json" });
    expect(store.hasRealLibrary()).toBe(true);
  });

  it("is FALSE with no window, so the server pass never claims a library", async () => {
    vi.resetModules();
    vi.stubGlobal("window", undefined);
    const store = await import("@/lib/store");
    expect(store.hasRealLibrary()).toBe(false);
  });
});
