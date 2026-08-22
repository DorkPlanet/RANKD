// `@handle` inside a comment.
//
// ── Parsed, never stored ───────────────────────────────────────────────────
//
// There is no mentions table. A mention is a fact ABOUT a sentence rather than a
// thing of its own, and keeping a row beside the text means two truths about one
// line that have to be held in step by hand. The text is the record; this reads
// it.
//
// ── The rules come from `handles.ts`, not from a new regex ─────────────────
//
// A handle is 3–20 characters of lowercase letters, digits and underscores, and
// may not start or end with an underscore. Writing a second pattern here would
// be a second definition of what a name is, and the two would drift the first
// time one of them was relaxed.

import { HANDLE_MAX, HANDLE_MIN } from "@/lib/handles";

/**
 * Where a handle appears in some text.
 *
 * `start` and `end` are indices into the original string, so a renderer can cut
 * the text apart without searching it again — and so the plain text either side
 * is preserved exactly, including the punctuation that ended the mention.
 */
export interface Mention {
  handle: string;
  start: number;
  end: number;
}

/**
 * Every `@handle` in a piece of text, in the order they appear.
 *
 * Deliberately GREEDY on length and then trimmed: matching `[a-z0-9_]{3,20}`
 * directly would take only the first twenty characters of a longer run and
 * quietly turn `@thisisaverylongnameindeed` into a link to a different, real
 * account. Reading the whole run and rejecting it if it is too long is the
 * difference between "no such person" and "the wrong person".
 *
 * Trailing underscores are dropped rather than failing the match, so `@sam_`
 * at the end of a sentence still finds `sam`.
 */
export function findMentions(text: string): Mention[] {
  const out: Mention[] = [];
  // The `@` must not be inside a word: an email address is not a mention.
  const pattern = /(^|[^a-zA-Z0-9_@])@([a-zA-Z0-9_]+)/g;

  for (const match of text.matchAll(pattern)) {
    const lead = match[1] ?? "";
    const start = (match.index ?? 0) + lead.length;
    // Lowercased, because handles are stored lowercase and `@Sam` means `@sam`.
    let handle = match[2].toLowerCase();

    // A run that is too long is not a handle at all. Truncating would link to
    // somebody else entirely.
    if (handle.length > HANDLE_MAX) continue;
    while (handle.endsWith("_")) handle = handle.slice(0, -1);
    if (handle.length < HANDLE_MIN) continue;
    if (handle.startsWith("_")) continue;

    out.push({ handle, start, end: start + 1 + handle.length });
  }
  return out;
}

/** Just the names, unique, in order of first appearance. */
export function mentionedHandles(text: string): string[] {
  return [...new Set(findMentions(text).map((m) => m.handle))];
}

/** A run of text, either plain or a name somebody typed. */
export type Piece = { kind: "text"; text: string } | { kind: "mention"; handle: string };

/**
 * The comment broken into pieces, ready to render.
 *
 * Splitting here rather than in the component means the hard part — which
 * characters belong to the name and which to the sentence — is testable without
 * rendering anything, and every surface that shows a comment breaks it the same
 * way.
 */
export function splitMentions(text: string): Piece[] {
  const found = findMentions(text);
  if (found.length === 0) return text ? [{ kind: "text", text }] : [];

  const pieces: Piece[] = [];
  let at = 0;
  for (const mention of found) {
    if (mention.start > at) pieces.push({ kind: "text", text: text.slice(at, mention.start) });
    pieces.push({ kind: "mention", handle: mention.handle });
    at = mention.end;
  }
  if (at < text.length) pieces.push({ kind: "text", text: text.slice(at) });
  return pieces;
}
