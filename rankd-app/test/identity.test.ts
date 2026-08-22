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
  it("uses the account name", () => {
    expect(publicName({ displayName: "Jarrad", avatarUrl: null })).toBe("Jarrad");
  });

  it("falls back to the word the app has always used", () => {
    expect(publicName({ displayName: null, avatarUrl: null })).toBe("You");
    expect(publicName({ displayName: "   ", avatarUrl: null })).toBe("You");
  });
});

describe("which picture to draw", () => {
  const shot = "https://image.tmdb.org/t/p/w780/still.jpg";

  it("prefers the one the person chose over the one Google supplied", () => {
    // The ranking `avatarOf` has had since uploads existed, preserved across
    // the move off the device.
    expect(avatarOf({ displayName: "Sam", avatarUrl: shot }, "https://google/photo.jpg")).toEqual({
      kind: "image",
      url: shot,
    });
  });

  it("falls back to the account photo", () => {
    expect(avatarOf({ displayName: "Sam", avatarUrl: null }, "https://google/photo.jpg")).toEqual({
      kind: "image",
      url: "https://google/photo.jpg",
    });
  });

  it("falls back to an initial, so the circle is never empty", () => {
    expect(avatarOf({ displayName: "Sam", avatarUrl: null })).toEqual({
      kind: "initial",
      letter: "S",
    });
  });

  it("has an initial even for an account with no name at all", () => {
    expect(avatarOf({ displayName: null, avatarUrl: null })).toEqual({
      kind: "initial",
      letter: "Y",
    });
  });
});
