// `@handle` inside a comment — the parsing, which is the part that can go
// quietly wrong and link somebody to a stranger.

import { describe, expect, it } from "vitest";

import { findMentions, mentionedHandles, splitMentions } from "@/lib/social/mentions";

describe("findMentions", () => {
  it("finds a name at the start, in the middle and at the end", () => {
    expect(mentionedHandles("@sam said so")).toEqual(["sam"]);
    expect(mentionedHandles("I think @sam is right")).toEqual(["sam"]);
    expect(mentionedHandles("ask @sam")).toEqual(["sam"]);
  });

  it("keeps the punctuation that ended the name out of it", () => {
    expect(mentionedHandles("really, @sam?")).toEqual(["sam"]);
    expect(mentionedHandles("(@sam)")).toEqual(["sam"]);
    expect(mentionedHandles("@sam, @donnie and @rankd.")).toEqual(["sam", "donnie", "rankd"]);
  });

  it("lowercases, because @Sam means @sam", () => {
    expect(mentionedHandles("@SAM and @Donnie")).toEqual(["sam", "donnie"]);
  });

  it("does not read an email address as a mention", () => {
    // The `@` is inside a word here, which is the whole distinction.
    expect(mentionedHandles("mail me at sam@example.com")).toEqual([]);
  });

  it("refuses a run longer than a handle can be, rather than truncating it", () => {
    // THE case worth guarding. Taking the first twenty characters would turn
    // this into a link to a different, real account.
    const long = "a".repeat(25);
    expect(mentionedHandles(`@${long}`)).toEqual([]);
  });

  it("drops a trailing underscore instead of failing", () => {
    expect(mentionedHandles("thanks @sam_")).toEqual(["sam"]);
  });

  it("refuses names that are too short or start wrong", () => {
    expect(mentionedHandles("@ab")).toEqual([]); // under HANDLE_MIN
    expect(mentionedHandles("@_sam")).toEqual([]); // handles never start with _
    expect(mentionedHandles("@@sam")).toEqual([]); // not a mention
  });

  it("reports each name once, in the order they first appear", () => {
    expect(mentionedHandles("@sam and @donnie and @sam again")).toEqual(["sam", "donnie"]);
  });

  it("gives indices that carve the original string exactly", () => {
    const text = "I think @sam is right";
    const [m] = findMentions(text);
    expect(text.slice(m.start, m.end)).toBe("@sam");
  });
});

describe("splitMentions", () => {
  it("keeps every character of the original", () => {
    const text = "really, @sam? ask @donnie.";
    const joined = splitMentions(text)
      .map((p) => (p.kind === "text" ? p.text : `@${p.handle}`))
      .join("");
    expect(joined).toBe(text);
  });

  it("returns one plain piece when there is nothing to link", () => {
    expect(splitMentions("no names here")).toEqual([{ kind: "text", text: "no names here" }]);
  });

  it("returns nothing for an empty comment", () => {
    expect(splitMentions("")).toEqual([]);
  });

  it("handles a comment that is only a mention", () => {
    expect(splitMentions("@sam")).toEqual([{ kind: "mention", handle: "sam" }]);
  });
});
