import { describe, expect, it } from "vitest";

import { reconcile } from "@/lib/reconcile";

// The decision that stands between two devices and a lost library. Every branch
// is here because getting one wrong is silent: the app carries on looking
// correct while the duels are gone.

const SERVER_AT = "2026-08-13T10:00:00.000Z";
const LATER = "2026-08-13T11:00:00.000Z";

describe("reconcile", () => {
  it("pushes when the account has nothing yet", () => {
    expect(
      reconcile({ hasLocalLibrary: true, dirty: true, lastSeenServerAt: null }, { updatedAt: null }),
    ).toBe("push");
  });

  it("does nothing when neither side has anything", () => {
    expect(
      reconcile({ hasLocalLibrary: false, dirty: false, lastSeenServerAt: null }, { updatedAt: null }),
    ).toBe("in-sync");
  });

  it("pulls onto a browser with no library — the new-phone case", () => {
    expect(
      reconcile(
        { hasLocalLibrary: false, dirty: false, lastSeenServerAt: null },
        { updatedAt: SERVER_AT },
      ),
    ).toBe("pull");
  });

  it("stays quiet when nothing has moved on either side", () => {
    expect(
      reconcile(
        { hasLocalLibrary: true, dirty: false, lastSeenServerAt: SERVER_AT },
        { updatedAt: SERVER_AT },
      ),
    ).toBe("in-sync");
  });

  it("pulls when the account moved and this device has nothing unsent", () => {
    expect(
      reconcile(
        { hasLocalLibrary: true, dirty: false, lastSeenServerAt: SERVER_AT },
        { updatedAt: LATER },
      ),
    ).toBe("pull");
  });

  it("pushes when this device is the only one that has written", () => {
    expect(
      reconcile(
        { hasLocalLibrary: true, dirty: true, lastSeenServerAt: SERVER_AT },
        { updatedAt: SERVER_AT },
      ),
    ).toBe("push");
  });

  it("asks when both sides have moved", () => {
    expect(
      reconcile(
        { hasLocalLibrary: true, dirty: true, lastSeenServerAt: SERVER_AT },
        { updatedAt: LATER },
      ),
    ).toBe("conflict");
  });

  // The case that would otherwise overwrite a real library on the first ever
  // sign-in: this browser has films and has never synced, and the account
  // already holds someone's work. "Never synced" must count as "missed
  // something", not as "up to date".
  it("asks on a first sign-in when both sides already hold a library", () => {
    expect(
      reconcile(
        { hasLocalLibrary: true, dirty: true, lastSeenServerAt: null },
        { updatedAt: SERVER_AT },
      ),
    ).toBe("conflict");
  });

  // A device that has never synced but has also never been written to since —
  // it has nothing of its own to lose, so taking the account's copy is safe.
  it("pulls for a never-synced browser with no unsent work", () => {
    expect(
      reconcile(
        { hasLocalLibrary: true, dirty: false, lastSeenServerAt: null },
        { updatedAt: SERVER_AT },
      ),
    ).toBe("pull");
  });
});
