// Combining two devices' libraries without asking anybody anything.
//
// ── What `reconcile.ts` got right, and where it over-reached ───────────────
//
// Its argument is that two libraries cannot be combined "without inventing
// judgements the user never made", because the library holds scores and locks
// that `ladder.ts` derived from one particular sequence of duels. That is
// correct about the DERIVED state and it is not correct about the EVIDENCE. A
// union of two evidence logs invents nothing — every row is a duel somebody
// really fought — and `fitBeliefs` is order-independent by construction, so the
// merged evidence has one well-defined answer rather than depending on how the
// two histories interleave.
//
// So the merge here is: union the evidence, union the things the user AUTHORED,
// and throw away everything that was merely derived — because it can be derived
// again, correctly, from the union. That is the whole idea.
//
// ── The one case this still refuses ────────────────────────────────────────
//
// A log that is empty BY INTENT while the other side has evidence. "Clear my
// ranking" throws the log away precisely so the model cannot re-place
// everything from the same duels (see `reset.ts`); merging would union that
// evidence straight back in and hand over the ranking they asked to be rid of.
// So it is left to the chooser, which is the one question actually worth
// asking. `cleared.ts` is how intent is told from circumstance.
//
// ── What this used to refuse, wrongly (fixed 21 Aug 2026) ──────────────────
//
// The rule was simply "both logs must be non-empty", and the note here claimed
// the innocent case — a device that imported but never played — was "routed to
// `pull` before it ever reaches here". **It was not, and that is verified:**
// `reconcile` only pulls when there is no local library, an imported device has
// one, and `saveFilms` marks it dirty. So import-then-sync on a second device
// landed in the chooser every time, over a situation with nothing at stake —
// the union of an empty log and a real one is the real one.
//
// It also refused when NEITHER side had any evidence, which asks the user to
// choose between two libraries that have nothing to disagree about.
//
// Both of those now merge. The symmetric question — was the SERVER's empty log
// deliberate? — cannot be answered from this device, so it is still asked.

import { beliefsFor } from "./beliefs";
import { isHard } from "./lock";
import { mergeStoredLogs, parseLog, type Judgement } from "./log";
import { placeSettled, respreadTier } from "./shuffle";
import type { Film } from "./types";

/** Films keyed by id, tolerant of anything unparseable. */
function parseFilms(raw: string | null | undefined): Film[] {
  if (!raw) return [];
  try {
    const films = JSON.parse(raw) as Film[];
    return Array.isArray(films) ? films.filter((f) => f && typeof f.id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * One film, from two versions of it.
 *
 * The split is by PROVENANCE, not by field type:
 *
 *  · **Authored** — `rating`, `pinnedMeta`, `tmdbId`, and a hard lock. These are
 *    things the user said. A hard lock from either side survives, because a
 *    confirm is a commitment and losing one silently is the outcome this whole
 *    exercise is trying to avoid. `pinnedMeta` is a correction the user made to
 *    a wrong match and `types.ts` is emphatic that it has to STICK.
 *  · **Derived** — `score`, `duels`, and a soft lock. Deliberately taken from
 *    neither side: the caller re-derives them from the merged log, and keeping
 *    a stale value would fight that. `duels` is kept as the larger of the two
 *    only so the number is not visibly wrong between the merge and the refit.
 *  · **Cache** — poster, title, cast, genres and the rest of the TMDb spill.
 *    Either side will do; prefer whichever actually has a value.
 */
function mergeFilm(mine: Film, theirs: Film): Film {
  const hard = isHard(mine) || isHard(theirs);
  // Whichever side has fought more duels with this film is the better source
  // for the cache fields too — it is the device that has been using it.
  const richer = (mine.duels ?? 0) >= (theirs.duels ?? 0) ? mine : theirs;
  const other = richer === mine ? theirs : mine;

  // Spread the poorer side first, so the richer one wins every field it has —
  // and an `undefined` on the richer side does not overwrite a real value,
  // because `JSON.parse` never produces explicit `undefined` properties. That
  // is what makes this a fill rather than a clobber.
  const merged: Film = { ...other, ...richer };

  merged.duels = Math.max(mine.duels ?? 0, theirs.duels ?? 0);
  // The user's own correction wins over an unpinned guess from either side.
  if (mine.pinnedMeta || theirs.pinnedMeta) merged.pinnedMeta = mine.pinnedMeta ?? theirs.pinnedMeta;
  if (hard) merged.lock = "hard";
  return merged;
}

/** The union of two libraries, best-evidenced version of each film. */
export function mergeFilmLists(mine: readonly Film[], theirs: readonly Film[]): Film[] {
  const byId = new Map<string, Film>();
  for (const f of mine) byId.set(f.id, f);
  for (const f of theirs) {
    const seen = byId.get(f.id);
    byId.set(f.id, seen ? mergeFilm(seen, f) : f);
  }
  return [...byId.values()];
}

/**
 * Can these two be merged, or does it need a human?
 *
 * See the header: an empty log on one side only is the signature of a
 * deliberate reset, and merging would undo it.
 */
export function canMerge(
  mineLog: string | null | undefined,
  theirsLog: string | null | undefined,
  /**
   * Whether THIS browser's empty log is the user's decision rather than its
   * history. Defaults false, so a caller that does not know gets the cautious
   * answer — which is the old behaviour for the case that matters.
   */
  mineWasCleared = false,
): boolean {
  const mine = parseLog(mineLog).judgements.length;
  const theirs = parseLog(theirsLog).judgements.length;

  // The one question worth asking. My log is empty because I emptied it, and
  // theirs is not: a union hands back exactly what I threw away.
  if (mine === 0 && theirs > 0 && mineWasCleared) return false;

  // Their log is empty and mine is not. Merging keeps my evidence, which is
  // real work — but if they cleared on purpose, it would resurrect a ranking on
  // their device at the next sync, and nothing here can tell which it was.
  // Left as a question, exactly as before.
  if (theirs === 0 && mine > 0) return false;

  // Everything else is a safe union: both sides have evidence, or the empty
  // side is empty because nothing has happened on it, or neither side has any.
  return true;
}

/**
 * Re-derive everything that was only ever an output.
 *
 * Run over the MERGED library and the MERGED log, because both sides' scores
 * and soft locks were fitted from half the evidence and are now stale. Hard
 * locks are not touched: they are the user's own commitments, and
 * `respreadTier` with `movePlaced: false` pins them where they are rather than
 * letting the model move something somebody confirmed.
 *
 * Cheap enough to do inline — `beliefs.ts` measures 10k judgements at 80ms, and
 * this happens once, on a reconciliation that is already doing network I/O.
 */
export function rederive(films: readonly Film[], log: readonly Judgement[]): Film[] {
  const beliefs = beliefsFor(films, log);
  let out = placeSettled(films, beliefs);
  // Every tier that actually holds something. A tier is respread as a whole
  // because a score only means anything relative to its band.
  for (const tier of new Set(out.map((f) => f.rating))) {
    out = respreadTier(out, tier, beliefs, false);
  }
  // The duel count is evidence, not opinion: count the rows rather than trust
  // either side's tally, which could double if both devices played the same
  // film.
  const counts = new Map<string, number>();
  for (const j of log) {
    counts.set(j.a, (counts.get(j.a) ?? 0) + 1);
    counts.set(j.b, (counts.get(j.b) ?? 0) + 1);
  }
  return out.map((f) => {
    const n = counts.get(f.id) ?? 0;
    return n === (f.duels ?? 0) ? f : { ...f, duels: n };
  });
}

/**
 * Merge the two synced payloads, and re-derive what the merge invalidated.
 *
 * Returns the key set to write and push. Preferences take the local value —
 * they are this device's settings and neither side's is more correct.
 */
export function mergeKeys(
  mine: Record<string, string>,
  theirs: Record<string, string>,
): Record<string, string> {
  const log = mergeStoredLogs(mine["rankd-log-v1"], theirs["rankd-log-v1"]);
  const films = mergeFilmLists(parseFilms(mine["rankd-app-v1"]), parseFilms(theirs["rankd-app-v1"]));
  return {
    ...theirs,
    ...mine,
    "rankd-app-v1": JSON.stringify(rederive(films, parseLog(log).judgements)),
    "rankd-log-v1": log,
  };
}
