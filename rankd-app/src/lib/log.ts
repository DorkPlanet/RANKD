// The evidence log — every duel the app has ever asked you to settle.
//
// Until now a comparison was an instruction: you tapped, the pile reordered, and
// the tap was gone. That is why a tier costs n(n-1)/2 duels to rank (each pass
// re-derives what earlier passes already established), why one mis-tap inside a
// spotlight's binary search is silent and permanent, and — the expensive one —
// why changing how ranking works would throw away every hour anyone ever spent
// on it. Nothing recorded, nothing to re-derive from.
//
// So: a comparison is now EVIDENCE. Append-only, never edited, never deleted.
// The log is not the ranking and does not move it; it is the record the ranking
// could be rebuilt from. Everything downstream of this file — confidence, the
// matchmaker, the review card — exists only because these rows are kept.
//
// It stays deliberately dumb. No inference, no scores, no opinions about what a
// row means. Just what happened, in order.

import { markDirty } from "./syncState";

// Which side won, naming the two ids the row carries: "a" = a beat b, "b" = b
// beat a. "draw" is a Skip — the user declined to separate them — and is never
// turned into a winner by anything reading this log.
export type Outcome = "a" | "b" | "draw";

// Which game the judgement was made in. Kept because the same pair judged during
// a focused spotlight and during an idle shuffle are not quite the same claim,
// and because it costs one character to keep and cannot be recovered later.
export type LogMode = "koth" | "spotlight" | "shuffle" | "promotion";

export interface Judgement {
  /** Unique per row, so a re-render or a re-entrant drain can never double-write it. */
  id: string;
  /** The film in the row's A slot. */
  a: string;
  /** The film in the row's B slot. */
  b: string;
  o: Outcome;
  m: LogMode;
  /** When it happened (epoch ms). */
  t: number;
}

const KEY = "rankd-log-v1";

// The stored shape. localStorage is one ~5MB budget shared with the whole
// library, and this file is the only thing in the app that grows without bound —
// so the encoding is measured, not assumed.
//
// Two things do the work. Rows are TUPLES, not objects: `{"id":…,"a":…}` costs
// roughly double `[…,…]` for identical information. And film ids are INTERNED
// into a dictionary, because they are human-readable slugs ("gone-girl-2014")
// and every row names two of them — stored inline they were 36 of a measured 83
// bytes per row, which put the ceiling around 60k duels. Interning them costs
// each film's name once and each mention two or three characters, roughly
// halving the row and doubling the headroom.
//
// The public `Judgement` shape is unaffected; this is purely how it is written.
type Row = [string, number, number, Outcome, string, number];

interface Stored {
  /** Format version, so a future change can migrate rather than guess. */
  v: 1;
  /** The interning dictionary: film ids, referenced from rows by index. */
  f: string[];
  r: Row[];
}

// One character per mode, for the same reason: "spotlight" is eleven bytes on
// every row it appears in. Unknown codes read back as a climb rather than
// throwing — a row whose mode is unrecognisable is still a real judgement.
const MODE_CODE: Record<LogMode, string> = {
  koth: "k",
  spotlight: "s",
  shuffle: "h",
  promotion: "p",
};
const MODE_OF: Record<string, LogMode> = { k: "koth", s: "spotlight", h: "shuffle", p: "promotion" };

function encode(js: readonly Judgement[]): Stored {
  const f: string[] = [];
  const index = new Map<string, number>();
  const idx = (id: string): number => {
    const seen = index.get(id);
    if (seen !== undefined) return seen;
    const next = f.length;
    f.push(id);
    index.set(id, next);
    return next;
  };
  return { v: 1, f, r: js.map((j) => [j.id, idx(j.a), idx(j.b), j.o, MODE_CODE[j.m] ?? "k", j.t]) };
}

function decode(stored: Stored): Judgement[] {
  const { f, r } = stored;
  return r
    .map(([id, ai, bi, o, m, t]) => ({ id, a: f[ai], b: f[bi], o, m: MODE_OF[m] ?? "koth", t }))
    // A row pointing outside the dictionary is unreadable rather than merely
    // odd, so it is dropped instead of becoming a judgement about `undefined`.
    .filter((j): j is Judgement => j.a !== undefined && j.b !== undefined);
}

// Async on purpose, though localStorage is synchronous today. If the log ever
// outgrows localStorage the fix is to move THIS FILE to IndexedDB, which is
// async — and every caller already awaiting means that swap changes nothing
// above it. Cheap now, and it removes the only reason the move would be painful.

/** Every judgement ever recorded, oldest first. Empty when there is none. */
export async function loadLog(): Promise<Judgement[]> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as Stored;
    if (!stored || !Array.isArray(stored.f) || !Array.isArray(stored.r)) return [];
    return decode(stored);
  } catch {
    // Corrupt or unreadable. An unreadable log must never take the app down with
    // it — the library is what the user would actually mourn, and it lives
    // elsewhere. Read it as empty and let new judgements start accumulating.
    return [];
  }
}

/**
 * Append judgements, skipping any whose `id` is already recorded.
 *
 * The idempotency is load-bearing rather than defensive. The caller drains a
 * buffer held in React state, and a double render, a re-entrant setState or a
 * remount would otherwise write the same duel twice — which would not merely
 * inflate the log, it would count as two pieces of evidence for one judgement
 * and skew every belief derived from it.
 */
export async function appendJudgements(incoming: readonly Judgement[]): Promise<void> {
  if (typeof window === "undefined" || incoming.length === 0) return;
  try {
    const existing = await loadLog();
    const seen = new Set(existing.map((j) => j.id));
    const fresh = incoming.filter((j) => !seen.has(j.id));
    if (fresh.length === 0) return;
    localStorage.setItem(KEY, JSON.stringify(encode([...existing, ...fresh])));
    markDirty();
  } catch {
    // Storage full or disabled. The judgement is lost as evidence, but the
    // placement it produced is already in the library — so the app is consistent,
    // just less well-informed. Failing louder here would cost the user a duel
    // they already fought.
  }
}

/**
 * Remove judgements by id. The one exception to append-only, and deliberately
 * narrow.
 *
 * The log's whole thesis is that a comparison you fought is never thrown away,
 * so this must not become a general edit. It exists for Undo, which does not
 * mean "I changed my mind" — that is a new judgement and belongs in the log
 * like any other. It means "I did not make that call", a mis-tap on a screen
 * whose entire interface is two large tap targets. Leaving that behind would
 * put a judgement the user never made into every belief derived from it, and
 * unlike a wrong placement there would be no way to ever see it or fix it.
 *
 * Callers should retract only what they themselves just appended.
 */
export async function retractJudgements(ids: readonly string[]): Promise<void> {
  if (typeof window === "undefined" || ids.length === 0) return;
  try {
    const drop = new Set(ids);
    const kept = (await loadLog()).filter((j) => !drop.has(j.id));
    localStorage.setItem(KEY, JSON.stringify(encode(kept)));
    markDirty();
  } catch {
    // Same reasoning as the append path: the library is the thing worth
    // protecting, and a log that failed to shrink is merely over-informed.
  }
}

/** Every row naming this film, either side. Pure — hand it a log you already hold. */
export function logFor(log: readonly Judgement[], filmId: string): Judgement[] {
  return log.filter((j) => j.a === filmId || j.b === filmId);
}

/**
 * How much evidence there is and what it costs to keep. Surfaced in Settings
 * because a storage ceiling the user cannot see is a cliff they walk off; one
 * they can see is a number that goes up.
 */
export function logSize(log: readonly Judgement[]): { rows: number; bytes: number } {
  return { rows: log.length, bytes: JSON.stringify(encode(log)).length };
}

let counter = 0;

/**
 * Mint a judgement. The id is generated here rather than at the storage edge so
 * a row is identifiable the moment it exists — which is what lets the engine
 * hand judgements up through React state and the drain stay idempotent.
 */
export function newJudgement(a: string, b: string, o: Outcome, m: LogMode): Judgement {
  const t = Date.now();
  // Time plus a counter. Two duels can land in the same millisecond during a
  // fast streak, so the timestamp alone would collide; the counter separates
  // them within a run, and the timestamp separates one run from the next. Kept
  // short because it is stored on every row — an id nobody reads is pure cost.
  const id = `${t.toString(36)}${(counter++).toString(36)}`;
  return { id, a, b, o, m, t };
}
