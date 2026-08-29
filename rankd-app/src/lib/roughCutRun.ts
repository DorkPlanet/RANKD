// A Rough Cut pass you walked away from.
//
// ── What was actually lost, and what was not ───────────────────────────────
//
// Nothing you decided. Leaving a pass — by Done, by the nav, by closing the tab
// — applies it, and the scores that result ARE the piles (see `bandsOf`). So a
// pass abandoned two-thirds through kept two-thirds of a sorted tier.
//
// What was lost was your PLACE IN THE QUEUE. A cut sets no lock, so every film
// you had already filed was still in `roughCutPool` the next time you opened
// the mode, and the pass started again from the top of the whole tier. You did
// not lose work; you were asked to redo it, which over a 185-film tier is the
// same thing in every way that matters to the person doing it.
//
// ── Why ids and not films ──────────────────────────────────────────────────
//
// The same reasoning as `runs.ts`: this stores which films and in what order,
// never the films themselves. The library is the source of truth for what a
// film IS, and a stored copy would go stale the moment artwork arrived or a
// score moved. `resume` re-reads every id against the library it is handed and
// refuses the lot if the shape no longer matches.
//
// Excluded from the file backup for the same reason a half-climb is: a backup
// carries what you decided, and this is the part you had not decided yet.

import type { Bucket } from "./roughCut";
import type { Rating } from "./tiers";
import type { Film } from "./types";
import { keyFor } from "./medium";

// ── Why the key below is a function and not a constant ─────────────────────
//
// `const KEY = keyFor("…")` would be evaluated once, at module load. Next
// renders client components on the SERVER first, where there is no
// `localStorage` and `currentMedium()` therefore answers with the default — so a
// const would bake in "film" for that pass. The browser bundle evaluates the
// module again and would get it right, which makes this the kind of bug that
// shows up in one server-rendered frame and in no test whatsoever.
//
// A function asks at the moment of use, when the answer is knowable, and costs
// a map lookup: `currentMedium` caches after its first read.

// Per medium — it names ids from one library. See lib/medium.ts.
const KEY = () => keyFor("rankd-roughcut-v1");

/** How a pass looks on disk. Ids only — see the note above. */
interface StoredPass {
  tier: Rating;
  /** The queue, in the order it was dealt. */
  order: string[];
  /** How far in, as an index into `order`. */
  at: number;
  /** What has been filed so far, as id → pile. */
  choices: Record<string, Bucket>;
  /** Which pass over this tier — a refine is pass 2, and the screen says so. */
  n: number;
}

export interface ResumedPass {
  tier: Rating;
  films: Film[];
  at: number;
  choices: Map<string, Bucket>;
  n: number;
}

/**
 * Keep the pass, or clear the stored one when there is nothing worth keeping.
 *
 * A pass that has not started and one that has finished are both cleared. The
 * first has nothing to offer; the second was applied on the way out, so
 * offering it back would resume a pass whose every answer is already in the
 * library — and re-filing them would be harmless but baffling.
 */
export function saveRoughCut(pass: ResumedPass | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!pass || pass.at <= 0 || pass.at >= pass.films.length) {
      localStorage.removeItem(KEY());
      return;
    }
    const stored: StoredPass = {
      tier: pass.tier,
      order: pass.films.map((f) => f.id),
      at: pass.at,
      choices: Object.fromEntries(pass.choices),
      n: pass.n,
    };
    localStorage.setItem(KEY(), JSON.stringify(stored));
  } catch {
    // Storage full or disabled. The pass is still applied on exit, so the cost
    // is the resume, not the work.
  }
}

/**
 * The stored pass, rebuilt against the library as it stands — or null.
 *
 * Refuses rather than repairs. Every id has to still be there, the index has to
 * be inside the queue, and the tier has to match what the caller is opening. A
 * pass rebuilt from a library that has moved underneath it would put films in
 * piles the user never chose, and there is no version of that worth having over
 * simply starting again.
 */
export function loadRoughCut(films: readonly Film[], tier: Rating): ResumedPass | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredPass;
    if (s.tier !== tier || !Array.isArray(s.order)) return null;

    const byId = new Map(films.map((f) => [f.id, f]));
    const queue = s.order.map((id) => byId.get(id));
    if (queue.some((f) => !f)) return null; // a film left the library

    if (typeof s.at !== "number" || s.at <= 0 || s.at >= queue.length) return null;

    return {
      tier,
      films: queue as Film[],
      at: s.at,
      choices: new Map(Object.entries(s.choices ?? {})),
      n: typeof s.n === "number" && s.n > 0 ? s.n : 1,
    };
  } catch {
    return null;
  }
}

/** Throw the stored pass away. Called when one is finished or abandoned. */
export function clearRoughCut(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY());
  } catch {
    // nothing to fall back to
  }
}
