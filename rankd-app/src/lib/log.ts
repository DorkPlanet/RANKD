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
// matchmaker, the beliefs the list is sorted against — exists only because these
// rows are kept.
//
// It stays deliberately dumb. No inference, no scores, no opinions about what a
// row means. Just what happened, in order.

import { deviceId, markDirty } from "./syncState";

// Which side won, naming the two ids the row carries: "a" = a beat b, "b" = b
// beat a. "draw" is a Skip — the user declined to separate them — and is never
// turned into a winner by anything reading this log.
export type Outcome = "a" | "b" | "draw";

// Which game the judgement was made in. Kept because the same pair judged during
// a focused climb and during an idle shuffle are not quite the same claim, and
// because it costs one character to keep and cannot be recovered later.
//
// "spotlight" is a LEGACY VALUE and nothing writes it any more — the mode was
// removed. It stays in the union because this log is append-only and never
// edited: rows stamped `s` are already sitting in people's browsers and in their
// backup files, and they are real judgements about real films. Dropping the
// value would make them decode as something they were not, or fail to decode at
// all. An evidence log that rewrites its own history is not evidence.
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
  /**
   * TOMBSTONES — ids that were retracted, kept so they stay retracted.
   *
   * Undo is the one thing that removes a row (`retractJudgements`). That was
   * safe while a log only ever met itself. It is not safe once two logs can be
   * merged: a union by id puts back anything the other device still holds from
   * an earlier sync, so a mis-tap you undid on your phone would silently
   * reappear from your laptop's copy — putting a judgement you never made back
   * into every belief derived from it, which is exactly what `retractJudgements`
   * exists to prevent.
   *
   * So a retraction is itself a fact that has to survive the round trip. Absent
   * on logs written before this existed, which reads correctly as "nothing was
   * ever retracted" — the worst case is one old undo coming back, once.
   *
   * Optional, so `v` does not have to change and every older reader still
   * decodes these files unchanged.
   */
  x?: string[];
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

function encode(js: readonly Judgement[], tombstones: readonly string[] = []): Stored {
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
  const out: Stored = {
    v: 1,
    f,
    r: js.map((j) => [j.id, idx(j.a), idx(j.b), j.o, MODE_CODE[j.m] ?? "k", j.t]),
  };
  // Omitted entirely when empty, which is the overwhelmingly common case — an
  // always-present `"x":[]` would be pure cost on every write.
  if (tombstones.length) out.x = [...tombstones];
  return out;
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

/** A log file's two halves: what happened, and what was taken back. */
export interface LogFile {
  judgements: Judgement[];
  tombstones: string[];
}

const EMPTY_FILE: LogFile = { judgements: [], tombstones: [] };

/**
 * Parse a stored log. Pure, and total — anything unreadable reads as empty.
 *
 * Exported because `sync.ts` has to merge two of these as raw strings without a
 * DOM, and because a pure parse is the only part of this file worth testing on
 * its own.
 */
export function parseLog(raw: string | null | undefined): LogFile {
  if (!raw) return { judgements: [], tombstones: [] };
  try {
    const stored = JSON.parse(raw) as Stored;
    if (!stored || !Array.isArray(stored.f) || !Array.isArray(stored.r)) return { ...EMPTY_FILE };
    return {
      judgements: decode(stored),
      tombstones: Array.isArray(stored.x) ? stored.x.filter((s) => typeof s === "string") : [],
    };
  } catch {
    return { ...EMPTY_FILE };
  }
}

/** Serialise a log file back to what storage and the wire both carry. */
export function serialiseLog(file: LogFile): string {
  return JSON.stringify(encode(file.judgements, file.tombstones));
}

/**
 * Combine two logs into one, losing nothing and inventing nothing.
 *
 * ── Why this is possible at all ────────────────────────────────────────────
 *
 * `reconcile.ts` argues that two libraries cannot be merged "without inventing
 * judgements the user never made". That is exactly right about SCORES and
 * LOCKS, which `ladder.ts` derives from one particular sequence of duels — and
 * exactly wrong about the evidence. Every row in this union is a duel somebody
 * really fought, on one device or the other. Nothing is invented by keeping
 * both.
 *
 * And the model does not care about order: `fitBeliefs` maximises a strictly
 * concave log-posterior, so it has ONE maximum and lands on it regardless of
 * the sequence the evidence arrived in (see the note in `bayes.ts`). A merged
 * log therefore has a single well-defined answer rather than depending on how
 * the two histories interleave.
 *
 * Three properties this relies on, all of them already true:
 *
 *  · **Ids are stable and shared.** Rows both devices hold from an earlier sync
 *    carry identical ids, so common ancestry dedupes exactly rather than
 *    doubling — and doubling would be the dangerous failure, since two copies
 *    of one judgement is two votes for it.
 *  · **Ids are device-scoped**, so two genuinely different duels can never
 *    collide and silently drop one. See `newJudgement`.
 *  · **Contradictions are left alone.** The same pair judged A>B here and B>A
 *    there is two real judgements, and the fit absorbs the disagreement. This
 *    must NOT dedupe by pair — that would be picking a winner, which is the one
 *    thing a merge is not allowed to do.
 *
 * Tombstones from both sides are unioned and applied last, so a retraction on
 * either device wins over the other's stale copy.
 */
export function mergeLogs(a: LogFile, b: LogFile): LogFile {
  const tombstones = [...new Set([...a.tombstones, ...b.tombstones])];
  const dead = new Set(tombstones);

  const byId = new Map<string, Judgement>();
  for (const j of [...a.judgements, ...b.judgements]) {
    if (!dead.has(j.id)) byId.set(j.id, j);
  }

  // Oldest first, the order every reader of this log expects.
  const judgements = [...byId.values()].sort((x, y) => x.t - y.t);
  return { judgements, tombstones };
}

/** Merge two stored logs as they sit on disk and on the wire. */
export function mergeStoredLogs(mine: string | null | undefined, theirs: string | null | undefined): string {
  return serialiseLog(mergeLogs(parseLog(mine), parseLog(theirs)));
}

/** Every judgement ever recorded, oldest first. Empty when there is none. */
export async function loadLog(): Promise<Judgement[]> {
  if (typeof window === "undefined") return [];
  try {
    return parseLog(localStorage.getItem(KEY)).judgements;
  } catch {
    // Corrupt or unreadable. An unreadable log must never take the app down with
    // it — the library is what the user would actually mourn, and it lives
    // elsewhere. Read it as empty and let new judgements start accumulating.
    return [];
  }
}

/** The retracted ids, so a write can preserve them. */
function loadTombstones(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseLog(localStorage.getItem(KEY)).tombstones;
  } catch {
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
    // Tombstones carried through: re-encoding without them would resurrect
    // every undone mis-tap on the next merge.
    localStorage.setItem(KEY, JSON.stringify(encode([...existing, ...fresh], loadTombstones())));
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
    // Recorded as well as removed. Deleting the row locally is not enough once
    // logs can be merged — the other device still holds it, and a union would
    // hand it straight back. See `Stored.x`.
    const tombstones = [...new Set([...loadTombstones(), ...ids])];
    localStorage.setItem(KEY, JSON.stringify(encode(kept, tombstones)));
    markDirty();
  } catch {
    // Same reasoning as the append path: the library is the thing worth
    // protecting, and a log that failed to shrink is merely over-informed.
  }
}

/**
 * Throw the whole log away.
 *
 * The second and last exception to append-only, and narrower than it looks: it
 * exists for ONE caller — "start the ranking again" in Settings — and it is not
 * a tidy-up, a trim or a migration. Everything else in this app treats a fought
 * duel as permanent, and that must stay true.
 *
 * It has to exist because the alternative is worse. Beliefs are fitted from
 * these rows, so a reset that spared them would re-place every film from the
 * same evidence within a session: the user would ask to start over, watch the
 * list empty, and watch it fill back in with the order they were trying to
 * leave. A reset that does not reset is a bug with a friendly label.
 */
export function clearLog(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage disabled. Nothing to fall back to, and the caller has already
    // cleared the placements — the library is consistent, just better-informed
    // than the user asked for.
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
 * A short, stable tag for this browser, memoised.
 *
 * ── Why the id needs one ───────────────────────────────────────────────────
 *
 * `counter` is a module global that resets to 0 on every page load, so the id
 * was only ever unique WITHIN one device's session. That was sufficient while
 * two logs never met. It is not sufficient now that they can be merged: two
 * devices whose first duel of a session lands in the same millisecond mint
 * byte-identical ids, and a union-by-id would silently drop one of two real
 * judgements — the quietest possible way to lose somebody's work.
 *
 * Four characters off the device id. It only has to separate the handful of
 * browsers one person uses, not be globally unique, and it is stored on every
 * row so length is a real cost.
 */
let tag: string | null = null;
function deviceTag(): string {
  if (tag === null) tag = deviceId().slice(-4);
  return tag;
}

/**
 * Mint a judgement. The id is generated here rather than at the storage edge so
 * a row is identifiable the moment it exists — which is what lets the engine
 * hand judgements up through React state and the drain stay idempotent.
 */
export function newJudgement(a: string, b: string, o: Outcome, m: LogMode): Judgement {
  const t = Date.now();
  // Time, a counter, and which browser. Two duels can land in the same
  // millisecond during a fast streak, so the timestamp alone would collide; the
  // counter separates them within a run, the timestamp separates one run from
  // the next, and the device tag separates two people's phones. Kept short
  // because it is stored on every row — an id nobody reads is pure cost.
  //
  // Old rows carry no tag and that is fine: ids are opaque, compared only for
  // equality, and a row minted before this change cannot collide with one
  // minted after it on a different device.
  const id = `${t.toString(36)}${(counter++).toString(36)}-${deviceTag()}`;
  return { id, a, b, o, m, t };
}
