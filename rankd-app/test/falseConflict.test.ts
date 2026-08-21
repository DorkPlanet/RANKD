import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reconcileWithAccount } from "@/lib/sync";
import { SYNC_KEYS } from "@/lib/backupFormat";

// The chooser that asked which of two IDENTICAL libraries to destroy.
//
// `reconcile` is pure and sees three booleans: has a library, is dirty, has the
// server moved. All three are true on a perfectly ordinary single device — the
// credits sweep marks the browser dirty every few minutes whether or not
// anything changed, and any push moves the server's stamp past
// `lastSeenServerAt`. So it correctly returned "conflict" for a disagreement
// that did not exist, and the panel offered "864 films, 949 duels" against
// "864 films, 949 duels". Answering either way was a no-op, which is why it
// could persist without corrupting anything.

const LAST_SEEN = "2026-08-16T10:00:00.000Z";
const SERVER_AT = "2026-08-17T10:00:00.000Z";

/** The evidence log, in the shape `validateBackup` insists on. */
const LOG = JSON.stringify({ v: 1, f: [], r: [] });

const store = new Map<string, string>();

/** A library payload, as the wire carries it. */
const payload = (films: string) => ({
  format: 2,
  savedAt: LAST_SEEN,
  keys: { "rankd-app-v1": films, "rankd-log-v1": LOG },
});

const seedLocal = (films: string) => {
  store.set("rankd-app-v1", films);
  store.set("rankd-log-v1", LOG);
  // Dirty, and the server has moved since we last looked: the two inputs that
  // together mean "conflict" to `reconcile`.
  store.set(
    "rankd-sync-v1",
    JSON.stringify({
      deviceId: "d1",
      lastSeenServerAt: LAST_SEEN,
      dirtyAt: SERVER_AT,
      lastPushedHash: null,
    }),
  );
};

const FILMS = JSON.stringify([{ id: "heat", title: "Heat", rating: 5, score: 9000 }]);

/**
 * Whether the merge path reloaded.
 *
 * The stub used to be a bare `{}`, which was enough while `canMerge` refused
 * everything this fixture could produce — the merge branch was simply never
 * reached from here. It is now, and it ends in `window.location.reload()`,
 * because every screen read the library once at mount and is holding films the
 * merge has just replaced.
 */
let reloaded = false;

beforeEach(() => {
  store.clear();
  reloaded = false;
  vi.stubGlobal("window", { location: { reload: () => void (reloaded = true) } });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => vi.unstubAllGlobals());

const serverReplies = (films: string) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return { ok: true, json: async () => ({ updatedAt: SERVER_AT }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ payload: payload(films), updatedAt: SERVER_AT, deviceId: "d2" }),
      } as Response;
    }),
  );

describe("reconcileWithAccount", () => {
  it("does NOT ask when both sides hold the same library", async () => {
    seedLocal(FILMS);
    serverReplies(FILMS);

    const outcome = await reconcileWithAccount();

    expect(outcome.kind).not.toBe("conflict");
    expect(outcome.kind).toBe("pushed");
  });

  // The whole point: it has to end CLEAN. Reporting "pushed" while leaving the
  // browser dirty is what made this reconcile to the same answer on every open
  // — `push` was returning early because `startSync` had not run yet.
  it("actually resolves, so it stops asking on the next open", async () => {
    seedLocal(FILMS);
    serverReplies(FILMS);

    await reconcileWithAccount();

    const state = JSON.parse(store.get("rankd-sync-v1")!);
    expect(state.lastSeenServerAt).toBe(SERVER_AT);
    expect(state.dirtyAt).toBeNull();
  });

  // The one that actually bit. Brightness rides in SYNC_KEYS, so nudging the
  // slider made the payloads differ while films and duels — the only numbers
  // the chooser prints — stayed identical on both sides.
  it("does NOT ask when only a preference differs", async () => {
    seedLocal(FILMS);
    store.set("rankd-brightness", "0.13");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === "PUT") return { ok: true, json: async () => ({ updatedAt: SERVER_AT }) } as Response;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            payload: { ...payload(FILMS), keys: { ...payload(FILMS).keys, "rankd-brightness": "0.9" } },
            updatedAt: SERVER_AT,
            deviceId: "d2",
          }),
        } as Response;
      }),
    );

    const outcome = await reconcileWithAccount();

    // Pushed, not asked: this device's setting goes up and the two sides agree.
    expect(outcome.kind).toBe("pushed");
  });

  // ── When the chooser does and does not earn its keep ────────────────────
  //
  // This used to assert that two DIFFERENT film lists always reach the chooser.
  // They do not any more, and should not: `LOG` here is empty on both sides, so
  // there is no evidence anywhere to disagree about — and making somebody pick
  // a side in that state deletes one library to settle an argument that is not
  // happening. The union keeps both.
  it("merges rather than asking when neither side has any evidence", async () => {
    seedLocal(FILMS);
    serverReplies(JSON.stringify([{ id: "drive", title: "Drive", rating: 4, score: 8000 }]));

    const outcome = await reconcileWithAccount();

    expect(outcome.kind).not.toBe("conflict");
    // And it must reload, or the app keeps rendering the pre-merge library.
    expect(reloaded).toBe(true);
  });

  it("still asks when the account's log is empty and this device has played", async () => {
    // The case that genuinely cannot be decided from here: the account holds a
    // library with no evidence, which is either somebody who imported and never
    // played or somebody who used "Clear my ranking" on another device. Merging
    // would resurrect a ranking they may have thrown away on purpose.
    seedLocal(FILMS);
    store.set(
      "rankd-log-v1",
      JSON.stringify({ v: 1, f: ["heat", "drive"], r: [["1-aa", 0, 1, "a", "h", 100]] }),
    );
    serverReplies(FILMS);

    const outcome = await reconcileWithAccount();

    expect(outcome.kind).toBe("conflict");
  });

  it("only compares the synced key set, not whatever else is in storage", async () => {
    seedLocal(FILMS);
    // Device-local and deliberately never synced. A difference here must not
    // read as two libraries disagreeing.
    store.set("rankd-run-v1", JSON.stringify({ subject: "whatever" }));
    store.set("rankd-install-hint-v1", "1");
    serverReplies(FILMS);

    expect((await reconcileWithAccount()).kind).not.toBe("conflict");
    expect(SYNC_KEYS).not.toContain("rankd-run-v1");
  });
});
