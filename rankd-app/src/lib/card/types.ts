// What every share card is drawn from, and what a design has to provide.
//
// Three designs render the same ranking three ways. The thing that keeps them
// from becoming three copies of one file is this: a design is a pure `draw`
// over already-loaded images, and everything awkward — CORS, fonts, colour
// extraction, encoding — happens once in `render.ts` before any of them runs.
//
// A renderer therefore may not fetch, may not await, and may not read the
// library. If it needs a picture it declares the URL up front in `images`.

import type { RankSubject } from "../subject";
import type { Rating } from "../tiers";

/**
 * One row of a card.
 *
 * Deliberately structural rather than `Film`: a card must be renderable from a
 * ranking saved two years ago, whose films may since have left the library. Both
 * `Film` and a stored entry satisfy this.
 *
 * `rating` is optional because a borrowed film has no real one — it was never
 * watched — and because rankings saved before this shape existed carry none.
 */
export interface CardEntry {
  title: string;
  year?: string;
  poster?: string;
  rating?: Rating;
  /** Borrowed for the run and never in the library. Excluded from every average. */
  guest?: boolean;
}

/** The numbers a design may show. Each is absent when the data can't support it. */
export interface CardStats {
  films: number;
  /** Mean star rating across rated, non-guest entries only. */
  avgRating?: number;
  topGenre?: string;
  topDecade?: string;
}

/**
 * Everything a chart on a card is drawn from, resolved at build time.
 *
 * ── Why this cannot be derived at draw time ────────────────────────────────
 *
 * A `CardEntry` carries a title, a year, a poster and a rating, and no genres —
 * deliberately, because an entry has to survive a ranking saved two years ago
 * whose films have since left the library. A renderer may not read the library
 * to fill the gap: it is a pure `draw` over already-loaded images and that rule
 * is what keeps three designs from becoming three data pipelines.
 *
 * So the charts are computed once in `cardDataFromFilms`, over the real `Film[]`
 * while it is still in hand, and handed over as numbers.
 *
 * ── Every field is optional, and that is a feature ─────────────────────────
 *
 * The same rule `CardStats` follows: absent when the data cannot support it. A
 * filmography card is the case that proves it — nineteen films by one director
 * mostly share two genres, so a taste radar over them is a flat circle dressed
 * up as an insight. It is better to draw no chart than a meaningless one, and
 * the dossier's grid closes up around whatever is missing.
 */
export interface CardCharts {
  /** Genre standings, 0 at the bottom of the order and 1 at the top. */
  taste?: { label: string; value: number }[];
  /** Genre counts, commonest first. */
  genres?: { label: string; count: number }[];
  /** Decade counts, commonest first. */
  decades?: { label: string; count: number }[];
  /** Star tiers, high to low. Only the tiers actually holding something. */
  tiers?: { label: string; count: number }[];
}

export interface CardData {
  subject: RankSubject;
  title: string;
  eyebrow: string;
  /**
   * Whose ranking this is, as `@name`.
   *
   * Read from the browser's cached identity when the card is built, not threaded
   * through the four screens that build one — see `cardDataFromFilms`. Absent
   * for a reader who has not claimed a handle, in which case a design simply
   * does not print a byline.
   */
  handle?: string;
  /** Frozen, best first. Renderers truncate; they never reorder. */
  entries: readonly CardEntry[];
  /** A person's photo. Absent for genre and tier, and whenever TMDb had none. */
  portrait?: string;
  stats: CardStats;
  /** The distributions a design may plot. See `CardCharts`. */
  charts?: CardCharts;
  /** One personalised line, already chosen. See lib/insight.ts. */
  insight?: string;
  /**
   * The date the RANKING was made, pre-formatted.
   *
   * Frozen rather than computed at draw time: re-exporting a two-year-old
   * ranking must not stamp it with today, which is what the first version did.
   */
  dateLabel: string;
}

export type CardDesign = "classic" | "marquee" | "paul-allen";

export interface Faces {
  display: string;
  serif: string;
  sans: string;
}

export interface Palette {
  bg: string;
  surface: string;
  gold: string;
  text: string;
  dim: string;
  border: string;
}

/** Everything a `draw` is handed, all of it already resolved. */
export interface Kit {
  faces: Faces;
  palette: Palette;
  /** Pulled from the #1 poster. The card's single point of colour. */
  accent: string;
  /** Keyed by the ORIGINAL url, exactly as declared in `images`. */
  images: ReadonlyMap<string, HTMLImageElement | null>;
  /** Layout units — the canvas is this multiplied by `scale`. */
  w: number;
  h: number;
  pad: number;
}

export interface Renderer {
  /**
   * Layout size, and how many device pixels each layout unit is worth.
   *
   * Per design rather than global, so one design can be a wide card and another
   * a tall one without either pretending to be the other.
   */
  size: { w: number; h: number; scale: number; pad: number };
  /**
   * Every font this design draws with.
   *
   * Canvas does NOT trigger font loading the way laying text out does — an
   * unloaded face falls back silently and the card ships in Times, on some
   * machines only. Declaring them here rather than hard-coding one list in the
   * loader is what stops a new design's larger type from failing that way.
   */
  fonts: (f: Faces) => string[];
  /** Image URLs to fetch before drawing. The #1 poster must come first: the
   *  accent colour is taken from it, and every rule is drawn in that colour. */
  images: (d: CardData) => (string | undefined)[];
  draw: (ctx: CanvasRenderingContext2D, d: CardData, kit: Kit) => void;
}
