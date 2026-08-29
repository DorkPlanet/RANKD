// Picking the right book out of a Google Books search.
//
// The mirror of `tmdbMatch.ts`, lifted out of the route for the same reason: a
// route may only export HTTP handlers, and this is the piece most worth having
// tests on. It decides which cover a book wears, and getting it wrong is
// invisible until somebody notices the artwork belongs to a different book.
//
// `normalise` is imported rather than copied. The two mediums genuinely agree
// about what "the same title" means — case, accents, punctuation and a leading
// article — and two copies of that function would drift the first time one of
// them learned something.
//
// ── Why this is HARDER than the film case, and the bar is therefore higher ─
//
// TMDb holds one record per film. Google Books holds one per EDITION, plus a
// long tail of things that are not the book at all:
//
//  · Study guides. "SparkNotes: Dune", "Summary of Dune", "Dune: A Reader's
//    Guide" — all of which contain the exact title as a phrase and are wrong.
//  · Omnibus volumes. "The Great Dune Trilogy" is a real book and not the one
//    that was asked for.
//  · Foreign editions, which carry the original title and a cover the reader
//    will not recognise.
//
// The film matcher's gate is title agreement with the year as a tie-breaker.
// That is not enough here: every one of the cases above agrees about the title.
// So this adds two things the film path does not need — a penalty for the words
// that mark a companion volume, and the AUTHOR as a strong signal rather than a
// filter. The author is what actually separates "Dune by Frank Herbert" from
// "Dune: SparkNotes", and it is the field an import is most likely to carry.

import { normalise } from "./tmdbMatch";
import type { Volume } from "./books";
import { yearOf } from "./books";

/**
 * Words that mark a volume ABOUT a book rather than the book.
 *
 * Matched against the normalised title, so they are lowercase and unpunctuated.
 * Deliberately a short list of unambiguous ones: "guide", "summary" and
 * "analysis" appear in plenty of legitimate titles, and a penalty is not a
 * refusal — a real book called "A Field Guide to Getting Lost" loses a little
 * and still wins its search, because nothing else in it looks like a companion.
 */
const COMPANION = [
  "sparknotes",
  "cliffsnotes",
  "shmoop",
  "study guide",
  "summary of",
  "summary and analysis",
  "a novel approach",
  "conversation starters",
  "quicklet",
  "unofficial",
  "companion to",
];

/**
 * Does this title look like something written about the book?
 *
 * Checked on the FULL normalised title including subtitle, because that is
 * where the tell usually sits — "Dune: A Study Guide" has a clean main title
 * and the whole giveaway after the colon.
 */
function looksLikeCompanion(full: string): boolean {
  return COMPANION.some((w) => full.includes(w));
}

/** Words in `want` that `have` also has, as a fraction of `want`. */
function overlap(want: string, have: string): number {
  const a = want.split(" ").filter(Boolean);
  if (a.length === 0) return 0;
  const b = new Set(have.split(" ").filter(Boolean));
  return a.filter((w) => b.has(w)).length / a.length;
}

/**
 * Does any credited author look like the one asked for?
 *
 * Surname-only agreement counts, and that is the point rather than a shortcut.
 * Imports write an author every possible way — "Ursula K. Le Guin", "Le Guin,
 * Ursula K.", "Ursula LeGuin" — and normalising word order for all of them is a
 * losing game. The SURNAME is the stable part, it is rarely ambiguous within one
 * title's search results, and a full-name match is already covered by it.
 *
 * The longest word is used as the surname rather than the last: "Le Guin,
 * Ursula K." puts the surname first, and initials are short. It is a heuristic
 * and it is only ever a tie-breaker, never a gate.
 */
function authorAgrees(want: string, have: string[] | undefined): boolean {
  if (!have?.length) return false;
  const wantWords = normalise(want).split(" ").filter((w) => w.length > 2);
  if (!wantWords.length) return false;
  const surname = wantWords.reduce((a, b) => (b.length > a.length ? b : a));

  return have.some((name) => {
    const n = normalise(name);
    if (n === normalise(want)) return true;
    return n.split(" ").includes(surname);
  });
}

/**
 * The best volume, or null when none of them is convincingly the book asked for.
 *
 * ── What each signal is worth, and why ─────────────────────────────────────
 *
 * The title is the gate, as in the film case. Everything else moves a candidate
 * that already cleared it, because a strong author match on a wrong title is a
 * different book by the same person — which is a worse failure than no match,
 * for exactly the reason the film matcher gives: a blank says "not found", the
 * wrong cover says "found it" and is believed.
 */
export function bestBook(
  results: Volume[],
  title: string,
  author?: string | null,
  year?: string | null,
): Volume | null {
  const want = normalise(title);
  let best: { v: Volume; score: number } | null = null;

  for (const v of results) {
    const info = v.volumeInfo;
    if (!info?.title) continue;

    const main = normalise(info.title);
    // The subtitle is scored SEPARATELY from the main title, not concatenated.
    // Concatenating would let a long subtitle dilute a perfect main title —
    // "Dune" against "Dune: Deluxe Edition, with a New Foreword by…" would score
    // as a quarter match on word overlap, when it is plainly the right book.
    const full = normalise([info.title, info.subtitle].filter(Boolean).join(" "));

    const exact = main === want;
    // The best either form can manage. A library holding "Dune Messiah" should
    // match a volume titled "Dune" with subtitle "Messiah", which the main
    // title alone cannot see.
    const words = Math.max(overlap(want, main), overlap(want, full));
    let score = exact ? 1 : words * 0.8;

    // ── The author, which is the signal that actually does the work ─────────
    //
    // Worth more than the film matcher gives its year, and it has to be: the
    // companion volumes and the omnibuses all pass the title test, and the
    // author is the only field that separates them. A study guide's author is
    // the guide's writer, never the novelist.
    if (author) {
      if (authorAgrees(author, info.authors)) score += 0.3;
      // A real disagreement, not merely a gap. An absent author list says
      // nothing and costs nothing; a present one that names somebody else is
      // evidence against, and it is the exact shape a SparkNotes hit has.
      else if (info.authors?.length) score -= 0.35;
    }

    // Written about the book rather than being it. Large enough to sink a hit
    // that is otherwise a perfect title match, because that is precisely the
    // case — a study guide's title IS the book's title.
    if (looksLikeCompanion(full)) score -= 0.5;

    if (year) {
      const got = yearOf(info.publishedDate);
      if (got) {
        const off = Math.abs(Number(got) - Number(year));
        // Wider than the film matcher's window, and deliberately so. A film has
        // one release year; a book has a first publication and then reprints
        // forever, and Google usually returns the EDITION Google happens to
        // have. A 1965 novel legitimately comes back as 2005. So a close year is
        // a small bonus and a distant one is not evidence of anything.
        if (off <= 2) score += 0.1;
      }
    }

    // A hair of popularity to break ties between equally-titled editions,
    // capped as tightly as the film matcher's. `ratingsCount` rather than the
    // average: a five-star book with four ratings is not the canonical edition,
    // and the count is the thing that says "this is the one people hold".
    score += Math.min(0.05, (info.ratingsCount ?? 0) / 20000);

    if (!best || score > best.score) best = { v, score };
  }

  // 0.6, the same bar as the film matcher, and it means the same thing: a
  // partial-but-clear title gets through, the stranger that shares one word does
  // not. Below this, no cover is the honest answer.
  return best && best.score >= 0.6 ? best.v : null;
}
