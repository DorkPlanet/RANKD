import { beforeEach, describe, expect, it, vi } from "vitest";

import { cachedMe, fetchMe, forgetMe, needsHandle, type Me } from "@/lib/account";

// The one way the social layer can hurt somebody who has never asked for it.
//
// A handle gate asks a NEW question of the network on every open, and the naive
// reading of a failed request is "no handle yet, show the wall". That would lock
// a signed-in reader with 861 films out of a library sitting on the device in
// their hand, for want of a name they cannot claim offline anyway.
//
// So what is guarded here is not that the gate WORKS. It is that the gate stays
// shut in every case where Rankd does not actually know.

const ME: Me = {
  handle: "jarrad",
  displayName: "Jarrad",
  avatarUrl: null,
  bio: null,
  profileVisibility: "private",
  tasteVisibility: "private",
};

const NAMELESS: Me = { ...ME, handle: null };

// Same standing-up as store.test.ts and lists.test.ts: account.ts guards on
// `typeof window` and talks to localStorage, and the round trip through JSON is
// part of what is being tested, so a real map rather than a mock.
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

/** An `/api/me` that answers however the test needs it to. */
const answers = (init: { status?: number; body?: unknown; throws?: boolean }) => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.fetch = vi.fn(async () => {
    if (init.throws) throw new TypeError("Failed to fetch");
    return {
      ok: (init.status ?? 200) < 400,
      status: init.status ?? 200,
      json: async () => {
        if (init.body === undefined) throw new SyntaxError("Unexpected end of JSON input");
        return init.body;
      },
    } as unknown as Response;
  });
};

describe("the gate predicate", () => {
  it("opens ONLY on a definite answer of no handle", () => {
    expect(needsHandle({ kind: "me", me: NAMELESS })).toBe(true);
  });

  it("stays shut when Rankd answered and there is a handle", () => {
    expect(needsHandle({ kind: "me", me: ME })).toBe(false);
  });

  it("stays shut when the network could not be asked", () => {
    // The whole reason this file exists. "Could not ask" is not "has no handle".
    expect(needsHandle({ kind: "unknown", me: null })).toBe(false);
  });

  it("stays shut when the network could not be asked and the CACHE says nameless", () => {
    // A cached "no handle" is still not an answer about now. Waiting until the
    // next connected open costs nothing; being wrong here costs somebody their
    // library.
    expect(needsHandle({ kind: "unknown", me: NAMELESS })).toBe(false);
  });

  it("stays shut for a signed-out visitor, who meets the sign-in wall instead", () => {
    expect(needsHandle({ kind: "out" })).toBe(false);
  });

  it("stays shut while the answer is still in flight", () => {
    expect(needsHandle(null)).toBe(false);
  });
});

describe("asking who I am", () => {
  it("reports a definite answer and caches it", async () => {
    answers({ body: ME });
    await expect(fetchMe()).resolves.toEqual({ kind: "me", me: ME });
    expect(cachedMe()).toEqual(ME);
  });

  it("reports a definite nobody on 401, and forgets", async () => {
    answers({ body: ME });
    await fetchMe();
    expect(cachedMe()).not.toBeNull();

    answers({ status: 401, body: { error: "Not signed in" } });
    await expect(fetchMe()).resolves.toEqual({ kind: "out" });
    // Or a browser signed out somewhere else keeps answering from a stale
    // identity, offline, forever.
    expect(cachedMe()).toBeNull();
  });

  it("reports unknown when the request throws, and hands back the cache", async () => {
    answers({ body: ME });
    await fetchMe();

    answers({ throws: true });
    await expect(fetchMe()).resolves.toEqual({ kind: "unknown", me: ME });
  });

  it("reports unknown on a 5xx, which is the server failing and not a claim", async () => {
    answers({ body: ME });
    await fetchMe();

    answers({ status: 503, body: {} });
    await expect(fetchMe()).resolves.toEqual({ kind: "unknown", me: ME });
  });

  it("reports unknown when the body is not JSON", async () => {
    answers({ status: 200 });
    await expect(fetchMe()).resolves.toEqual({ kind: "unknown", me: null });
  });

  it("survives a first-ever open with no network and nothing cached", async () => {
    answers({ throws: true });
    const state = await fetchMe();
    expect(state).toEqual({ kind: "unknown", me: null });
    // And critically, this does not open the gate.
    expect(needsHandle(state)).toBe(false);
  });
});

describe("the cache", () => {
  it("is not trusted blindly", async () => {
    // Hand-edited, truncated or written by an older build. It has to fail as
    // "nothing cached" rather than as a `Me` full of undefined, because the
    // value is read on the path that decides whether to show a wall.
    localStorage.setItem("rankd-me-v1", "{not json");
    expect(cachedMe()).toBeNull();

    localStorage.setItem("rankd-me-v1", JSON.stringify({ handle: 42 }));
    expect(cachedMe()).toBeNull();
  });

  it("defaults a missing visibility to private, never public", async () => {
    // A value written before these fields existed must not read back as an
    // account that agreed to be seen.
    localStorage.setItem("rankd-me-v1", JSON.stringify({ handle: "sam" }));
    const me = cachedMe();
    expect(me?.profileVisibility).toBe("private");
    expect(me?.tasteVisibility).toBe("private");
  });

  it("can be forgotten", async () => {
    answers({ body: ME });
    await fetchMe();
    forgetMe();
    expect(cachedMe()).toBeNull();
  });
});
