// Why this browser's duel log is empty.
//
// An empty log means one of two completely different things, and until this
// flag existed the app could not tell them apart:
//
//   · **Nothing has happened here yet.** A second device that imported a
//     Letterboxd CSV and has not played. There is no evidence to lose, so a
//     merge with a device that HAS played is trivially safe — the union of an
//     empty log and a real one is the real one, and it invents nothing.
//
//   · **The user threw it away on purpose.** "Clear my ranking" calls
//     `clearLog` precisely so the model cannot re-place everything from the
//     same duels (see the header of `reset.ts`). Merging would union the other
//     device's evidence back in and hand back the ranking they just asked to be
//     rid of, which is the one outcome the reset existed to produce.
//
// `canMerge` used to refuse both, so the second device's very first sync met
// the two-libraries chooser — a question with no good answer, asked at the
// worst moment, about a situation with nothing at stake. This flag lets the
// first case merge silently and keeps the question for the second.
//
// ── Deliberately NOT synced ────────────────────────────────────────────────
//
// It is not in `SYNC_KEYS`, so it never rides to the account and a pull never
// clears it. That is on purpose: it records an intent formed on THIS browser,
// and the same statement made on another device says nothing about this one.
// The symmetric question — "was the SERVER's empty log deliberate?" — is
// genuinely unanswerable from here, and `canMerge` still asks it out loud
// rather than guessing.
//
// ── It does not need clearing ──────────────────────────────────────────────
//
// `canMerge` only consults it when the local log is empty, so the moment a
// single duel is fought the flag stops being reachable. Leaving it set is
// therefore harmless, and clearing it on the next write would mean another
// guard on the duel path for no gain. `wipeEverything` removes it with every
// other `rankd-` key.

const KEY = "rankd-cleared-v1";

/** Called by "Clear my ranking", immediately alongside `clearLog`. */
export function markRankingCleared(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Out of quota or storage denied. The cost is one extra chooser in a rare
    // case, which is exactly the behaviour that shipped before this existed —
    // so failing quietly is strictly no worse than not having the flag.
  }
}

/** Was this browser's empty log the user's decision rather than its history? */
export function rankingWasCleared(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
