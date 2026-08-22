import { describe, expect, it } from "vitest";

import {
  HANDLE_MAX,
  HANDLE_MIN,
  RESERVED,
  normalizeHandle,
  suggestHandle,
  validateHandle,
} from "@/lib/handles";

// A handle is the one string other people type and mistake for somebody else's.
// The charset can be widened later and can never be narrowed, so what's guarded
// hardest here is what gets REFUSED.

describe("normalising", () => {
  it("accepts the @ people say out loud", () => {
    expect(normalizeHandle("@sam")).toBe("sam");
  });

  it("is case insensitive, because the unique index is", () => {
    expect(normalizeHandle("SamJones")).toBe("samjones");
  });

  it("does not substitute characters into a name nobody chose", () => {
    // A space stays a space and is refused downstream. Turning it into an
    // underscore would hand somebody a handle they then have to live with.
    expect(normalizeHandle("sam jones")).toBe("sam jones");
  });
});

describe("validating", () => {
  it("takes an ordinary name", () => {
    expect(validateHandle("jarrad")).toEqual({ ok: true, handle: "jarrad" });
  });

  it("takes digits and underscores in the middle", () => {
    expect(validateHandle("sam_j_99").ok).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["ab", "shorter than the minimum"],
    ["a".repeat(HANDLE_MAX + 1), "longer than the maximum"],
    ["sam jones", "a space"],
    ["sam!", "punctuation"],
    ["sam.jones", "a dot"],
    ["sam-jones", "a hyphen"],
    ["_sam", "a leading underscore"],
    ["sam_", "a trailing underscore"],
    ["Сэм", "non-latin characters"],
  ])("refuses %j (%s)", (raw) => {
    expect(validateHandle(raw).ok).toBe(false);
  });

  it("accepts exactly the minimum and the maximum", () => {
    expect(validateHandle("a".repeat(HANDLE_MIN)).ok).toBe(true);
    expect(validateHandle("a".repeat(HANDLE_MAX)).ok).toBe(true);
  });

  it("refuses a reserved name however it was typed", () => {
    expect(validateHandle("@ADMIN").ok).toBe(false);
    expect(validateHandle("support").ok).toBe(false);
  });

  it("reserves every route segment that could shadow a page", () => {
    // These are the ones a `/@:handle` rewrite would collide with. If a route
    // is added and this list is not, one of them silently wins.
    for (const route of ["api", "u", "list", "feed", "vs", "settings", "robots", "sitemap"]) {
      expect(RESERVED.has(route)).toBe(true);
    }
  });

  it("says which half is wrong, not both", () => {
    // "3 to 20 characters, letters, numbers and underscore" is complete and
    // tells somebody who typed `sam!` nothing about what to change.
    const bad = validateHandle("sam!");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/letters, numbers and underscore/i);
  });

  it("never puts an em dash in a reason", () => {
    // VOICE.md rule 2. These sentences are shown to the reader.
    const reasons = ["", "ab", "sam!", "_sam", "admin", "a".repeat(99)].map((r) => {
      const c = validateHandle(r);
      return c.ok ? "" : c.reason;
    });
    for (const reason of reasons) expect(reason).not.toContain("\u2014");
  });
});

describe("suggesting", () => {
  it("reduces a real name to the allowed set rather than refusing it", () => {
    expect(suggestHandle(["Jarrad Bishop"])).toBe("jarradbishop");
  });

  it("takes the first seed that survives", () => {
    expect(suggestHandle([null, "!!", "sam"])).toBe("sam");
  });

  it("trims a seed to the maximum instead of dropping it", () => {
    expect(suggestHandle(["a".repeat(40)])).toBe("a".repeat(HANDLE_MAX));
  });

  it("does not suggest a reserved name", () => {
    expect(suggestHandle(["admin", "jarrad"])).toBe("jarrad");
  });

  it("does not leave an underscore stranded at either end", () => {
    expect(suggestHandle(["_sam."])).toBe("sam");
  });

  it("answers empty when nothing survives, rather than guessing", () => {
    // An empty field asks the question. A bad guess makes the reader delete
    // something first.
    expect(suggestHandle([null, undefined, "!!!", "ab"])).toBe("");
  });
});
