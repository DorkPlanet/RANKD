import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSession, forgetSignedIn, hasSignedInBefore } from "@/lib/account";

// The gate asks this, so "we could not ask" must never be answerable as "you
// are signed out". Getting that wrong puts a sign-in wall in front of somebody's
// own library the moment they lose signal — the exact failure the local-first
// design exists to avoid, aimed at the people most invested in the app.

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => vi.unstubAllGlobals());

const reply = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const SIGNED_IN = { user: { email: "someone@example.com", name: "Someone" } };

describe("fetchSession", () => {
  it("reports a real session, and remembers this browser has had one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(SIGNED_IN)));

    const s = await fetchSession();

    expect(s).toEqual({ kind: "in", account: { email: "someone@example.com", name: "Someone", image: undefined } });
    expect(hasSignedInBefore()).toBe(true);
  });

  it("reports a definite no when the server answers with no user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({})));
    expect(await fetchSession()).toEqual({ kind: "out" });
  });

  // Offline. The request never lands, so nothing has been learned either way.
  it("says UNKNOWN when the network cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await fetchSession()).toEqual({ kind: "unknown" });
  });

  // A 500 is the server failing to answer, which is also not a claim about the
  // reader. A 401/403 is, so those stay a definite no.
  it("says UNKNOWN on a server error but OUT on a client one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(null, 503)));
    expect(await fetchSession()).toEqual({ kind: "unknown" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(null, 401)));
    expect(await fetchSession()).toEqual({ kind: "out" });
  });

  it("says UNKNOWN when the answer is not readable JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response));
    expect(await fetchSession()).toEqual({ kind: "unknown" });
  });

  // Otherwise a browser signed out from another device keeps letting itself in
  // every time it goes offline.
  it("forgets the remembered flag on a definite signed-out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(SIGNED_IN)));
    await fetchSession();
    expect(hasSignedInBefore()).toBe(true);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({})));
    await fetchSession();
    expect(hasSignedInBefore()).toBe(false);
  });

  // An UNKNOWN must leave the flag exactly as it was — that is the whole point
  // of it, and clearing it here would lock the reader out on the second open.
  it("leaves the remembered flag alone when it could not ask", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(SIGNED_IN)));
    await fetchSession();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await fetchSession();
    expect(hasSignedInBefore()).toBe(true);
  });
});

describe("hasSignedInBefore", () => {
  it("is false on a browser that never has", () => {
    expect(hasSignedInBefore()).toBe(false);
  });

  it("is cleared by signing out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(SIGNED_IN)));
    await fetchSession();
    forgetSignedIn();
    expect(hasSignedInBefore()).toBe(false);
  });
});
