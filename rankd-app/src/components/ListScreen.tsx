"use client";

// The result of every duel ever played. The duel is the mechanic; this is what
// it was for.
//
// Two rules the design follows throughout: a number here means a film was
// actually placed by a confirm (see buildList), and everything a row doesn't
// need goes to the detail card instead. A row is a poster, a title and a
// position — nothing else.

import { EASE, inShelf, pageAfterSwipe, TURN_MS, type Dir } from "@/lib/ribbon";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav, Header } from "./DuelScreen";
import { buildBeliefOrder, buildList, searchList, type RankedFilm } from "@/lib/list";
import { beliefsFor } from "@/lib/beliefs";
import { applyMove, judgementsForMove, ratingAfterMove } from "@/lib/reorder";
import { appendJudgements, loadLog, retractJudgements } from "@/lib/log";
import type { Judgement } from "@/lib/log";
import { isHard, isPlaced } from "@/lib/lock";
import { tierProgress } from "@/lib/progress";
import { useVisiblePosters } from "@/lib/useVisiblePosters";
import { useDriftScroll } from "@/lib/useDriftScroll";
import { starsFor, ORDERED_TIERS, tierCounts, type Rating } from "@/lib/tiers";
import type { FilmMeta } from "@/lib/meta";
import type { Film } from "@/lib/types";
import { FIELD, Sheet } from "./ui";
import { ChevronIcon } from "./Icons";
import { TierCut } from "./TierCut";
import { lex } from "@/lib/lexicon";

// Fixed row metrics. Building all 828 rows at once measured a 748ms blocked
// main thread — content-visibility skips their layout and paint but React still
// has to create every one. So sections mount only when they're near the
// viewport, and stand in as a plain spacer of exactly the right height until
// then. Ten sections to manage instead of eight hundred rows, and because the
// heights are known the scroll bar, the tier jumps and the idle drift all behave
// as if the whole list were live. These numbers must match the CSS.
// Was 96. Grown so the poster's tilt and its shadow have somewhere to land:
// .list-row carries paint containment, so anything drawn outside the row box is
// cut square, and the poster's rotated top-left corner was being shaved off.
// The extra twelve pixels also give the list the breathing room it wanted.
// Change this and change contain-intrinsic-size in globals.css in the same move.
const ROW_H = 108;
const HEADER_H = 56;
const DIVIDER_H = 30;
const NEAR = 900; // how far beyond the viewport a section mounts

/**
 * How many rows mount together on the flat page.
 *
 * The tiered page windows by SECTION, which works because a tier is a natural
 * block of a few dozen rows. The flat page has no sections, and mounting 828
 * rows at once measured a 748ms blocked main thread — the exact reason the
 * windowing exists at all. So it windows by fixed-size chunk instead, and 25
 * rows is comfortably more than a screenful at `ROW_H`.
 */
const CHUNK = 25;

/**
 * The shuffled page: one continuous list in belief order.
 *
 * Separate from the tiered render rather than folded into it. The two draw the
 * same `Row` but nothing else about them agrees — no tier headers, no UN-RNKD
 * divider, different windowing — and a single branchy renderer serving both
 * would be harder to read than two that each do one thing.
 *
 * `showStars` is not decoration here, it is the POINT: the page exists to show
 * a 3★ sitting above a 4★, and without the stars on the row that is invisible.
 */
/**
 * Long-press before a hold-gesture fires, in ms.
 *
 * At module scope because the row drag and the rank numeral both use it, and a
 * hold that means one thing on a row and another on the number inside it must
 * at least take the same length of time.
 */
// Long enough that resting a thumb on a row you are reading is not a gesture.
// It was 380ms, which is both a comfortable deliberate press AND about how long
// people pause before flicking a long list — so the two were indistinguishable.
const HOLD_MS = 500;

function FlatRows({
  rows,
  view,
  onInfo,
  carried,
  carriedBy,
  onUnpin,
  onLockMenu,
}: {
  rows: RankedFilm[];
  view: { top: number; height: number };
  onInfo: (f: Film) => void;
  /** The row under the finger. */
  carried?: string | null;
  /** How far it has travelled with the finger. */
  carriedBy?: number;
  /** Release a pin. Absent on a read-only list. */
  onUnpin?: (f: Film) => void;
  /** Open the sheet that sets how this film is placed. */
  onLockMenu?: (f: Film, rank: number) => void;
}) {
  const chunks: RankedFilm[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));

  return (
    <>
      {chunks.map((chunk, i) => {
        const top = i * CHUNK * ROW_H;
        const height = chunk.length * ROW_H;
        const near = top < view.top + view.height + NEAR && top + height > view.top - NEAR;
        // A spacer of exactly the right height, so the scrollbar, the drift and
        // every offset behave as if the whole list were mounted.
        if (!near) return <div key={i} style={{ height }} />;
        return (
          <div key={i} style={{ height }}>
            {chunk.map((r) => (
              <Row
                key={r.film.id}
                film={r.film}
                rank={r.rank}
                onInfo={onInfo}
                showStars
                carried={carried === r.film.id}
                carriedBy={carriedBy}
                onUnpin={onUnpin}
                onLockMenu={onLockMenu}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

const sectionHeight = (s: { placed: unknown[]; unplaced: unknown[] }) =>
  HEADER_H +
  s.placed.length * ROW_H +
  (s.unplaced.length ? DIVIDER_H + s.unplaced.length * ROW_H : 0);

// ── Grid geometry ───────────────────────────────────────────────────────────
//
// The tiered view's virtualisation is arithmetic and never measured: every
// section's top is derived from ROW_H, HEADER_H and DIVIDER_H, and `jumpTo`
// trusts those numbers. A grid cannot use fixed constants the same way, because
// how many films fit on a line depends on how wide the screen is.
//
// So the width is measured once per scroll (it comes free with the height the
// windowing already reads) and BOTH the layout and the height maths are derived
// from that one number. They cannot drift apart, because there is only one.
const GRID_GAP = 8;
/** Narrower than this and a poster stops being recognisable at a glance. */
const GRID_MIN_CELL = 96;
/** The rank numeral under each poster. */
const GRID_LABEL_H = 20;

/**
 * How many posters fit on a line, and how tall a line is.
 *
 * ── The height is IMPOSED, not derived ─────────────────────────────────────
 *
 * The first version computed a cell height from the poster's 2:3 ratio and let
 * CSS lay the cells out. The two disagreed — CSS puts a gap BETWEEN rows and not
 * after the last one, and the label's real height was not what the arithmetic
 * assumed — so a tier declared 1670px of space and drew 886px of posters, and
 * everything below it sat in the wrong place.
 *
 * So the cell height is handed to the grid as `gridAutoRows` and the section
 * height is computed from the same number. There is one figure and both the
 * layout and the maths read it, which is the only way they can be guaranteed to
 * agree.
 */
function gridMetrics(width: number): { cols: number; cellH: number } {
  // `clientWidth` includes the scroller's px-3, which the cells sit inside.
  const inner = Math.max(GRID_MIN_CELL, width - 24);
  const cols = Math.max(2, Math.floor((inner + GRID_GAP) / (GRID_MIN_CELL + GRID_GAP)));
  const cellW = (inner - (cols - 1) * GRID_GAP) / cols;
  // Posters are 2:3, and the numeral sits under them.
  return { cols, cellH: Math.round(cellW * 1.5) + GRID_LABEL_H };
}

/** A block of `n` films: rows of `cellH`, with a gap between them but not after. */
const gridBlockHeight = (n: number, cols: number, cellH: number) => {
  if (n === 0) return 0;
  const rows = Math.ceil(n / cols);
  return rows * cellH + (rows - 1) * GRID_GAP;
};

const gridSectionHeight = (
  s: { placed: unknown[]; unplaced: unknown[] },
  cols: number,
  cellH: number,
) =>
  HEADER_H +
  gridBlockHeight(s.placed.length, cols, cellH) +
  (s.unplaced.length ? DIVIDER_H + gridBlockHeight(s.unplaced.length, cols, cellH) : 0);

/**
 * A stretch of the list drawn as posters.
 *
 * ── What a grid is for, and what it gives up ───────────────────────────────
 *
 * Same order, same numbers, same tier rules — several times as many films on
 * screen. Rows are the better shape for reading one film (title, year, maker);
 * a grid is the better shape for seeing the SHAPE of a stretch of ranking, which
 * is the question you are asking when you scroll a long way.
 *
 * It gives up the drag. Reordering is row-and-line shaped: `rowAt` hit-tests one
 * film per horizontal band and the landing line is a horizontal rule. Neither
 * means anything across two dimensions, and a half-right version would put back
 * exactly the accidental-move bug the scroll guard exists to prevent. The grid is
 * a reading mode; switch to rows to rearrange.
 *
 * `list-poster` is kept so the idle poster-shake still finds these, and
 * `data-film-id` is deliberately NOT set — that is what `rowAt` looks for, and a
 * grid must be invisible to it.
 */
function GridRows({
  films,
  ranks,
  cols,
  cellH,
  onInfo,
}: {
  films: Film[];
  /** Parallel to `films`. Absent for the un-rnkd block, which has no numbers. */
  ranks?: number[];
  cols: number;
  cellH: number;
  onInfo: (film: Film) => void;
}) {
  if (films.length === 0) return null;
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        // Fixed rather than content-sized, so the height this block occupies is
        // exactly what `gridBlockHeight` said it would be. See `gridMetrics`.
        gridAutoRows: `${cellH}px`,
        gap: GRID_GAP,
      }}
    >
      {films.map((film, i) => (
        <button
          key={film.id}
          onClick={() => onInfo(film)}
          className="flex min-h-0 flex-col items-center active:scale-[0.97]"
        >
          <div className="list-poster w-full min-h-0 flex-1 overflow-hidden rounded-md bg-surface">
            {film.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={film.poster} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : null}
          </div>
          {/* The same gold-for-committed, accent-for-provisional the rows use, so
              a glance across the grid still says which placements are yours. */}
          <span
            className={`flex items-center text-label font-bold leading-none tabular-nums ${
              ranks ? (isHard(film) ? "text-gold" : "text-accent") : "text-dim/70"
            }`}
            style={{ height: GRID_LABEL_H }}
          >
            {ranks ? ranks[i] : "UN-RNKD"}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function ListScreen({
  films,
  onInfo,
  onSettings,
  onDuel,
  onProfile,
  onRibbon,
  enterAtEnd = false,
  onPoster,
  onTrophies,
  onFilms,
  logging,
  onToggleLog,
  frozen,
  hideStars,
  grid = false,
  onGrid,
}: {
  films: Film[];
  /**
   * Hold the list absolutely still.
   *
   * Set while the coach marks are up. The drift is 20px/s after 2.5s of quiet,
   * and a tutorial holds the reader far longer than that — so the list crept
   * downward under the overlay and the spotlight, which re-measures its target,
   * faithfully followed the row it was pointing at off the screen. The mark was
   * doing its job; the page underneath was not supposed to be moving.
   *
   * The drift's own input listeners are on the scroller, which sits BEHIND the
   * overlay, so nothing the reader does can bump it back to idle either.
   */
  frozen?: boolean;
  /**
   * Draw no star ratings on the rows or the tier rules.
   *
   * The reader's preference (lib/prefs.ts). A star is an anchor: with them
   * showing, the eye checks each film against the rating it already has rather
   * than against the film above it. Off, the list is one run of films.
   *
   * The shuffled page IGNORES this and always draws them, because that page
   * exists to show a 3-star sitting above a 4-star and without the stars on the
   * row that is invisible — hiding them there would leave a list that has
   * silently stopped saying anything.
   */
  hideStars?: boolean;
  /** Read the list as posters rather than rows. See `Prefs.grid`. */
  grid?: boolean;
  onGrid?: (on: boolean) => void;
  onInfo: (f: Film) => void;
  onSettings: () => void;
  onDuel: () => void;
  onProfile: () => void;
  /**
   * A swipe that ran past the first or last state.
   *
   * The list is the left-hand end of the ribbon, so only `1` ever leads
   * anywhere — off the end of un-rnkd and into the game. See `lib/ribbon.ts`.
   */
  onRibbon: (dir: Dir, travelled?: number) => void;
  /** Somebody has spoken to you on Activity since you last looked. */
  /** Swiped into from the game, so land on the state nearest it. */
  enterAtEnd?: boolean;
  onPoster: (id: string, meta: FilmMeta) => void;
  onTrophies: () => void;
  /**
   * Land a reorder: the library, with the dragged film re-rated and re-scored.
   *
   * Absent means the list is read-only, which is what turns the drag gesture
   * off — there is nowhere for the result to go, so nothing should lift.
   */
  onFilms?: (films: Film[]) => void;
  /** The log sheet lives in `AppShell` now; the nav only lights its cell. */
  logging?: boolean;
  onToggleLog?: () => void;
}) {
  const [q, setQ] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);
  // ── Deciding where the tiers fall, by hand ───────────────────────────────
  //
  // A separate screen rather than a fourth page of this one. See the note at
  // the top of TierCut.tsx: it wants a different list, different rows and no
  // drag, and threading that through here would have meant teaching every
  // interaction on this screen to stand down.
  const [cutting, setCutting] = useState(false);
  // ── The model's own opinion, for the shuffled page ───────────────────────
  //
  // Loaded rather than passed: the log is 500KB of tuple rows and every other
  // screen that needs beliefs fetches its own (`PersonSheet`, `ProfileScreen`,
  // `ShuffleDuel`). Threading it through `AppShell` would put it in the props
  // of a screen that only wants it on one of its four pages.
  //
  // `null` until it lands, which is why the render falls back to tier sections:
  // a first frame ordered by score and a second ordered by belief is a list
  // that visibly re-sorts itself, and the two agree often enough that most
  // readers would only see the jump.
  const [log, setLog] = useState<Judgement[] | null>(null);
  /**
   * The row being dragged, if any.
   *
   * `from` is its index in `displayOrder` and `to` is where it would land —
   * recomputed on every move, drawn as an insertion line, and only acted on when
   * the finger lifts.
   */
  const [drag, setDrag] = useState<{
    id: string;
    from: number;
    to: number;
    /** Where the finger went down, so the carried row can follow it. */
    startY: number;
    /** Where the finger is now, in client coordinates. */
    y: number;
    /**
     * Where the landing line is drawn, in client coordinates.
     *
     * The EDGE of the row it would drop above, not the finger's own position.
     * Drawn at the finger it was invisible — a 2px line directly under a
     * fingertip is covered by the fingertip, which is what "I do not see an
     * indicator as to where it is moving to" was. The gap it will land in is
     * also the more useful thing to show: it is the answer, where the finger is
     * merely the question.
     */
    lineY: number;
  } | null>(null);
  useEffect(() => {
    void loadLog().then(setLog);
  }, []);
  const scroller = useRef<HTMLDivElement | null>(null);
  // Pressing the list cell while already ON the list has never done anything.
  // It now opens the keyboard on the search field, which is the user's ask and
  // is the one thing a second press of a tab you are already on can usefully
  // mean: you are here, and you are looking for something.
  const searchRef = useRef<HTMLInputElement | null>(null);

  // ── The review card lived here ─────────────────────────────────────────────
  //
  // It read the evidence log, fitted beliefs, and offered the one film whose
  // position the model most disagreed with — answered by starting a Spotlight
  // over it. It went when Spotlight did: its only action was that mode, and a
  // prompt whose button leads nowhere is worse than no prompt.
  //
  // The log still records every duel, and `lib/beliefs.ts` still fits from it —
  // nothing about the evidence changed. What is gone is the app volunteering an
  // opinion about it. If this comes back it needs a mechanic to hand the answer
  // to first, and that decision is the feature, not this card.

  // ── Filtering by state ──────────────────────────────────────────────────
  //
  // The three counts in the band are already the three states, already in their
  // own colours, and already the thing you read to decide what to do next. So
  // they ARE the filter — tap LOCKED to see only those, tap again to clear.
  // No tab strip, no new row, nothing added to the screen at all.
  //
  // The alternative in the register (P14) bundled year and genre in with these.
  // Those are GROUPINGS, not filters: every row stays and the sections change,
  // which rebuilds the geometry `ROW_H` drives. This half is free because it
  // only changes which films exist.
  //
  // Filtered on the way IN, not on the way out. `buildList` computes the
  // sections, the spacers and the tier-jump offsets together, so handing it a
  // smaller library keeps all three consistent — filtering its OUTPUT would
  // leave the offsets describing rows that are no longer there.
  // Arriving from the right means walking back INTO the list from the game, so
  // the page you land on is the one nearest the game — the last state, not the
  // first. Coming from anywhere else starts at everything-you-own.
  //
  // Computed lazily rather than in an effect: the band drops empty states, so
  // "last" is the last one with a film in it, and the answer is known before
  // the first paint.
  const [only, setOnly] = useState<null | "locked" | "shuffled" | "unrnkd">(() => {
    if (!enterAtEnd) return null;
    if (films.some((f) => !isPlaced(f))) return "unrnkd";
    if (films.some((f) => isPlaced(f) && !isHard(f))) return "shuffled";
    if (films.some(isHard)) return "locked";
    return null;
  });
  // ── The same three states, as pages you can swipe between ────────────────
  //
  // Tapping a count is still the way in, and still the obvious one. This is the
  // way ACROSS: the user asked to be able to swipe the whole app end to end, and
  // the list has to turn its own pages before a swipe there can be about leaving
  // the list at all.
  //
  // Derived from `only` rather than held as a second piece of state. Two sources
  // of truth for the same fact drift the moment a tap sets one and a swipe sets
  // the other, and then the band would be highlighting a state the list is not
  // showing.
  const touch = useRef<{ x: number; y: number; axis: null | "x" | "y" } | null>(null);
  // ── The turn ─────────────────────────────────────────────────────────────
  //
  // The profile turns its panels on a track: three panes side by side,
  // translated under the finger. The list cannot. Four filtered copies of an
  // 828-row list is the 748ms blocked render the metrics at the top of this file
  // exist to avoid.
  //
  // So: one pane, moved. It follows the finger, leaves in the direction of
  // travel, and the next one arrives from the far side. Same easing and same
  // 300ms total as the profile, so the two read as one gesture.
  //
  // Transform only — no opacity. Compositing eight hundred rows costs; moving
  // one layer does not.
  const track = useRef<HTMLDivElement>(null);
  const turning = useRef(false);

  const slide = (to: string, ms: number) => {
    const el = track.current;
    if (!el) return;
    el.style.transition = ms ? `transform ${ms}ms ${EASE}` : "none";
    el.style.transform = `translateX(${to})`;
  };

  const turnTo = (next: (typeof segments)[number]["key"], dir: 1 | -1, travelled = 0) => {
    if (turning.current) return;
    turning.current = true;
    // The finger has already covered `travelled` of the way. Timing the rest in
    // proportion is what stops the pane overtaking the hand it just left — a
    // fixed 150ms from 80% across is a lurch, and that is the "catch up".
    const out = Math.max(60, Math.round(TURN_MS * (1 - Math.min(1, travelled))));
    slide(`${dir * -100}%`, out);
    window.setTimeout(() => {
      // Off-screen now, so the jump to the far side and the content swap are
      // both invisible and their order does not matter.
      slide(`${dir * 100}%`, 0);
      setOnly(next);
      // A page arriving already scrolled halfway down would look broken. The
      // reset is free here because nothing is visible.
      if (scroller.current) scroller.current.scrollTop = 0;
      requestAnimationFrame(() => {
        slide("0px", TURN_MS);
        turning.current = false;
      });
    }, out);
  };
  const shown = useMemo(() => {
    if (!only) return films;
    return films.filter((f) =>
      only === "locked" ? isHard(f) : only === "shuffled" ? isPlaced(f) && !isHard(f) : !isPlaced(f),
    );
  }, [films, only]);

  // Built once per library change, never inside a scroll handler — the
  // prototype re-sorted all 828 films on every scroll tick and it showed.
  const model = useMemo(() => buildList(shown), [shown]);

  // ── What the evidence says, tiers ignored ────────────────────────────────
  //
  // The shuffled page only. The locked page is a record of judgements the user
  // made and must stay in strict tier order; this page is the model's answer,
  // and a tier band is a wall its answer may never climb — so grouping by tier
  // here would hide the one thing the page exists to show.
  //
  // `null` on every other page and until the log lands, and the render reads
  // that as "draw sections", so this costs nothing anywhere else.
  const flat = useMemo(() => {
    if (only !== "shuffled" || !log) return null;
    // Beliefs are fitted over the WHOLE library, not over `shown`. A belief is
    // formed from duels against films in other tiers, so fitting over the
    // filtered set would answer a different question — and the numbers on these
    // rows come from the master order, which is the whole library too.
    return buildBeliefOrder(shown, beliefsFor(films, log));
  }, [only, log, films, shown]);
  // The band's counts come from the WHOLE library, never the filtered view.
  // They are a key to the list, and a key that changed every time you used it
  // would be describing itself rather than the library.
  const all = useMemo(() => buildList(films), [films]);
  // ── One list, read twice ─────────────────────────────────────────────────
  //
  // The band drops any segment reading zero, on the reasoning in its own
  // comment: a zero is not information, it is a state you are not in. So the
  // pages a swipe can turn to are whatever the band is actually SHOWING, never
  // a fixed four.
  //
  // Getting this wrong is not a small bug. A library with nothing locked would
  // have had a page you could swipe onto, holding no films, with no segment lit
  // to say where you were — which is precisely the "empty page you had to visit
  // to find out was empty" that cost the profile its third tab.
  const segments = [
    // The total sits WITH the three states rather than above them. It used to
    // be its own line — "865 films" beside the name — and the three below
    // already sum to it, so the two lines were the same fact twice. As a fourth
    // column it is the thing the other three are parts of.
    //
    // `--text-hi` because it is not a fourth STATE. Gold, accent and dim are the
    // three states and a fourth hue beside them would read as one; the
    // near-white is the app's colour for "the thing itself" and says total
    // without joining the set.
    { n: all.total, label: lex().many, tone: "text-text-hi", key: null },
    { n: all.settledCount, label: "locked", tone: "text-gold", key: "locked" as const },
    {
      n: all.placedCount - all.settledCount,
      label: "shuffled",
      tone: "text-accent",
      key: "shuffled" as const,
    },
    { n: all.total - all.placedCount, label: "un-rnkd", tone: "text-dim", key: "unrnkd" as const },
  ].filter((seg) => seg.n > 0);
  const page = segments.findIndex((seg) => seg.key === only);
  const results = useMemo(() => searchList(model, q), [model, q]);
  const searching = q.trim().length > 0;

  useVisiblePosters(scroller, films, onPoster);
  useDriftScroll(scroller, !searching && !jumpOpen && !frozen);
  usePosterShake(scroller, !searching && !frozen);

  const counts = tierCounts(films);
  // How much of each tier has a position, for the Jump menu.
  //
  // This is where "where are the unranked films" gets answered — in the control
  // you already open to go somewhere, rather than as a chart above the list. A
  // bar drawn permanently at the top has to justify its space every time you
  // look at the screen; a number inside a menu is only there when you asked the
  // question it answers.
  const ranked = new Map(tierProgress(films).map((s) => [s.rating, s.ranked]));

  // Declared up here rather than beside the other drag state, because the scroll
  // listener immediately below is what cancels it.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const [view, setView] = useState({ top: 0, height: 900, width: 380 });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = () => {
      // ── Never accept a zero width ────────────────────────────────────────
      //
      // The grid's section heights are computed from this, and a zero collapses
      // every cell to nothing: a tier of 24 films declared 374px of space and
      // then drew 1294px of posters over the top of the next tier. The screen
      // can be measured before it has been laid out — this list lives in a
      // translated pane and is mounted while off to one side — so a 0 here is
      // "not yet", not "no space".
      setView((v) => ({
        top: el.scrollTop,
        height: el.clientHeight || v.height,
        width: el.clientWidth || v.width,
      }));
      // ── If the list moved, you were scrolling ────────────────────────────
      //
      // The touchmove guard cancels a pending hold once the finger has travelled
      // 8px, and on its own it is not enough: it only fires if a touchmove
      // ARRIVES before the timer does. Put a finger down, read the row for a
      // third of a second, then scroll, and the drag arms first — the list
      // locks, the row follows your thumb, and letting go drops it wherever you
      // stopped. Reported as "it selects a film as I'm scrolling and then
      // replaces it, I have no idea where".
      //
      // Not a cosmetic slip. `dropAt` appends evidence, CHANGES THE FILM'S STAR
      // RATING through `ratingAfterMove`, and re-spreads the bands — and until
      // now this screen had no undo to take any of it back.
      //
      // Scroll position is the honest test, and it is the one signal that holds
      // whoever is driving: a fling belongs to the compositor and it dispatches
      // touchmove on its own terms, but if `scrollTop` has moved then the
      // gesture was a scroll and no drag may arm out of it.
      cancelHold();
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    // Scroll alone is not enough to keep the WIDTH current, and the grid's
    // geometry is derived from it: rotate the phone, or arrive on this screen
    // before it has been laid out, and every section would keep declaring a
    // height computed for a width that is no longer true.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", read);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Where each section starts, and how tall it is. Derived from the model, never
  // measured from the DOM — the whole point is that it's known before the rows
  // exist.
  const { cols, cellH } = gridMetrics(view.width);
  const offsets = useMemo(() => {
    const out: { tier: Rating; top: number; height: number }[] = [];
    let top = 0;
    for (const s of model.sections) {
      const height = grid ? gridSectionHeight(s, cols, cellH) : sectionHeight(s);
      out.push({ tier: s.tier, top, height });
      top += height;
    }
    return out;
  }, [model, grid, cols, cellH]);


  /**
   * Which row is under this point, as an index into `displayOrder`.
   *
   * Hit-tested against the real elements rather than computed from a Y offset.
   * The arithmetic version would have to know about tier headers, UN-RNKD
   * dividers and section spacers — three things that differ per page and one of
   * which does not exist on the shuffled page — and would be wrong in a
   * different way on each. The rows know where they are.
   */
  const rowAt = (clientY: number, ignore?: string): { at: number; top: number } | null => {
    const rows = scroller.current?.querySelectorAll<HTMLElement>("[data-film-id]");
    if (!rows) return null;
    for (const row of rows) {
      // ── The carried row is never a destination ────────────────────────
      //
      // It follows the finger now, so its box is under the finger on every
      // single frame — which made it the answer every time, so the target always
      // equalled the origin and the drop did nothing. Reported exactly that way:
      // "wherever I place the item it just moves back to its spot".
      //
      // The bug arrived WITH the fix that made the row follow the thumb. Before
      // that the row stayed put and stopped being under the finger the moment it
      // moved, which hid this completely.
      if (row.dataset.filmId === ignore) continue;
      const r = row.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        const at = displayOrder.findIndex((f) => f.id === row.dataset.filmId);
        return at === -1 ? null : { at, top: r.top };
      }
    }
    return null;
  };

  /** The film whose placement is being changed, and where it currently sits. */
  const [lockFor, setLockFor] = useState<{ film: Film; rank: number } | null>(null);

  /**
   * The last drop, kept so it can be named on screen and taken back.
   *
   * Holds the whole pre-move library rather than a way to reverse the move — see
   * `dropAt` for why an inverse is not exact.
   */
  const [lastMove, setLastMove] = useState<{
    id: string;
    title: string;
    to: number;
    films: Film[];
    judgements: string[];
    log: Judgement[];
    /**
     * A counter, so two moves in a row each get their own announcement rather
     * than the second being swallowed as "no change". Not a clock: `dropAt` is
     * an ordinary function in the render body, and reading the time there is
     * impure whether or not it is only ever reached from a gesture.
     */
    at: number;
  } | null>(null);

  // Long enough to read and reach, short enough not to sit over the list. The
  // move is already committed either way — this is a chance to take it back, not
  // a confirmation the drop is waiting on.
  useEffect(() => {
    if (!lastMove) return;
    const t = setTimeout(() => setLastMove(null), 6000);
    return () => clearTimeout(t);
  }, [lastMove]);

  /**
   * Land the drag: write the evidence, move the rating if it crossed a
   * boundary, and let everything downstream re-derive itself.
   *
   * Nothing here locks. A drag is the reader saying "this belongs about here for
   * now", which is the same kind of claim a duel makes and none of the finality
   * a lock carries — see the header of lib/reorder.ts.
   */
  const dropAt = (from: number, to: number) => {
    const moved = displayOrder[from];
    if (!moved || from === to || !log) return;

    const rows = judgementsForMove(displayOrder, from, to);
    if (rows.length === 0) return;

    const nextLog = [...log, ...rows];
    void appendJudgements(rows);
    setLog(nextLog);

    // ── The order is WRITTEN, and the evidence is recorded alongside it ────
    //
    // Both halves of what was asked for: "It should reorder it accordingly…
    // But it should update its number in the order of things. As the data goes,
    // it should count as one win…"
    //
    // The first build only recorded the evidence and let the model place the
    // film, which it cannot do faithfully — it has no way to know what the
    // gesture meant, so a book dropped at 5 landed at 7. Nothing here locks:
    // `lock` is untouched, so the model may still revise this the moment real
    // duels disagree, which is what "for the moment" asks for.
    onFilms?.(applyMove(films, displayOrder, from, to, ratingAfterMove(displayOrder, from, to)));

    // ── Say what just happened, and offer it back ─────────────────────────
    //
    // A drop rewrites three things — the order, the evidence, and the film's
    // STAR RATING — and until now it announced none of them. The rating is the
    // one that stings: you drag a film two rows and it silently becomes a 4★.
    //
    // The whole pre-move library is kept rather than an inverse operation.
    // `applyMove` re-spreads every affected band, so undoing it by moving the
    // film back would leave every neighbour's score subtly different from where
    // it started. Keeping the array is exact, and it is what the duel screen's
    // undo already does for the same reason.
    setLastMove({
      id: moved.id,
      title: moved.title,
      to: to + 1,
      films,
      judgements: rows.map((r) => r.id),
      log,
      at: (lastMove?.at ?? 0) + 1,
    });
  };

  /**
   * Put the library back exactly as it was before the last drop.
   *
   * Retracts first, so the evidence and the placement move together: a row left
   * behind would keep arguing for a position the reader has just taken back, and
   * `retractJudgements` tombstones it so the retraction survives a device merge
   * rather than being undone by the next sync.
   */
  const undoMove = () => {
    const m = lastMove;
    if (!m) return;
    void retractJudgements(m.judgements);
    setLog(m.log);
    onFilms?.(m.films);
    setLastMove(null);
  };

  /**
   * The list exactly as it is drawn, best first.
   *
   * A drag is expressed as two positions in THIS array, which is what makes it
   * work identically on every page: the tiered pages have headers and dividers
   * between their rows and the shuffled page has neither, and none of that
   * matters to an order of films.
   */
  // Not wrapped in `useMemo`: the React Compiler refused to preserve it and
  // said so, and it is a flatMap over two values that are already memoised —
  // sub-millisecond over a real library, and the compiler memoises it anyway.
  const displayOrder: Film[] = flat
    ? flat.map((r) => r.film)
    : model.sections.flatMap((s) => [...s.placed.map((r) => r.film), ...s.unplaced]);

  // Named by ID rather than by index, so the same two values drive the tiered
  // pages and the flat one. An index would have to be counted through tier
  // headers and UN-RNKD dividers on one page and not on the other.
  const carriedId = drag?.id ?? null;
  // How far the carried row has travelled. It lifted but never moved before,
  // which is most of what "it also looks a little off" was about: the row
  // stayed put while the finger left it behind.
  const carriedBy = drag ? drag.y - drag.startY : 0;

  /**
   * Hold the list still and follow the thumb.
   *
   * ── Why this is not a React handler ───────────────────────────────────────
   *
   * It was one, and the list scrolled anyway. Two reasons, and only the second
   * is fixable from inside React:
   *
   *  · `touch-action: none` applied when the drag starts is too late. The
   *    browser reads that property at TOUCHSTART and does not re-read it.
   *  · A `touchmove` listener has to be NON-PASSIVE for `preventDefault` to
   *    mean anything, and React gives no way to say so.
   *
   * Registering it here works because of the hold: the finger has been still for
   * `HOLD_MS`, so no scroll has started yet, and a non-passive listener attached
   * before the first movement can still cancel it. This is what every drag
   * library does and it is the only thing that reliably works.
   */
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: TouchEvent) => {
      // The whole point. Without it the list scrolls under the row being
      // carried and the drag is unusable.
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      setDrag((d) => {
        if (!d) return d;
        const hit = rowAt(t.clientY, d.id);
        return hit
          ? { ...d, y: t.clientY, to: hit.at, lineY: hit.top }
          : { ...d, y: t.clientY };
      });
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    return () => document.removeEventListener("touchmove", onMove);
    // `rowAt` reads `displayOrder`, which changes only when the library does —
    // never mid-drag, since nothing is written until the finger lifts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  /**
   * Take back a pin, leaving the position alone.
   *
   * Dropping to `"soft"` rather than to unplaced is the whole point. The film
   * keeps its number and its place; what changes is WHO owns that place — it
   * stops being your commitment and becomes the model's working answer, free to
   * improve as the evidence does. Clearing the lock outright would delete a
   * position you spent duels earning, which is the opposite of what unpinning
   * is for.
   */
  /**
   * Set how a film is placed, leaving its position alone.
   *
   * All three states keep `score`, which is the point: what changes is who owns
   * the position, not what the position is. Clearing the lock puts the film back
   * in the shuffle pool without throwing away the duels that got it there — it
   * simply stops counting as placed, and the next run may move it.
   */
  const setLock = (film: Film, lock: "hard" | "soft" | undefined) => {
    onFilms?.(
      films.map((f) => {
        if (f.id !== film.id) return f;
        if (lock !== undefined) return { ...f, lock };
        // Deleted rather than set to `undefined`. JSON drops an undefined value
        // on the way to storage, but the in-memory object is read by everything
        // downstream first, and `"lock" in film` is not the only shape a reader
        // can take.
        const rest = { ...f };
        delete rest.lock;
        return rest;
      }),
    );
  };

  const unpin = (film: Film) => {
    onFilms?.(films.map((f) => (f.id === film.id ? { ...f, lock: "soft" as const } : f)));
  };

  const jumpTo = (tier: Rating) => {
    setJumpOpen(false);
    const target = offsets.find((o) => o.tier === tier);
    if (target && scroller.current) scroller.current.scrollTo({ top: target.top, behavior: "smooth" });
  };

  return (
    <main className="relative flex h-app flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />

      {/* ── The band ──────────────────────────────────────────────────────
          Three tones, top to bottom: black chrome, this, then the list. It was
          `--header-bg` once (a second, silent header) and then briefly the
          page's own colour (page that happened to be at the top). `--band` sits
          deliberately between, so the block reads as a thing with a job rather
          than as either of its neighbours.

          It slides with brightness where the header does not. The header is
          chrome; this is surface you read.

          ── The name is gone ──
          It was the largest thing here and did the least: a heading telling you
          whose list you are looking at, on the only list there is. Its one real
          function was reaching the profile, and the nav's You cell does that
          from every screen. Removing it hands the top of the band to the counts,
          which is what people come here to read. */}
      <div className="chrome-hold flex-shrink-0 px-5 pb-3 pt-3" style={{ background: "var(--band)" }}>

        {/* ── The key to the numbers below ──────────────────────────────
            "shuffled", not "Rankd placed". The user's call, and it is checkable
            rather than a matter of taste: `placeSettled` is called from exactly
            one component in the app — `ShuffleDuel` — so a soft lock can only
            ever have come from Fast Shuffle. Naming the mode says where the
            number came from AND where to go to change it, which "Rankd placed"
            did not.

            ── Three states, three colours ──
            It said three things in two colours: hard was gold and BOTH soft and
            un-rnkd were `--dim`. So the distinction this key exists to explain
            was carried by a colour two of its three states shared, which is a
            strange way to build a key.

            Gold for locked, `--accent` for shuffled, `--dim` for un-rnkd. The
            accent is not a new colour — it is the token the profile already
            uses for its RANKD marker, which is the same idea (this came from
            the model, not from you) wearing the same paint.

            Centred, because it is a caption for the whole list rather than a
            label on the name above it, and it sits over the search bar it
            shares a width with.

            Number ABOVE its label, in three columns rather than one running
            line. Inline, the eye had to parse "21 LOCKED · 77 SHUFFLED · 767
            UN-RNKD" as a sentence before it could compare the figures, and the
            middle dots were doing work that whitespace does better. Stacked,
            the three numbers sit on one baseline and can be read against each
            other at a glance — which is the only reason to put them together.

            Deliberately the profile stats band's treatment (`Stat` in
            `ProfileScreen`): serif numeral over 9px small caps. Same idea, same
            shape, and the profile is the screen whose type the rest of the app
            is being brought toward.

            The row numerals below use the same three, or this is a key to
            nothing.

            If another mode is ever given the right to place films, this label
            stops being true and has to go back to something generic. That is a
            real constraint, so it is written down rather than left to be
            discovered.
            Gold-and-bold against dim has drawn the hard/soft distinction in the
            rows since locks landed, and nothing on any screen said what the two
            weights MEANT. The explanation was a `title` attribute — a hover
            tooltip, on a phone. So the one idea a reader could not work out for
            themselves was the one idea the app never spoke.

            This is a legend rather than a per-row label because a label on 861
            rows repeats itself 861 times, and because a row may not grow:
            ROW_H is load-bearing for the spacers and the tier jumps.

            It carries the row's two treatments — gold and bold against plain
            and dim — so it reads as a key and not as two more statistics.
            Change one and change both, or it stops being a key.

            The SIZE deliberately does not match: the rows set their numerals at
            26px and a key does not need to shout. What it does need is internal
            contrast, which is the whole reason the first attempt looked wrong
            on a phone. It was a flat 10px line sitting directly under another
            flat 11px line, so two dim greys of near-identical size stacked into
            mush and the longer one read as a runt paragraph.

            It is deliberately the same treatment as `Stat` in `ProfileBits` —
            a serif numeral over a small-caps label — but not the component
            itself: a segment also carries a tone colour and an underline that
            say which filter is on, and neither belongs on a profile stat.

            The numbers here are serif at 18px and the labels 10px small caps.
            This note used to claim "the display face at 13px" over "9px small
            caps", which had not been true of the code for some time. A comment
            describing type it does not control is a comment that will lie.

            Hidden unless both states are actually present. A library with no
            soft locks would otherwise be taught a distinction it cannot see. */}
        {all.total > 0 && (
          <p className="mb-3 flex items-start justify-center gap-5 text-dim">
            {segments.map((seg) => {
                const active = only === seg.key;
                return (
                  <button
                    key={seg.label}
                    onClick={() => setOnly(active ? null : seg.key)}
                    aria-pressed={active}
                    className={`block text-center active:scale-95 ${seg.tone} ${
                      only && !active ? "opacity-35" : ""
                    }`}
                  >
                    <span className="block font-serif text-lg font-bold leading-none tabular-nums">
                      {seg.n}
                    </span>
                    <span className="mt-1 block text-label font-bold uppercase tracking-[0.14em]">
                      {seg.label}
                    </span>
                    {/* The active column is underlined in its own colour. The
                        dimming of the others carries most of the signal, but a
                        filtered list that looks like an unfiltered one is how
                        somebody concludes their films have gone. */}
                    <span
                      className="mx-auto mt-1 block h-[2px] w-6 rounded-full"
                      style={{ background: active ? "currentColor" : "transparent" }}
                    />
                  </button>
                );
              })}
          </p>
        )}

        {/* Deliberately in the header block and NOT in the scroller below: the
            section spacers and the tier-jump offsets are computed from row
            heights, so anything inserted above the sections would shift every
            section top while `jumpTo` kept using the unshifted numbers. */}
        {/* ── One field, with the jump inside it ──────────────────────────
            It was a rounded field beside a smaller rounded pill reading
            "Jump ▾": two containers of different widths sharing a line, and the
            only control in the app carrying a word plus a caret where every
            other one carries a glyph.

            The field now runs the whole line and the jump sits at its trailing
            edge as an arrow. That spot is usually a clear button, so two things
            keep it honest: this search has no clear button to be confused with,
            and a hairline separates the arrow from the text so it reads as its
            own control rather than as furniture inside the box. The arrow turns
            over when the menu is open, which is the only state it has. */}
        <div className="relative flex items-center">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            // Names what it will actually match now. A bar that silently
            // searches three fields is a bar nobody knows searches three
            // fields — and the alternative the user ruled out, separate
            // buttons per field, makes you declare what you are looking for
            // before you look.
            placeholder={[lex().One, lex().maker, lex().secondRole]
              .filter(Boolean)
              .join(", ")
              .replace(/, ([^,]*)$/, " or $1")}
            // `pr-12` is the arrow's room. Without it a long query runs under
            // the glyph and the last characters are unreadable.
            className={`${FIELD} pr-12`}
          />
          {/* Hidden on the shuffled page: there are no tier headers to jump to
              there, so every destination would scroll to a row that is not the
              one it named. */}
          <button
            hidden={!!flat}
            onClick={() => setJumpOpen((v) => !v)}
            data-tour="list-jump"
            aria-label="Jump to a tier"
            aria-expanded={jumpOpen}
            className="absolute inset-y-1 right-1 flex items-center pl-2.5 pr-3 text-dim active:scale-95"
            style={{ borderLeft: "1px solid var(--border)" }}
          >
            {/* This was the only chevron in the app drawn properly, and it is
                now the one every other chevron is drawn from — see `ChevronIcon`. */}
            <ChevronIcon open={jumpOpen} />
          </button>
          {jumpOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setJumpOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-40 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
                {ORDERED_TIERS.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => (
                  <button
                    key={t}
                    onClick={() => jumpTo(t)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left active:scale-[0.98]"
                  >
                    <span className="text-sub text-gold">{starsFor(t)}</span>
                    {/* "12/134", not "134". The count alone said how big the
                        tier is; the pair says how much of it is left, which is
                        the thing you are actually choosing on. A finished tier
                        reads as its own total on both sides and needs no
                        separate tick. */}
                    <span className="text-sub tabular-nums text-dim">
                      <span className="text-text-hi">{ranked.get(t) ?? 0}</span>/{counts.get(t)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Where the tiers begin and end ───────────────────────────────
            Under the search bar rather than inside it: the field already has a
            control at its trailing edge (the jump arrow is absolutely
            positioned against that edge), and a second one there would sit on
            top of it. Its own line is also the honest shape — this opens a
            screen, where everything else on this row acts on the list in place.

            Hidden while searching and on the shuffled page. The cut is placed
            on the WHOLE library in one order, so offering it from a filtered
            view would promise to cut something the reader cannot see. It needs
            `onFilms` because it writes, and a read-only list has none. */}
        {/* Beside the cut rather than under it: both act on how the list READS,
            and a row of two is one line where two rows would be two. The grid
            toggle stays available while searching and on the flat pages — it is
            a reading mode and every page has something to read — so it is not
            behind the same guard. */}
        <div className="mt-2 flex gap-2">
          {onFilms && !searching && !flat && (
            <button
              onClick={() => setCutting(true)}
              aria-label="Set where the tiers begin and end"
              className="flex-1 rounded-xl border border-border py-2.5 text-label font-bold uppercase tracking-[0.14em] text-gold active:scale-[0.99]"
            >
              Set tiers
            </button>
          )}
          {onGrid && (
            <button
              onClick={() => onGrid(!grid)}
              aria-label={grid ? "Show the list as rows" : "Show the list as a grid"}
              aria-pressed={grid}
              className={`${onFilms && !searching && !flat ? "flex-1" : "w-full"} rounded-xl border border-border py-2.5 text-label font-bold uppercase tracking-[0.14em] text-dim active:scale-[0.99]`}
            >
              {grid ? "Rows" : "Grid"}
            </button>
          )}
        </div>
      </div>

      <div
        ref={scroller}
        // overflow-x hidden as well as y: setting one axis to auto computes the
        // other to auto, and the pane mid-turn would be reachable sideways.
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-6"
        // ── This alone does NOT stop the scroll, and that was the bug ──────
        //
        // Reported: "the list scrolls with my thumb so I cant actually move it".
        // `touch-action` is latched by the browser at TOUCHSTART. Setting it
        // once a drag has begun changes nothing about the gesture already in
        // flight, and by the time `preventDefault` was reached the compositor
        // owned the scroll and ignored it.
        //
        // Kept because it is still correct for anything that starts while a
        // drag is up. The thing that actually holds the list still is the
        // non-passive native listener in the effect beside `dropAt`.
        style={{ touchAction: drag ? "none" : undefined }}
        onTouchStart={(e) => {
          // Same guard as everywhere else. The list has no sideways strips today
          // and the rolodex proved what happens when one appears and the screen
          // that hosts it was never told.
          if (inShelf(e.target)) return (touch.current = null);
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY, axis: null };

          // ── A drag begins as a HOLD, not as a touch ────────────────────
          //
          // Every row is already a button that opens the card, and the list is a
          // tall scroller. A drag that started on contact would steal both. The
          // hold is what separates "I am going somewhere" from "I mean this
          // one", and it is the same gesture the poster long-press already
          // teaches.
          // ── Two long-presses, one row ──────────────────────────────────
          //
          // The rank numeral carries its own hold, which opens the placement
          // sheet. Without this guard a hold that begins on the number arms the
          // row DRAG as well, and 380ms later the film is airborne under a
          // sheet nobody can see past.
          const onNumeral =
            e.target instanceof Element && !!e.target.closest("[data-lock]");
          if (onFilms && !searching && !grid && !onNumeral) {
            const at = rowAt(t.clientY);
            const row = at ? displayOrder[at.at] : undefined;
            // ── Pinned rows drag too ──────────────────────────────────────
            //
            // This used to read `(moveLocked || !isHard(row))`, so a row you had
            // locked could not be picked up until you found a padlock toggle
            // next to the search box. That is the rigidity, in one line.
            //
            // A lock means "the MODEL may not rearrange this". It has never
            // meant "you may not touch this", and conflating the two made the
            // app argue with its owner. Every user action always works; the
            // model's restraint is unchanged and lives in `respreadTier` and
            // `matchmaker.poolFor`, where it belongs.
            //
            // The pin SURVIVES the move: `applyMove` writes a score and never
            // touches `lock`, so a film you pinned stays pinned, at the place
            // you just put it.
            //
            // `at` is narrowed alongside `row` so the closure below can read it
            // without the compiler losing track of it across the timeout.
            if (at && row) {
              holdTimer.current = setTimeout(() => {
                holdTimer.current = null;
                setDrag({
                  id: row.id,
                  from: at.at,
                  to: at.at,
                  startY: t.clientY,
                  y: t.clientY,
                  lineY: at.top,
                });
                // A short buzz, where the device offers one: the row has left
                // the list and nothing else on screen says so yet.
                navigator.vibrate?.(12);
              }, HOLD_MS);
            }
          }
        }}
        onTouchMove={(e) => {
          const from = touch.current;

          // Dragging is handled by a NATIVE listener, not here — see the effect
          // next to `dropAt`. React's handler cannot stop the scroll.
          if (drag) return;

          if (!from || turning.current) return;
          // Moving at all means this was a scroll or a swipe, not a hold.
          if (
            holdTimer.current &&
            (Math.abs(e.touches[0].clientX - from.x) > 8 ||
              Math.abs(e.touches[0].clientY - from.y) > 8)
          ) {
            cancelHold();
          }
          if (from.axis === "x") {
            const dx = e.touches[0].clientX - from.x;
            // Resist only at the left end, where nothing is next door. The right
            // end leads to the game and must not fight the reader on the way.
            slide(`${page === 0 && dx > 0 ? dx * 0.25 : dx}px`, 0);
            return;
          }
          if (from.axis) return;
          const t = e.touches[0];
          const dx = t.clientX - from.x;
          const dy = t.clientY - from.y;
          // The list is a tall vertical scroller, so the axis test matters more
          // here than anywhere: a flick down the library drifts sideways by a
          // few pixels every time, and claiming those would make the screen
          // change under a reader who was only scrolling.
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          from.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }}
        onTouchEnd={(e) => {
          const from = touch.current;
          touch.current = null;
          cancelHold();
          if (drag) {
            dropAt(drag.from, drag.to);
            setDrag(null);
            return;
          }
          if (!from || from.axis !== "x" || turning.current) return;
          const dx = e.changedTouches[0].clientX - from.x;
          const landed = pageAfterSwipe(page, segments.length - 1, dx, e.currentTarget.clientWidth);
          // Off an end: the shell takes it, and this pane springs back rather
          // than sitting where the finger left it.
          if (landed === "before" || landed === "after") {
            // This pane eases home either way: on "after" the whole screen is
            // about to leave, and it should leave from where it sits rather than
            // with an inner offset still on it.
            slide("0px", TURN_MS);
            if (landed === "after") onRibbon(1, Math.abs(dx) / e.currentTarget.clientWidth);
            return;
          }
          if (landed === page) return slide("0px", TURN_MS);
          turnTo(
            segments[landed as number].key,
            dx < 0 ? 1 : -1,
            Math.abs(dx) / e.currentTarget.clientWidth,
          );
        }}
      >
        <div ref={track}>
        {model.total === 0 && (
          <p className="mt-16 text-center text-sub leading-relaxed text-dim">
            Nothing here yet.
            <br />
            Import a Letterboxd ratings.csv from Settings to begin.
          </p>
        )}

        {searching ? (
          results.length === 0 ? (
            <p className="mt-10 text-center text-sub text-dim">Nothing matches.</p>
          ) : (
            <div className="pt-3">
              {results.map((r) =>
                "rank" in r ? (
                  <Row key={r.film.id} film={r.film} rank={r.rank} onInfo={onInfo} showStars={!hideStars} />
                ) : (
                  <Row key={r.id} film={r} onInfo={onInfo} showStars={!hideStars} />
                ),
              )}
            </div>
          )
        ) : flat ? (
          <FlatRows
            rows={flat}
            view={view}
            onInfo={onInfo}
            carried={carriedId}
            carriedBy={carriedBy}
            onUnpin={onFilms ? unpin : undefined}
                    onLockMenu={onFilms ? (f, r) => setLockFor({ film: f, rank: r }) : undefined}
          />
        ) : (
          model.sections.map((s, i) => {
            const o = offsets[i];
            const near = o.top < view.top + view.height + NEAR && o.top + o.height > view.top - NEAR;
            if (!near) return <div key={s.tier} style={{ height: o.height }} />;
            return (
              <section key={s.tier} data-tier={s.tier} style={{ height: o.height }}>
                {/* The rule stays whatever the preference says — it is what
                    keeps the sections apart, and a list of eight hundred rows
                    with no divisions at all is a different screen. Only the
                    stars come off it; the count still says how big the block
                    is, so the reader can see where they are without being told
                    which rating they are looking at. HEADER_H is unchanged
                    either way, because every section offset is derived from it. */}
                <TierRule stars={hideStars ? "" : starsFor(s.tier)} count={s.total} />
                {grid ? (
                  <GridRows
                    films={s.placed.map((r: RankedFilm) => r.film)}
                    ranks={s.placed.map((r: RankedFilm) => r.rank)}
                    cols={cols}
                    cellH={cellH}
                    onInfo={onInfo}
                  />
                ) : (
                  s.placed.map((r: RankedFilm) => (
                    <Row
                      key={r.film.id}
                      film={r.film}
                      rank={r.rank}
                      onInfo={onInfo}
                      carried={carriedId === r.film.id}
                      carriedBy={carriedBy}
                      onUnpin={onFilms ? unpin : undefined}
                      onLockMenu={onFilms ? (f, r) => setLockFor({ film: f, rank: r }) : undefined}
                    />
                  ))
                )}
                {s.unplaced.length > 0 && (
                  <div
                    className="flex items-center gap-2.5"
                    data-tour="list-unrnkd"
                    style={{ height: DIVIDER_H }}
                  >
                    <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                    <span className="text-label font-bold tracking-[0.18em] text-dim">UN-RNKD</span>
                    <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                  </div>
                )}
                {grid ? (
                  <GridRows films={s.unplaced} cols={cols} cellH={cellH} onInfo={onInfo} />
                ) : (
                  s.unplaced.map((f) => <Row key={f.id} film={f} onInfo={onInfo} />)
                )}
              </section>
            );
          })
        )}
        </div>
      </div>

      {/* ── The landing line, at the thumb ───────────────────────────────
          Reported: "I think the line itself should shadow the thumb movement".
          It was a border on whichever row was the target, so it jumped a whole
          row at a time and sat wherever that row happened to be rather than
          where the finger was.

          `fixed`, at the finger's own client Y, so it tracks continuously and
          needs no conversion between client, scroller and content coordinates —
          three frames that all differ here, and the scroller can move under it.
          Safe because nothing on this screen is transformed while a drag is up:
          the page turn and the drag cannot both be happening. */}
      {drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-3 z-30"
          style={{
            top: drag.lineY,
            height: 2,
            background: "var(--gold)",
            boxShadow: "0 0 10px var(--gold)",
          }}
        />
      )}

      {/* ── What just moved, and the way back ────────────────────────────────
          Sits above the nav rather than at the top of the screen, because it is
          about the thumb that just did something, not about the list as a whole.
          Announced for EVERY move, not only large ones: the complaint was never
          that big moves are unclear, it is that moves happen unannounced. */}
      {lastMove && (
        <div
          key={lastMove.at}
          className="tip fixed inset-x-3 z-30 flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
          style={{ bottom: "calc(var(--nav-h) + 12px)", background: "var(--surface)" }}
        >
          <span className="min-w-0 flex-1 text-sub text-text-hi">
            <span className="truncate font-bold">{lastMove.title}</span>
            <span className="text-dim"> moved to #{lastMove.to}</span>
          </span>
          <button
            onClick={undoMove}
            className="flex-shrink-0 text-label font-bold uppercase tracking-[0.14em] text-gold active:scale-95"
          >
            Undo
          </button>
        </div>
      )}

      {lockFor && (
        <LockSheet
          film={lockFor.film}
          rank={lockFor.rank}
          onClose={() => setLockFor(null)}
          onSet={(lock) => setLock(lockFor.film, lock)}
        />
      )}

      <BottomNav
        screen="list"
        onSettings={onSettings}
        onModes={onDuel}
        onList={() => {
          // `select` as well as `focus`: arriving here with a stale query
          // already in the box means the first thing you type should replace
          // it, not append to it.
          searchRef.current?.focus();
          searchRef.current?.select();
        }}
        onProfile={onProfile}
        logging={logging}
        onToggleLog={onToggleLog}
      />

      {/* Mounted only while it is open, so the belief fit it does on the way in
          happens when the reader asks for it and not on every list render. It
          needs the log, which arrives asynchronously — the button is drawn
          before then, so this guards rather than assuming. */}
      {cutting && log && onFilms && (
        <TierCut films={films} log={log} onFilms={onFilms} onClose={() => setCutting(false)} />
      )}
    </main>
  );
}

// Two gradient rules fading out either side of the stars, rather than a solid
// bar — a tier boundary should read as a seam in the list, not a lid on it.
function TierRule({ stars, count }: { stars: string; count: number }) {
  return (
    <div className="flex items-center gap-3" style={{ height: HEADER_H }}>
      <span
        className="h-px flex-1"
        style={{ background: "linear-gradient(to right, transparent, var(--border))" }}
      />
      <span className="text-body tracking-[0.08em] text-gold">{stars}</span>
      <span className="text-label text-dim">{count}</span>
      <span
        className="h-px flex-1"
        style={{ background: "linear-gradient(to left, transparent, var(--border))" }}
      />
    </div>
  );
}

/**
 * Every few seconds, one poster that is actually on screen gives a shake.
 *
 * It signals nothing and it is not a recommendation — it is warmth. A column of
 * eight hundred stills sits very dead, and one card twitching now and then is
 * enough to stop it reading as a screenshot of itself. If someone looks over at
 * whichever film moved, that is a bonus, not the point.
 *
 * Straight DOM, no state. Driving this through React would re-render the whole
 * list to animate a single image, which is exactly the cost the section
 * virtualisation and content-visibility above exist to avoid.
 *
 * The interval is re-randomised each time rather than fixed: a steady beat reads
 * as a stuck loop, and the whole effect depends on being unable to predict it.
 */
function usePosterShake(root: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || !active) return;

    let timer: ReturnType<typeof setTimeout>;
    let current: HTMLElement | null = null;

    const clear = () => {
      current?.classList.remove("shake");
      current = null;
    };

    const shake = () => {
      // Only ever one at a time — two posters moving together stops reading as
      // a quirk and starts reading as the page glitching.
      clear();

      const box = el.getBoundingClientRect();
      const onScreen: HTMLElement[] = [];
      el.querySelectorAll<HTMLElement>("[data-film-id]").forEach((row) => {
        const r = row.getBoundingClientRect();
        // Fully inside, not merely intersecting: half a poster twitching at the
        // edge of the viewport looks like a rendering fault.
        if (r.top >= box.top && r.bottom <= box.bottom) onScreen.push(row);
      });

      const row = onScreen[Math.floor(Math.random() * onScreen.length)];
      const poster = row?.querySelector<HTMLElement>(".list-poster");
      // A film with no artwork yet renders a plain span in the poster's place;
      // shaking an empty rectangle is just a flicker, so let it sit this one out.
      if (poster instanceof HTMLImageElement) {
        current = poster;
        poster.classList.add("shake");
        poster.addEventListener("animationend", clear, { once: true });
      }

      timer = setTimeout(shake, 4000 + Math.random() * 5000);
    };

    timer = setTimeout(shake, 4000 + Math.random() * 5000);
    return () => {
      clearTimeout(timer);
      clear();
    };
  }, [root, active]);
}

/**
 * The number on a row, and the control for the state it reports.
 *
 * Split out of `Row` because it now owns a gesture and therefore a timer, and a
 * timer wants a ref of its own rather than one more thing for the row to hold.
 *
 * Tap releases a pin — the one thing worth doing without a menu. Hold opens
 * `LockSheet`, which is every other thing. Right-click does the same on a
 * pointer, where there is no hold.
 */
function RankNumeral({
  film,
  rank,
  onUnpin,
  onLockMenu,
}: {
  film: Film;
  rank: number;
  onUnpin?: (f: Film) => void;
  onLockMenu?: (f: Film, rank: number) => void;
}) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when the hold actually fires, so the touchend that follows does not
  // ALSO read as a tap and unpin the film behind the sheet that just opened.
  const fired = useRef(false);
  const cancel = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  const canUnpin = !!onUnpin && isHard(film);
  const canMenu = !!onLockMenu;
  return (
    <span
      // Read by the list's own touchstart, which must not arm a row DRAG for a
      // hold that began here. Two long-presses on one row is fine as long as
      // they do not both start.
      data-lock
      role={canUnpin || canMenu ? "button" : undefined}
      tabIndex={canUnpin || canMenu ? 0 : undefined}
      onTouchStart={
        canMenu
          ? () => {
              cancel();
              fired.current = false;
              hold.current = setTimeout(() => {
                hold.current = null;
                fired.current = true;
                navigator.vibrate?.(12);
                onLockMenu?.(film, rank);
              }, HOLD_MS);
            }
          : undefined
      }
      onTouchMove={canMenu ? cancel : undefined}
      onTouchEnd={canMenu ? cancel : undefined}
      onTouchCancel={canMenu ? cancel : undefined}
      onContextMenu={
        canMenu
          ? (e) => {
              e.preventDefault();
              onLockMenu?.(film, rank);
            }
          : undefined
      }
      onClick={
        canUnpin || canMenu
          ? (e) => {
              // The row is not a button any more, but the tap still travels —
              // and the poster/title button is a sibling, not a parent, so this
              // only guards against a future wrapper.
              e.stopPropagation();
              if (fired.current) {
                fired.current = false;
                return;
              }
              // A tap on a provisional number has nothing to release, so it
              // opens the sheet instead of doing nothing at all.
              if (canUnpin) onUnpin?.(film);
              else onLockMenu?.(film, rank);
            }
          : undefined
      }
      onKeyDown={
        canUnpin || canMenu
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              // Enter is the tap; there is no hold on a keyboard, so the menu is
              // the more useful of the two answers here.
              if (canMenu) onLockMenu?.(film, rank);
              else onUnpin?.(film);
            }
          : undefined
      }
      aria-label={
        canMenu
          ? `${film.title}, ${isHard(film) ? "locked" : "provisional"} at ${rank}. Change how it is placed`
          : undefined
      }
      className={`rank-num flex-shrink-0 font-serif text-[26px] leading-none ${
        isHard(film) ? "font-bold text-gold" : "font-normal text-accent"
      } ${canUnpin || canMenu ? "px-1 active:scale-90" : ""}`}
      title={
        isHard(film)
          ? "You locked this — tap to unpin, hold to change"
          : "Fast Shuffle placed this, and it can still move — hold to change"
      }
    >
      {rank}
    </span>
  );
}

/**
 * Everything a position can be, on one sheet.
 *
 * ── Why a hold and not a longer row ────────────────────────────────────────
 *
 * Tapping the numeral releases a pin in one gesture, which is right for the
 * thing people do most and wrong as the ONLY thing they can do: it can go from
 * locked to provisional and nowhere else. It cannot lock something the model
 * placed, and it cannot put a film back in the queue — for that the only route
 * was a reset in Settings that dropped every placement in the library.
 *
 * So the numeral carries both gestures, on the same principle the poster and
 * the row already use: tap is the common answer, hold is all of them. Nothing
 * is added to the row, and the control is the thing that already REPORTS the
 * state being changed.
 *
 * ── Why the order runs downwards ───────────────────────────────────────────
 *
 * Locked, provisional, not ranked — most committed first. It is the order the
 * legend in the list header already reads in, and it means the destructive
 * option is the one furthest from the thumb.
 */
function LockSheet({
  film,
  rank,
  onClose,
  onSet,
}: {
  film: Film;
  /** Where it currently sits, so "Locked" can name the position it would keep. */
  rank?: number;
  onClose: () => void;
  onSet: (lock: "hard" | "soft" | undefined) => void;
}) {
  const opts: { lock: "hard" | "soft" | undefined; title: string; blurb: string }[] = [
    {
      lock: "hard",
      title: rank === undefined ? "Locked" : `Locked at #${rank}`,
      blurb: `Your decision. Nothing Rankd plays will move it.`,
    },
    {
      lock: "soft",
      title: "Provisional",
      blurb: `Rankd's own placement. It keeps its number and keeps improving as you play.`,
    },
    {
      lock: undefined,
      title: "Not ranked",
      blurb: `Back in the queue. It loses its number and Fast Shuffle can place it again.`,
    },
  ];
  return (
    <Sheet title={film.title} onClose={onClose}>
      {opts.map((o) => {
        const on = film.lock === o.lock;
        return (
          <button
            key={o.title}
            onClick={() => {
              onSet(o.lock);
              onClose();
            }}
            className="mb-1.5 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left active:scale-[0.99]"
            style={{ borderColor: on ? "var(--gold)" : "var(--border)" }}
          >
            <span className="min-w-0">
              <span className={`block text-body ${on ? "text-gold" : "text-text-hi"}`}>{o.title}</span>
              <span className="block text-sub leading-snug text-dim">{o.blurb}</span>
            </span>
            {/* The current state is marked, not disabled: tapping it is a
                harmless way to dismiss the sheet having decided to change
                nothing, and a dead row would look like a bug. */}
            {on && <span className="flex-shrink-0 text-label font-bold uppercase tracking-[0.14em] text-gold">Now</span>}
          </button>
        );
      })}
    </Sheet>
  );
}

function Row({
  film,
  rank,
  onInfo,
  showStars,
  carried,
  carriedBy = 0,
  onUnpin,
  onLockMenu,
}: {
  film: Film;
  rank?: number;
  onInfo: (f: Film) => void;
  showStars?: boolean;
  /** This row is the one under the finger. */
  carried?: boolean;
  /** How far the finger has travelled since the drag began, in px. */
  carriedBy?: number;
  /** Release this film's pin. Absent on a read-only list. */
  onUnpin?: (f: Film) => void;
  /** Open the sheet that sets how this film is placed. */
  onLockMenu?: (f: Film, rank: number) => void;
}) {
  return (
    <div
      data-film-id={film.id}
      // ── What a drag looks like ────────────────────────────────────────
      //
      // The carried row lifts and everything else stays exactly where it is,
      // with a single line marking where it would land. Live-reordering the
      // rows underneath was the alternative and is a bad trade here: the list
      // is virtualised with fixed heights and paint containment, so every row
      // that moved would reflow a section, and 800 of them would do it while a
      // finger was down.
      //
      // A line is also more honest about what is happening. Nothing has been
      // decided until the finger lifts.
      style={{
        height: ROW_H,
        ...(carried
          ? {
              // Travels with the finger. It used to lift and stay put, so the
              // thumb walked away from the thing it was carrying — reported as
              // "it also looks a little off", and it was the biggest part of it.
              transform: `translateY(${carriedBy}px) scale(1.02)`,
              opacity: 0.92,
              // ── No drop shadow ────────────────────────────────────────
              //
              // It was `0 10px 30px var(--shadow-strong)`, which is 75% black
              // over 30px on the night theme — a dark smudge trailing the finger
              // rather than a lifted card. Reported as "the black bar where the
              // finger is held".
              //
              // The scale is enough on its own to say the row has left the list,
              // and the gold line says where it is going. A shadow that has to be
              // heavy to read on a dark page is the wrong device for a dark page.
              // Above its neighbours while it is off the ground, or the rows it
              // passes over paint on top of it.
              position: "relative",
              zIndex: 20,
            }
          : null),
      }}
      // Every row carries it; the tour points at whichever is first on screen.
      data-tour="list-row"
      className="list-row flex w-full items-center gap-3.5 text-left"
    >
      {/* ── Why the row is no longer itself a button ────────────────────────
          The rank numeral has to be tappable on its own — it is where a pin is
          drawn, so it is the obvious place to release one. A button inside a
          button is invalid HTML and unreachable by a keyboard, so the row is a
          container now and the two controls are siblings.

          Everything the drag depends on is unchanged: `data-film-id` and the
          height stay on this element, which is what `rowAt` hit-tests and what
          the section spacers are computed from. */}
      <button
        onClick={() => onInfo(film)}
        className="flex h-full min-w-0 flex-1 items-center gap-3.5 text-left active:scale-[0.99]"
      >
        {film.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={film.poster} alt="" loading="lazy" className="list-poster" />
        ) : (
          <span className="list-poster" style={{ background: "var(--border)" }} />
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-text-hi">{film.title}</span>
          <span className="block text-sub text-dim">
            {film.year}
            {showStars && <span className="ml-2 text-gold">{starsFor(film.rating)}</span>}
          </span>
        </span>
      </button>

      {/* Three states, told by the number's weight rather than by anything that
          would change the row's height — ROW_H is load-bearing, since the
          section spacers and the tier jumps are computed from it.

          Gold and solid  = LOCKED. You committed to this position.
          Accent blue     = SHUFFLED. Fast Shuffle placed it; it counts, but the
                            model is still free to revise it.
          Dim UN-RNKD     = no position at all.

          These three match the legend in the header exactly. Change one and
          change both — a key whose colours differ from the thing it keys is
          worse than no key.

          The distinction has existed in the data since hard and soft locks
          landed. This is where it is DRAWN; the legend in the header block is
          where it is NAMED. It was drawn without ever being named for several
          sessions, which is the whole of N2. */}
      {rank === undefined ? (
        <span className="flex-shrink-0 text-label font-bold tracking-[0.14em] text-dim">UN-RNKD</span>
      ) : (
        /* `title` is kept as a desktop pointer, but it is no longer where the
           distinction LIVES — the legend in the header says it out loud. The
           wording matches the legend on purpose. */
        /* ── A pin you can take back in one tap ─────────────────────────────
           The gold numeral already MEANS "you locked this". Until now that was
           all it did, and the only way back was a bulk reset in Settings that
           dropped every placement at once — which is why committing to a
           position felt heavier than it should.

           So the numeral becomes the control for the thing it is already
           reporting: tap it to release the pin. The inverse of "Lock in as #N",
           in the place a reader is already looking for it.

           Only a HARD lock is tappable. A soft one is the model's own placement
           and there is nothing of yours to take back — releasing it would just
           be asking the model to place it again, which is what it is already
           doing. */
        <RankNumeral
          film={film}
          rank={rank}
          onUnpin={onUnpin}
          onLockMenu={onLockMenu}
        />

      )}
    </div>
  );
}
