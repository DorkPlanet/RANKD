import type { Film } from "./types";
import { seedScore } from "./tiers";

// The five films the tutorial runs on.
//
// ── What these are FOR, which changed ──────────────────────────────────────
//
// They used to be the fallback library: open the app with empty storage and
// these were simply your films. That confused people, reasonably — a new user
// was dropped into somebody else's taste and had to work out that none of it
// was theirs. A new library should be empty, and the import is the onboarding.
//
// So they have one job now. They are the cast of the tutorial, and they are
// never written to the library. Nothing here is yours; you tap through them
// once to learn the gestures and they are gone.
//
// ── Why these five ─────────────────────────────────────────────────────────
//
// Chosen so they CANNOT be ranked by quality. A prison drama, a slasher, a 1949
// noir, a cartoon-noir comedy and a Japanese monster film, spanning 1949 to
// 1996. There is no consensus order for that set — the only way to sort it is
// "which would I rather watch tonight", which is the entire thesis of the app
// and the one thing a tutorial has to teach.
//
// A set of five agreed masterpieces was considered and rejected for the
// opposite reason: it has a right answer, so it would teach the reader to rank
// by reputation on the very screen built to stop them.
//
// Five genres also means five posters that look nothing alike, which is what
// makes the dealing animation legible when three of them fly into three piles.
//
// ── Why they all sit at 4★ ─────────────────────────────────────────────────
//
// Films sharing a star rating are a tier, and a tier is the unit both modes
// operate on. Split across ratings there would be nothing for Rough Cut to deal
// and nothing for a duel to argue about. Tied on score for the same reason the
// old set was: the order starts arbitrary, which is the problem being solved.
//
// Posters resolved through the app's own TMDb route, so they are the same
// artwork the real library would fetch. `Godzilla` and `Scream` are both titles
// with far more famous namesakes; they match correctly because `bestMatch`
// scores the year, and they are a standing check that it still does.

const IMG = "https://image.tmdb.org/t/p/w342";

const RAW: Omit<Film, "score">[] = [
  {
    id: "the-shawshank-redemption-1994",
    title: "The Shawshank Redemption",
    year: "1994",
    rating: 4,
    poster: `${IMG}/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg`,
    tagline: "Fear can hold you prisoner. Hope can set you free.",
  },
  {
    id: "scream-1996",
    title: "Scream",
    year: "1996",
    rating: 4,
    poster: `${IMG}/3O3klyyYpAZBBE4n7IngzTomRDp.jpg`,
    tagline: "Someone has taken their love of scary movies one step too far.",
  },
  {
    id: "the-third-man-1949",
    title: "The Third Man",
    year: "1949",
    rating: 4,
    poster: `${IMG}/rO2Fq0AZZx9obs52KJdx4mRE8p5.jpg`,
    // No tagline. The film's period ones do not survive being quoted straight,
    // and inventing a line for a real film is not a thing this app should do —
    // `FilmInfo` simply omits the quote when there isn't one.
  },
  {
    id: "who-framed-roger-rabbit-1988",
    title: "Who Framed Roger Rabbit",
    year: "1988",
    rating: 4,
    poster: `${IMG}/lYfRc57Kx9VgLZ48iulu0HKnM15.jpg`,
    tagline: "It's the story of a man, a woman, and a rabbit in a triangle of trouble.",
  },
  {
    id: "godzilla-1954",
    title: "Godzilla",
    year: "1954",
    rating: 4,
    poster: `${IMG}/2W0Yw0qrgVMgdsSCZRKtfvaAh0i.jpg`,
    // Same reasoning as The Third Man: the English taglines belong to the
    // re-cut 1956 release, not to Honda's film.
  },
];

/**
 * The tutorial's cast.
 *
 * Still exported under this name because `store.ts` uses it to recognise a
 * browser that only ever held the sample set — see `isUntouchedSeed`, which is
 * what stops sync asking a device with nothing to lose to choose between the
 * sample and a real account.
 */
export const SEED_FILMS: Film[] = RAW.map((f) => ({ ...f, score: seedScore(f.rating) }));
