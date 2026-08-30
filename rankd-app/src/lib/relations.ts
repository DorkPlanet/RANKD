// What the record already PROVES — the deductive half of the evidence log.
//
// lib/log.ts keeps every duel anyone has ever answered, and says of itself that
// it stays "deliberately dumb: no inference, no scores, no opinions about what a
// row means". This file is the one place allowed to have an opinion, and it is
// the narrowest possible one: if you said A beat B and B beat C, then you have
// already decided A over C, and the app has no business asking you again.
//
// That is the whole feature. lib/ladder.ts mints a row for every duel and never
// reads one back, so each pass of the climb re-derives what earlier passes
// established — which is exactly why a tier costs n(n-1)/2 duels (log.ts:4-8
// names this cost and nothing has ever acted on it). A 185-film tier is 17,020
// comparisons; test/climbCost.test.ts measures it.
//
// ── Why this is not lib/bayes.ts ────────────────────────────────────────────
//
// bayes.ts fits a Bradley-Terry model over the same rows and says of itself
// "Nothing in this file moves the list". It is probabilistic: it will happily
// tell you A is probably better than C, and being merely probable is precisely
// why it is not allowed to touch a ranking.
//
// This file is DEDUCTIVE. It never returns an ordering the user did not commit
// themselves to by hand, one tap at a time. It answers "did you already decide
// this?" and, when the honest answer is anything short of yes, it answers null
// and the duel gets asked. That difference is the entire licence for the climb
// to act on what comes out of here, and the two must not be blended: a belief
// leaking into this oracle would turn a guess into a locked-in rank.
//
// Pure, and holds no state. Callers memoise it; see DuelScreen.

import type { Judgement, LogMode } from "./log";

/** The unordered key for a pair, so (A,B) and (B,A) resolve identically. */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** What the record implies about a pair. `null` means "undecided — go and ask". */
export type Known = "a" | "b" | "draw" | null;

export interface Oracle {
  /** What the record already implies. `a`/`b` name the argument that won. */
  known(a: string, b: string): Known;
}

export interface Relations extends Oracle {
  readonly ids: readonly string[];
  /** Strict-win reachability, one direction. Does not check for a cycle. */
  beats(a: string, b: string): boolean;
  /** Mutually reachable — the record contradicts itself about this pair. */
  contested(a: string, b: string): boolean;
  readonly stats: {
    nodes: number;
    /** Direct strict-win edges, after deduplication. */
    edges: number;
    /**
     * Pairs the oracle can answer.
     *
     * LAZY, and it has to be: this is an O(n²) sweep over `known`, the closure is
     * rebuilt after every duel, and only the progress readout ever asks. Computed
     * eagerly it cost more than the closure it describes and turned a 200-film
     * simulation from seconds into minutes.
     */
    readonly decided: number;
    /** Pairs there are in total: n(n-1)/2. */
    pairs: number;
  };
}

// ── Which rows count as evidence ────────────────────────────────────────────
//
// Duels the user answered face to face. Deliberately NOT "drag": dragging a row
// in the list synthesises judgements (lib/reorder.ts) against films an algorithm
// picked by sampling around the drop point, not against films a finger chose.
// The rows are real opinions about position and belong in the log — they are
// just not the thing this oracle is entitled to skip a duel over.
//
// "spotlight" is legacy and nothing writes it any more, but rows carrying it are
// on people's devices and were real head-to-head answers, so they count.
const EVIDENCE_MODES: ReadonlySet<LogMode> = new Set<LogMode>(["koth", "promotion", "shuffle", "spotlight"]);

// A remembered draw settles the pair it was made about, and nothing else.
//
// The user looked at exactly these two films and declined to separate them.
// Re-asking is the same wasted work this file exists to remove, and `settle`
// already knows what a draw does to the pile. Named rather than inlined because
// it is the one judgement call here that reasonable people could differ on.
const AUTO_RESOLVE_DRAWS = true;

// ── The closure ─────────────────────────────────────────────────────────────
//
// Bitset Warshall. At n=200 the adjacency is 200 × 7 words = 5.6 KB and the
// closure is 280k word-ORs — comfortably sub-millisecond, which is what lets
// callers rebuild from scratch on every duel instead of maintaining an
// incremental structure. That matters for correctness, not just simplicity:
// Undo retracts rows, and a patched closure cannot un-derive what a retracted
// row implied. Rebuilding always can.

export function buildRelations(
  ids: readonly string[],
  log: readonly Judgement[],
  journal: readonly Judgement[] = [],
  opts: { modes?: ReadonlySet<LogMode> } = {},
): Relations {
  const modes = opts.modes ?? EVIDENCE_MODES;
  const index = new Map<string, number>();
  ids.forEach((id, i) => index.set(id, i));
  const n = ids.length;
  const W = Math.max(1, Math.ceil(n / 32));
  const adj = new Uint32Array(n * W);

  // Direct rows, by unordered pair. A pair the user answered twice keeps both
  // answers, because two rows that disagree are a fact about the record and not
  // a tie to be broken here.
  const direct = new Map<string, Set<"a" | "b" | "draw">>();

  let edges = 0;
  const consider = (j: Judgement) => {
    if (!modes.has(j.m)) return;
    const ai = index.get(j.a);
    const bi = index.get(j.b);
    if (ai === undefined || bi === undefined || ai === bi) return;

    // Direct facts are stored oriented to the pair's canonical order, so the
    // lookup does not have to care which way round the row was written.
    const key = pairKey(j.a, j.b);
    const flip = j.a > j.b; // canonical order is (min, max)
    const seen = direct.get(key) ?? new Set<"a" | "b" | "draw">();
    seen.add(j.o === "draw" ? "draw" : flip ? (j.o === "a" ? "b" : "a") : j.o);
    direct.set(key, seen);

    // A draw creates no edge — see `known` below for why that is not negotiable.
    if (j.o === "draw") return;
    const [w, l] = j.o === "a" ? [ai, bi] : [bi, ai];
    const word = w * W + (l >> 5);
    const bit = 1 << (l & 31);
    if ((adj[word] & bit) === 0) {
      adj[word] |= bit;
      edges++;
    }
  };

  for (const j of log) consider(j);
  for (const j of journal) consider(j);

  // Warshall: if i reaches k, i reaches everything k reaches.
  for (let k = 0; k < n; k++) {
    const kWord = k >> 5;
    const kBit = 1 << (k & 31);
    const kRow = k * W;
    for (let i = 0; i < n; i++) {
      const iRow = i * W;
      if ((adj[iRow + kWord] & kBit) === 0) continue;
      for (let w = 0; w < W; w++) adj[iRow + w] |= adj[kRow + w];
    }
  }

  const reach = (ai: number, bi: number): boolean => (adj[ai * W + (bi >> 5)] & (1 << (bi & 31))) !== 0;

  const beats = (a: string, b: string): boolean => {
    const ai = index.get(a);
    const bi = index.get(b);
    return ai !== undefined && bi !== undefined && reach(ai, bi);
  };

  const contested = (a: string, b: string): boolean => beats(a, b) && beats(b, a);

  /**
   * The resolution rule, in order. Both branches exist to REFUSE as often as
   * they answer — an oracle that guesses is worse than no oracle at all, because
   * the climb acts on what it says.
   */
  const known = (a: string, b: string): Known => {
    const ai = index.get(a);
    const bi = index.get(b);
    if (ai === undefined || bi === undefined || ai === bi) return null;

    // 1. The user answered THIS pair. Their answer is the answer, and the
    //    closure is never consulted for a pair they actually saw.
    //
    //    This holds even when the pair sits inside a cycle. a>b>c>a is three
    //    taps, each of them the user's own; handing one of them back is not an
    //    inference and needs no deduction to justify it. What the cycle costs is
    //    the pairs nobody judged — those are refused below, and `decidedOrder`
    //    refuses the pile outright. `contested` reports the contradiction for
    //    anything that wants to surface it.
    const seen = direct.get(pairKey(a, b));
    if (seen && seen.size > 0) {
      // Two rows disagreeing is a contradiction, not a tie-break. Picking the
      // most recent would be choosing a winner at read time, which is exactly
      // what log.ts:230-233 refuses to do at merge time. `null` re-asks the
      // pair, and the fresh answer settles it — self-healing rather than silent.
      if (seen.size > 1) return null;
      const [only] = seen;
      if (only === "draw") return AUTO_RESOLVE_DRAWS ? "draw" : null;
      // Stored canonically; flip back if the caller asked the other way round.
      return a < b ? only : only === "a" ? "b" : "a";
    }

    // 2. Never asked. Consult the closure.
    const ab = reach(ai, bi);
    const ba = reach(bi, ai);
    // A cycle makes the closure claim BOTH directions. Acting on whichever was
    // tested first would silently pick a side of a contradiction the user
    // created, so the pair is unknown and gets re-asked — which is also the
    // right remedy, since the films in the cycle are precisely the ones they
    // contradicted themselves about. Damage stays inside the strongly-connected
    // component: pairs spanning different components are reachable in at most
    // one direction and stay decided.
    if (ab && ba) return null;
    if (ab) return "a";
    if (ba) return "b";
    return null;
  };

  let decidedCache: number | undefined;

  return {
    ids,
    known,
    beats,
    contested,
    stats: {
      nodes: n,
      edges,
      pairs: (n * (n - 1)) / 2,
      get decided(): number {
        if (decidedCache !== undefined) return decidedCache;
        let d = 0;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) if (known(ids[i], ids[j]) !== null) d++;
        }
        return (decidedCache = d);
      },
    },
  };
}

/**
 * The unique total order the record implies over `ids`, or null if it implies
 * none.
 *
 * ── Why counting, and not a topological sort ───────────────────────────────
 *
 * The obvious test is a topological sort that demands exactly one source at
 * every step. It is correct, and it is O(n³) once each step rescans the pile —
 * 8 million oracle calls on a 200-film tier, on every duel. Too slow for
 * something the confirm screen has to ask before it renders.
 *
 * Counting is the same test in one pass. Score each film by how many of the
 * others it is KNOWN to beat, then require those counts to be exactly the set
 * {0, 1, … n-1}, one film each.
 *
 * That is sufficient, not just necessary. The film scoring n-1 beats everyone,
 * so it is the unique top; removing it leaves every other count untouched
 * (nothing else beat it), so the remainder scores exactly {0 … n-2} and the
 * argument repeats. Sorting by the count then yields the order.
 *
 * And it refuses in all three cases the topological sort refuses, for the same
 * underlying reason — a missing edge costs somebody a point and forces a
 * duplicate count:
 *
 *   · an undecided pair -> neither film scores for it -> counts collide -> null
 *   · a drawn pair      -> contributes no edge, likewise                -> null
 *   · a cycle           -> `known` answers null both ways, likewise     -> null
 *
 * Checking instead whether the pile's CURRENT order is a chain of known wins
 * would be wrong in both directions: the record can totally order a pile that
 * happens to be arranged against it, and a chain of adjacent wins says nothing
 * about the pairs that are not adjacent.
 *
 * O(n²).
 */
export function decidedOrder(ids: readonly string[], oracle: Oracle): string[] | null {
  const n = ids.length;
  if (n < 2) return [...ids];
  const wins = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const o = oracle.known(ids[i], ids[j]);
      if (o === "a") wins[i]++;
      else if (o === "b") wins[j]++;
      // "draw" and null score for neither, which is what forces the refusal.
    }
  }
  const seen = new Uint8Array(n);
  for (const w of wins) {
    if (w >= n || seen[w]) return null; // a duplicate count = an undecided pair
    seen[w] = 1;
  }
  return ids.map((id, i) => ({ id, w: wins[i] })).sort((x, y) => y.w - x.w).map((e) => e.id);
}
