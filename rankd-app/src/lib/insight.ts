// The line on a card that makes it worth sharing.
//
// A ranking on its own is a list, and a list is not a thing anyone posts. What
// makes it postable is the app noticing something — that nine of your twelve
// Nolans are sci-fi, that your #1 is a film you rated 3½★, that you put two
// films you have never seen above ones you have. That is the difference between
// a receipt and a claim about you.
//
// ── The rule that keeps it honest ──────────────────────────────────────────
//
// Every generator returns null unless its own preconditions hold, and the
// preconditions are COUNTS, never vibes. An insight is a factual claim printed
// on a picture the user will send to other people; "you clearly favour his
// sci-fi" is a fine thing to say about nine films out of twelve and a
// fabrication about two out of three. The thresholds below are what stops the
// second one from ever being generated.
//
// The optional fields need coverage checks on top, because `genres` only exists
// on films whose artwork has been fetched. Without that, "your favourite genre"
// would silently mean "the favourite genre among the four films you happened to
// have scrolled past".
//
// ── Why selection is seeded, not random ────────────────────────────────────
//
// Variety across cards, stability within one. A card that says something
// different every time it is redrawn is a bug, not personality: the preview and
// the file you downloaded would disagree. So the choice is a pure function of
// the ranking's own identity.

import { fingerprint } from "./profile";
import type { RankSubject } from "./subject";
import { starsFor, type Rating } from "./tiers";

/** Everything an insight can be drawn from. `Film` satisfies it. */
export interface InsightFilm {
  title: string;
  year?: string;
  rating?: Rating;
  genres?: string[];
  guest?: boolean;
}

export interface Insight {
  id: string;
  text: string;
  /**
   * How surprising the claim is, 0–1. The pool self-ranks by this rather than
   * needing a hand-maintained priority list — "your #1 is a 3½★" should beat
   * "you average 4.1★" without anyone having to remember to say so.
   */
  weight: number;
}

// Preconditions. Each is the point below which the claim stops being true
// enough to print on something someone will send to other people.
const MIN_RATED = 4; // any claim about ratings
const MIN_GENRE = 3; // films sharing a genre
const GENRE_SHARE = 0.4; // ...and what fraction of the list they must be
const MIN_DECADE = 3;
const COVERAGE = 0.6; // how much of the list must carry an optional field

const pct = (n: number, of: number) => (of === 0 ? 0 : n / of);

/**
 * Films you have actually seen. Everything rating-based uses only these.
 *
 * Narrowed rather than merely filtered, so a rated film is one whose rating the
 * type system knows exists — `fingerprint` requires that, and it is the same
 * guarantee the filter is already enforcing at runtime.
 */
const seen = (films: readonly InsightFilm[]): (InsightFilm & { rating: Rating })[] =>
  films.filter((f): f is InsightFilm & { rating: Rating } => !f.guest && f.rating !== undefined);

const possessive = (s: RankSubject) =>
  s.kind === "director" || s.kind === "actor" ? "their work" : "this list";

/** "Christopher Nolan's" — or just "these" when the subject isn't a person. */
const possessiveName = (s: RankSubject) =>
  s.kind === "director" || s.kind === "actor" ? `${s.name}'s` : "these";

/**
 * Every claim this ranking can support, best first.
 *
 * Returns an empty array rather than a filler line when nothing qualifies — a
 * card with no insight is better than a card asserting something thin.
 */
export function insightsFor(films: readonly InsightFilm[], subject: RankSubject): Insight[] {
  const out: Insight[] = [];
  const mine = seen(films);
  const n = films.length;
  const add = (id: string, text: string, weight: number) => out.push({ id, text, weight });

  // ── Genre ────────────────────────────────────────────────────────────────
  //
  // A bare count — "10 of these 19 are drama" — is the weakest thing this file
  // can say, and it was the first thing it said. Most directors have a genre, so
  // naming it reports the obvious back to the user. It stays, because it is
  // occasionally the only thing that qualifies, but at a weight low enough that
  // anything else beats it.
  //
  // What IS worth saying about genre is where it sits in YOUR order: that the
  // thrillers finished above the dramas is a fact about you, not about them.
  const withGenres = films.filter((f) => f.genres?.length);
  if (pct(withGenres.length, n) >= COVERAGE) {
    const counts = new Map<string, number>();
    for (const f of withGenres) for (const g of f.genres!) counts.set(g, (counts.get(g) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [top, second] = ranked;
    if (top && top[1] >= MIN_GENRE && pct(top[1], n) >= GENRE_SHARE) {
      add("genre-top", `${top[1]} of these ${n} are ${top[0].toLowerCase()}.`, 0.15);

      // Where a genre lands, not how often it appears. Mean position of one
      // genre against another, and only when the gap is wide enough to mean
      // something — a quarter of the list apart.
      if (second && second[1] >= MIN_GENRE) {
        const meanPos = (name: string) => {
          const at = films.flatMap((f, i) => (f.genres?.includes(name) ? [i] : []));
          return at.reduce((a, b) => a + b, 0) / at.length;
        };
        const a = meanPos(top[0]);
        const b = meanPos(second[0]);
        const [high, low] = a < b ? [top[0], second[0]] : [second[0], top[0]];
        if (Math.abs(a - b) >= n * 0.25) {
          add(
            "genre-versus",
            `You clearly favour the ${high.toLowerCase()} over the ${low.toLowerCase()}.`,
            0.8,
          );
        }
      }

      // A genre that swept the podium is a stronger claim than a genre that is
      // merely common, and it is about the top of your list rather than its bulk.
      const podium = films.slice(0, 3);
      if (podium.length === 3 && podium.every((f) => f.genres?.includes(top[0]))) {
        add("genre-podium", `Your whole top three is ${top[0].toLowerCase()}.`, 0.7);
      }
    }
  }

  // ── How much of their work you have actually seen ────────────────────────
  //
  // Only possible on a run that borrowed films, and it is the most personal
  // number on the card: not what you think of them, but how much of them you
  // have got through.
  const guestCount = films.filter((f) => f.guest).length;
  if (guestCount > 0 && n >= 6) {
    const watched = n - guestCount;
    add(
      "coverage",
      `You've seen ${watched} of ${possessiveName(subject)} ${n} films.`,
      watched <= n * 0.35 ? 0.72 : 0.5,
    );
  }

  // ── The span ─────────────────────────────────────────────────────────────
  const years = films.map((f) => parseInt(f.year ?? "", 10)).filter((y) => !Number.isNaN(y));
  if (pct(years.length, n) >= COVERAGE && years.length >= MIN_DECADE) {
    const span = Math.max(...years) - Math.min(...years);
    if (span >= 20) {
      add("span", `${span} years of films, in one order.`, 0.35);
    }
  }

  // ── Decade ───────────────────────────────────────────────────────────────
  const print = fingerprint(mine);
  if (print.decade && print.decade.count >= MIN_DECADE && pct(print.decade.count, mine.length) >= GENRE_SHARE) {
    add("decade", `Mostly a ${print.decade.label} list. ${print.decade.count} of them.`, 0.4);
  }

  // ── Ratings ──────────────────────────────────────────────────────────────
  if (mine.length >= MIN_RATED && print.generosity) {
    add("average", `You average ${print.generosity.mean.toFixed(1)}★ across ${possessive(subject)}.`, 0.25);

    // A ranking where every film shares a star rating is the purest case for
    // this app existing at all: the stars said nothing and the duels said
    // everything.
    const ratings = new Set(mine.map((f) => f.rating));
    if (ratings.size === 1) {
      add(
        "flat",
        `Every one of these is ${starsFor(mine[0].rating!)}. The order was all you.`,
        0.85,
      );
    }
  }

  // ── Upsets: what only a head-to-head ranking can say ─────────────────────
  const first = films[0];
  if (first && mine.length >= MIN_RATED) {
    const best = Math.max(...mine.map((f) => f.rating!));
    if (first.rating !== undefined && first.rating < best) {
      add("upset-winner", `Your #1 here is only ${starsFor(first.rating)} in your library.`, 0.9);
    }
    const topRatedIndex = films.findIndex((f) => !f.guest && f.rating === best);
    if (topRatedIndex > 2) {
      add(
        "upset-loser",
        `The film you rated highest only finished ${topRatedIndex + 1}th.`,
        0.8,
      );
    }
  }

  // ── Guests: films you ranked without having seen them ────────────────────
  const guests = films.filter((f) => f.guest);
  if (guests.length > 0) {
    // Position matters, not merely presence. "You included unseen films" is
    // trivia; "you put three of them above ones you have seen" is a finding.
    const lastSeen = films.map((f) => !f.guest).lastIndexOf(true);
    const above = films.slice(0, lastSeen).filter((f) => f.guest).length;
    if (above > 0) {
      add(
        "guest-above",
        above === 1
          ? `You put a film you haven't seen above ones you have.`
          : `You put ${above} films you haven't seen above ones you have.`,
        0.95,
      );
    }
    if (films[0]?.guest) {
      add("guest-winner", `Your #1 is a film you haven't even seen yet.`, 1);
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** Tiny deterministic hash, so a card's line is stable for a given ranking. */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One line for a card.
 *
 * Chosen from the strongest few rather than always the single best, so two
 * rankings that happen to share their top finding don't produce identical
 * cards — but seeded, so the same ranking always says the same thing.
 */
export function pickInsight(
  films: readonly InsightFilm[],
  subject: RankSubject,
  seed: string,
): string | undefined {
  const all = insightsFor(films, subject);
  if (all.length === 0) return undefined;
  // Only claims close to the best are candidates; a weak one never wins a
  // coin toss against a strong one.
  const best = all[0].weight;
  const strong = all.filter((i) => i.weight >= best - 0.2);
  return strong[seedOf(seed) % strong.length].text;
}
