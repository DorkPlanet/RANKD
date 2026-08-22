import { beforeEach, describe, expect, it } from "vitest";

import {
  avatarOf,
  loadProfile,
  publicName,
  saveProfile,
  takeLegacyIdentity,
} from "@/lib/profile";

// Name, bio and picture moved off the device and onto the account, because they
// are read by strangers now. `takeLegacyIdentity` is the one-way door between
// the two, run once per browser by `HandleGate`.
//
// What is guarded here is that the door only opens one way: the fields are
// handed over exactly once, the rest of the profile survives untouched, and a
// second pass finds nothing.

const KEY = "rankd-profile-v1";

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

/** A profile as an older build of Rankd would have left it. */
const legacyStored = (extra: Record<string, unknown> = {}) =>
  localStorage.setItem(
    KEY,
    JSON.stringify({
      name: "Jarrad",
      bio: "Mostly crime films.",
      avatarUrl: "https://x.public.blob.vercel-storage.com/a.webp",
      bannerFilmId: "heat-1995",
      bannerStill: "https://image.tmdb.org/t/p/w780/still.jpg",
      pinnedListIds: ["l1"],
      pinnedPeople: ["director:Michael Mann"],
      ...extra,
    }),
  );

describe("handing identity over", () => {
  it("returns what the old build was holding", () => {
    legacyStored();
    expect(takeLegacyIdentity()).toEqual({
      name: "Jarrad",
      bio: "Mostly crime films.",
      avatarUrl: "https://x.public.blob.vercel-storage.com/a.webp",
    });
  });

  it("leaves everything that belongs to the LIBRARY alone", () => {
    // A banner is a frame from a film you own and a pin names a ranking. Those
    // describe this library, not your identity, and they stay.
    legacyStored();
    takeLegacyIdentity();
    expect(loadProfile()).toEqual({
      bannerFilmId: "heat-1995",
      bannerStill: "https://image.tmdb.org/t/p/w780/still.jpg",
      pinnedListIds: ["l1"],
      pinnedPeople: ["director:Michael Mann"],
    });
  });

  it("is a ONE-way door", () => {
    legacyStored();
    takeLegacyIdentity();
    // Second call finds nothing. This runs on the path HandleGate uses, so a
    // re-entry must not hand a stale name over a second time and overwrite an
    // edit somebody has made since.
    expect(takeLegacyIdentity()).toEqual({});
  });

  it("is a no-op on a fresh install", () => {
    expect(takeLegacyIdentity()).toEqual({});
  });

  it("is a no-op on a profile that only holds library fields", () => {
    saveProfile({ bannerFilmId: "heat-1995" });
    expect(takeLegacyIdentity()).toEqual({});
    // And it must not have rewritten the row for nothing.
    expect(loadProfile()).toEqual({ bannerFilmId: "heat-1995" });
  });

  it("hands over only what was actually there", () => {
    localStorage.setItem(KEY, JSON.stringify({ name: "Sam" }));
    expect(takeLegacyIdentity()).toEqual({ name: "Sam" });
  });

  it("keeps a field a NEWER build might have added", () => {
    // Written back through the raw key rather than through `Profile`, so a
    // round trip cannot silently drop something this build does not know about.
    legacyStored({ somethingNewer: 42 });
    takeLegacyIdentity();
    const raw = JSON.parse(localStorage.getItem(KEY) as string);
    expect(raw.somethingNewer).toBe(42);
    expect(raw.name).toBeUndefined();
  });

  it("survives a corrupt profile rather than throwing", () => {
    localStorage.setItem(KEY, "{not json");
    expect(takeLegacyIdentity()).toEqual({});
  });

  it("ignores fields of the wrong type", () => {
    localStorage.setItem(KEY, JSON.stringify({ name: 42, bio: null }));
    expect(takeLegacyIdentity()).toEqual({});
  });
});

describe("what to call somebody", () => {
  it("is the handle, and the handle BEATS the provider's name", () => {
    // The whole point, and it is asserted this way round on purpose. Rankd had
    // a display name for one afternoon and the symptom was a profile headed
    // JARRAD BISHOP (UNKNOWNENTITY) with the same words repeated underneath:
    // a value copied out of somebody's email account years ago, printed twice.
    expect(
      publicName({ handle: "jarrad_b", displayName: "Jarrad Bishop (UnknownEntity)", avatarUrl: null }),
    ).toBe("jarrad_b");
  });

  it("uses the handle when there is nothing else", () => {
    expect(publicName({ handle: "jarrad_b", displayName: null, avatarUrl: null })).toBe("jarrad_b");
  });

  it("falls back to a display name ONLY before a handle exists", () => {
    // The one case that keeps this field alive: an account that has not been
    // through the gate yet still has to be called something.
    expect(publicName({ handle: null, displayName: "Jarrad", avatarUrl: null })).toBe("Jarrad");
  });

  it("still has an answer for an account with neither", () => {
    expect(publicName({ handle: null, displayName: null, avatarUrl: null })).toBe("You");
    expect(publicName({ handle: null, displayName: "   ", avatarUrl: null })).toBe("You");
  });
});

describe("which picture to draw", () => {
  const shot = "https://image.tmdb.org/t/p/w780/still.jpg";
  const someone = { handle: "sam", displayName: "Sam", avatarUrl: null };

  it("prefers the one the person chose over the one Google supplied", () => {
    // The ranking `avatarOf` has had since uploads existed, preserved across
    // the move off the device.
    expect(avatarOf({ ...someone, avatarUrl: shot }, "https://google/photo.jpg")).toEqual({
      kind: "image",
      url: shot,
    });
  });

  it("falls back to the account photo", () => {
    expect(avatarOf(someone, "https://google/photo.jpg")).toEqual({
      kind: "image",
      url: "https://google/photo.jpg",
    });
  });

  it("falls back to an initial, so the circle is never empty", () => {
    expect(avatarOf(someone)).toEqual({ kind: "initial", letter: "S" });
  });

  it("takes the initial from the HANDLE when there is no display name", () => {
    // Follows `publicName`, so the letter in the circle matches the name on the
    // profile rather than coming from a Google value nobody sees any more.
    expect(avatarOf({ handle: "jarrad_b", displayName: null, avatarUrl: null })).toEqual({
      kind: "initial",
      letter: "J",
    });
  });

  it("has an initial even for an account with nothing set", () => {
    expect(avatarOf({ handle: null, displayName: null, avatarUrl: null })).toEqual({
      kind: "initial",
      letter: "Y",
    });
  });
});
