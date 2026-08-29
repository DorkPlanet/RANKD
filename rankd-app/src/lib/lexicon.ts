// What the app calls things, in the medium it is currently about.
//
// ── Why a lexicon and not a translation file ───────────────────────────────
//
// Almost none of the copy in this app is a label. It is sentences — "Tap the
// pile this film belongs in", "Not which is better, but which you'd rather
// watch" — written to say something, and running them through a find-and-replace
// on the word "film" produces text that is grammatical and wrong. "Which you'd
// rather watch" is not "which you'd rather read" by substituting a noun; it is a
// different verb about a different act, and there is no rule that derives one
// from the other.
//
// So this file holds the WORDS, and the sentences at each call site are written
// with the words in them. That means a string with a term in it is still one
// string, still readable in place, and still says what it says — you can read
// `` `Flick a ${L.one} down to send it to the bottom` `` and know exactly what a
// reader sees, in either medium, without leaving the line.
//
// ── The rule for what belongs here ─────────────────────────────────────────
//
// A term goes in the lexicon when the two mediums genuinely disagree about it.
// "Tier", "star", "lock", "pile", "run" and "duel" are Rankd's own words and
// mean the same thing whatever is being ranked, so they are NOT here — putting
// them in would suggest they might one day differ and invite somebody to make
// them differ.
//
// ── Where books have nothing ───────────────────────────────────────────────
//
// A film has two credit roles worth ranking by, a director and an actor. A book
// has one. Google Books returns `authors` and nothing else usable — no
// translator, no illustrator, no narrator — so an "actor run" over a book
// library would be a screen that is always empty.
//
// `secondRole` is therefore `null` for books rather than a word, and the sites
// that offer an actor run ask for it instead of assuming it. A missing feature
// that says so is honest; a feature present and permanently empty is a bug the
// user has to diagnose.

import { currentMedium, type Medium } from "./medium";

export interface Lexicon {
  medium: Medium;

  /** "film" / "book". The unit, lowercase, singular. */
  one: string;
  /** "films" / "books". */
  many: string;
  /** "Film" / "Book". Sentence-initial and standalone labels. */
  One: string;
  /** "Films" / "Books". */
  Many: string;

  /** "watch" / "read". The act, bare infinitive: "which you'd rather ___". */
  verb: string;
  /** "watched" / "read". Past: "Just ___ something?" */
  verbPast: string;
  /** "seen" / "read". Perfect: "films I haven't ___". */
  seen: string;
  /** "watching" / "reading". */
  verbIng: string;

  /** "director" / "author". The credit a run can be built on. */
  maker: string;
  /** "Director" / "Author". */
  Maker: string;
  /** "directors" / "authors". */
  makers: string;

  /**
   * "actor" for films, `null` for books.
   *
   * Null is load-bearing — see the header. Ask before offering a run on it.
   */
  secondRole: string | null;

  /** "poster" / "cover". The artwork. */
  art: string;
  /** "Poster" / "Cover". */
  Art: string;

  /** "runtime" / "pages". What "how long is it" means here. */
  lengthLabel: string;

  /** "Letterboxd" / "Goodreads". Where an import comes from. */
  importFrom: string;
  /** "letterboxd.com" / "goodreads.com". */
  importHost: string;

  /** "TMDb" / "Google Books". Named in error copy, so it must be true. */
  source: string;
}

const FILM: Lexicon = {
  medium: "film",
  one: "film",
  many: "films",
  One: "Film",
  Many: "Films",
  verb: "watch",
  verbPast: "watched",
  seen: "seen",
  verbIng: "watching",
  maker: "director",
  Maker: "Director",
  makers: "directors",
  secondRole: "actor",
  art: "poster",
  Art: "Poster",
  lengthLabel: "runtime",
  importFrom: "Letterboxd",
  importHost: "letterboxd.com",
  source: "TMDb",
};

const BOOK: Lexicon = {
  medium: "book",
  one: "book",
  many: "books",
  One: "Book",
  Many: "Books",
  verb: "read",
  verbPast: "read",
  seen: "read",
  verbIng: "reading",
  maker: "author",
  Maker: "Author",
  makers: "authors",
  secondRole: null,
  art: "cover",
  Art: "Cover",
  lengthLabel: "pages",
  importFrom: "Goodreads",
  importHost: "goodreads.com",
  source: "Google Books",
};

const BY_MEDIUM: Record<Medium, Lexicon> = { film: FILM, book: BOOK };

/**
 * The words for the medium the app is currently about.
 *
 * A function rather than a `const L`, because the medium is resolved from
 * storage on first ask and a module-level constant would freeze whatever the
 * value was at import time — which on the server is the default, for everybody.
 *
 * Cheap enough to call in render: `currentMedium` caches after its first read.
 */
export const lex = (): Lexicon => BY_MEDIUM[currentMedium()];

/** A named medium's words, for the places that show both — the medium switch. */
export const lexOf = (m: Medium): Lexicon => BY_MEDIUM[m];

/**
 * "1 film" / "3 books". The pluralisation every counter was writing by hand.
 *
 * Both mediums pluralise with a bare "s", so this is one function rather than a
 * field. A medium that did not would add the plural to `Lexicon` — which `many`
 * already is, so the change would be to read that instead.
 */
export const count = (n: number, l: Lexicon = lex()): string =>
  `${n} ${n === 1 ? l.one : l.many}`;
