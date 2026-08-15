// Picking the right film out of a TMDb search.
//
// Lifted out of app/api/film/route.ts so it can be tested: a route file may only
// export HTTP handlers, and this is the piece most worth having tests on — it
// decides which artwork a film wears, and getting it wrong is invisible until
// somebody notices the poster is for a different movie.

export interface Candidate {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  popularity?: number;
}

// ── Choosing which film TMDb actually meant ─────────────────────────────────
//
// This route used to take `results[0]` and ask no further questions. TMDb's
// search is fuzzy and ranks by popularity, so a title it does not hold returns
// the most popular thing that shares a word with it — and the app then showed a
// confident, wrong poster. That is worse than showing nothing: a blank says
// "not found", where the wrong artwork says "found it" and is believed.
//
// So the candidates are scored and the winner has to clear a bar. Anything that
// does not is treated as no match, which is a case this route already handles.

/** Comparable form of a title: case, accents, punctuation and articles removed. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // ── Combining marks are deleted; every other oddity becomes a space ─────
    //
    // The distinction matters. After NFD an accented letter is its plain base
    // plus a combining mark, so the mark has to vanish outright or "Amélie"
    // comes out as "ame lie". Everything else non-alphanumeric is a SEPARATOR
    // and has to become a space, or "WALL·E" folds to "walle" while a library
    // holding "WALL-E" folds to "wall e" and the two stop matching each other.
    //
    // Done by code point rather than by a regex character class on purpose. The
    // range is U+0300–U+036F, which written literally is a run of invisible
    // combining characters — a form any editor, linter or transfer is entitled
    // to renormalise, and if it did the class would quietly empty and accented
    // titles would silently stop matching. This cannot be reformatted wrong.
    .split("")
    .filter((ch) => {
      const cp = ch.codePointAt(0)!;
      return cp < 0x0300 || cp > 0x036f;
    })
    .join("")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

/** Words in `want` that `have` also has, as a fraction of `want`. */
function overlap(want: string, have: string): number {
  const a = want.split(" ").filter(Boolean);
  if (a.length === 0) return 0;
  const b = new Set(have.split(" ").filter(Boolean));
  return a.filter((w) => b.has(w)).length / a.length;
}

/**
 * The best candidate, or null when none of them is convincingly the film asked
 * for.
 *
 * Title agreement is the gate and the year is a tie-breaker, in that order.
 * The other way round would let a year match drag in a wrong film — plenty of
 * unrelated films came out in 1997 — while a right film with a year one either
 * side of ours is extremely common, because TMDb dates a release and an import
 * usually carries the production year.
 */
export function bestMatch(results: Candidate[], title: string, year: string | null): Candidate | null {
  const want = normalise(title);
  let best: { c: Candidate; score: number } | null = null;

  for (const c of results) {
    const names = [c.title, c.original_title].filter(Boolean).map((n) => normalise(n!));
    if (names.length === 0) continue;

    // Exact is exact. Otherwise the best word overlap either title can manage —
    // which is what lets "Dawn of the Dead" match and stops "Dawn" matching it.
    const exact = names.some((n) => n === want);
    const words = Math.max(...names.map((n) => overlap(want, n)));
    let score = exact ? 1 : words * 0.8;

    if (year && c.release_date) {
      const off = Math.abs(Number(c.release_date.slice(0, 4)) - Number(year));
      // One year out is normal and costs nothing. Further out is a real signal
      // that this is a different film with the same name — a remake, usually.
      if (off <= 1) score += 0.15;
      else if (off >= 5) score -= 0.25;
    }

    // A hair of popularity, purely to break ties between equally-titled hits.
    score += Math.min(0.05, (c.popularity ?? 0) / 2000);

    if (!best || score > best.score) best = { c, score };
  }

  // 0.6 lets a partial-but-clear title through — a subtitle we do not carry, a
  // stray "The" — and refuses the popularity-ranked stranger that shares one
  // word. Below this, no artwork is the honest answer.
  return best && best.score >= 0.6 ? best.c : null;
}

