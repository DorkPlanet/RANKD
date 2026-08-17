"use client";

// Rough Cut — dealing a tier into three piles, one film at a time.
//
// The whole screen is one question asked repeatedly: upper, middle or lower
// third of this tier? No opponent, no climb, no confirm. See lib/roughCut.ts for
// why this exists and why it writes scores rather than judgements.
//
// It is deliberately the FASTEST surface in the app. A duel asks you to weigh
// two things; this asks you to place one, which is a much cheaper thought — so
// the layout gives the artwork the room and puts three large targets under it,
// and the flick gestures from the duel screen work here too for anyone already
// holding that muscle memory.
//
// ── What the motion is for ─────────────────────────────────────────────────
//
// This shipped with none, and next to the duel screen it read as an older app:
// there the cards float, tilt, fly into the climbing seat and get thrown off the
// edge, while here a poster was simply replaced by the next poster.
//
// The fix is not decoration. You answer this screen roughly once a second for
// fifty films, and at that rate the only thing that keeps a session from feeling
// like data entry is being able to FEEL each answer land without reading
// anything. So: the card follows your thumb and leans as it goes, the target you
// are aimed at lifts while the other two recede, and the placed film flies into
// the pile it was filed under. Every duration here is shorter than the duel's
// equivalent, because this surface has to stay the fastest one in the app.

import { useEffect, useRef, useState } from "react";

import { applyRoughCut, BUCKETS, roughCutPool, type Bucket } from "@/lib/roughCut";
import { clearRoughCut, loadRoughCut, saveRoughCut } from "@/lib/roughCutRun";
import { starsFor, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";
import { Countdown } from "./Countdown";
import { BottomNav, Header } from "./DuelScreen";
import { PosterArt } from "./PosterArt";
import { floatStyle, flyPosterTo } from "./PosterCard";

/** How far a pointer must travel before it counts as a flick rather than a tap. */
const FLICK_PX = 44;
/**
 * How long the card is left flying before the queue advances.
 *
 * Shorter than the flight itself (380ms), on the same reasoning as the duel's
 * `flyPosterAcross`: the state commits UNDER the clone while it is still moving,
 * so the next film is already settling in behind rather than waiting for the
 * last one to finish leaving. Waiting the full duration would put a visible
 * pause between every answer, which is the one thing this screen cannot afford.
 */
const FILE_MS = 150;
/** How far a drag can pull the card, so it never leaves its own space. */
const DRAG_CAP = 90;

const TARGET =
  "rc-target flex-1 py-3 text-[10px] font-extrabold uppercase tracking-[0.16em] active:scale-95";

export default function RoughCut({
  films,
  tier,
  below = 0,
  above = 0,
  onFilms,
  onExit,
  onRankPile,
  onSettings,
  onTrophies,
  onNavigate,
  logging,
  onToggleLog,
  onBegan,
  onInfo,
}: {
  films: Film[];
  tier: Rating;
  /** Widen the pass either side of the anchor tier. Each film keeps its own rating. */
  below?: number;
  above?: number;
  onFilms: (films: Film[]) => void;
  onExit: () => void;
  /** Apply the pass and start a King of the Hill run over just this pile. */
  onRankPile: (films: Film[], ids: string[]) => void;
  onSettings: () => void;
  onTrophies: () => void;
  /**
   * Leave for another screen. The pass is applied on the way out — see `leaveTo`
   * — so the caller only has to do the navigating.
   */
  onNavigate: (to: "modes" | "list" | "profile") => void;
  /** The log sheet lives in `AppShell` now; the nav only lights its cell. */
  logging?: boolean;
  onToggleLog?: () => void;
  /**
   * A pass is on screen with its targets mounted.
   *
   * The tour cannot be fired by arriving at a screen, because this is not one —
   * it is a branch inside the duel screen, and `tourFor` maps screens. It also
   * cannot ride on the duel tour's trigger, which is gated on a live session
   * that Rough Cut deliberately does not have. Same shape as `onRunBegan`, and
   * for the same reason: the marks point at things that exist only once the
   * pass is actually running.
   */
  onBegan?: () => void;
  /** Open a film. Hold the poster; same gesture as the duel screen. */
  onInfo?: (film: Film) => void;
}) {
  // The pile is fixed for the duration of a pass. Re-deriving it as scores
  // change would reorder the queue under the user mid-pass — they would see
  // films they had already placed come back around. `refine` replaces it
  // wholesale to start a second pass over one pile.
  // ── Resuming ──────────────────────────────────────────────────────────────
  //
  // Read ONCE, in the initialisers, so the screen never renders the first film
  // of a fresh pass and then jumps to where you actually were. `loadRoughCut`
  // refuses anything it cannot rebuild exactly, so `resumed` is either a pass
  // that still matches this library or null.
  const [resumed] = useState(() => loadRoughCut(films, tier));
  const [pass, setPass] = useState<{ films: Film[]; n: number }>(() =>
    resumed ? { films: resumed.films, n: resumed.n } : { films: roughCutPool(films, tier, below, above), n: 1 },
  );
  const pool = pass.films;
  const [at, setAt] = useState(resumed?.at ?? 0);
  const [choices, setChoices] = useState<Map<string, Bucket>>(resumed?.choices ?? new Map());
  const [next, setNext] = useState<"rank" | "split">("rank");
  const start = useRef<{ x: number; y: number } | null>(null);

  // `drag` is how far the thumb has pulled the card; `aimed` is the bucket it
  // would land in if released now. Both null when idle, so nothing moves and all
  // three targets read equally. Following the thumb is what turns the flick from
  // a shortcut you must remember into a gesture you can see working.
  const [drag, setDrag] = useState<number | null>(null);
  const [aimed, setAimed] = useState<Bucket | null>(null);
  // Bumped on every placement, purely as an animation key for the progress bar.
  const [beat, setBeat] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  // Hold-to-open, matching PosterCard exactly: same 450ms, same 8px movement
  // cancel, same `held` flag so the release that ends a hold cannot also count
  // as a tap. Duplicated rather than shared because the two cards disagree about
  // what a tap MEANS — there it picks a winner, here it does nothing at all.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  const startHold = (f: Film) => {
    cancelHold();
    holdTimer.current = setTimeout(() => {
      held.current = true;
      onInfo?.(f);
    }, 450);
  };
  // A pass that unmounts mid-hold must not open a film onto a screen that has
  // already gone.
  useEffect(() => cancelHold, []);
  // The three targets, so a placed card can be sent to the one it was filed
  // under. Measured at animation time rather than stored as coordinates, which
  // would go stale the moment the layout moved.
  const targets = useRef<Partial<Record<Bucket, HTMLButtonElement | null>>>({});

  // ── Read the card from the LIVE library, not the frozen queue ─────────────
  //
  // `pool` is captured once when the pass starts, which is right for the ORDER —
  // it must not reshuffle underneath the reader — and wrong for the film's
  // contents. Artwork arrives asynchronously and lands in `state.films`, so a
  // card rendered from the snapshot kept showing the placeholder it was born
  // with no matter how many posters turned up behind it. Rough Cut shows one
  // film at a time, so this was every card.
  //
  // The queue still decides WHICH film and in what order; this only decides
  // which copy of it is drawn. Falls back to the snapshot for a film that has
  // since left the library, which `loadRoughCut` already refuses to resume but
  // a live removal could still produce.
  const queued = pool[at];
  const film = (queued && films.find((f) => f.id === queued.id)) ?? queued;
  const done = at >= pool.length;

  // Written after every render that moves the queue, rather than inside
  // `place`. A placement is three separate state updates and `undo` is another
  // two — persisting from inside each of them would mean five call sites that
  // all have to agree, and the one that eventually forgets is the bug. Here
  // there is one rule: whatever is on screen is what gets stored.
  //
  // `saveRoughCut` clears the record for a pass that has not started or has
  // finished, so leaving is handled by the same line as arriving.
  useEffect(() => {
    saveRoughCut({ tier, films: pool, at, choices, n: pass.n });
  }, [tier, pool, at, choices, pass.n]);

  // Once per mount, and only while there is genuinely a pass on screen — a pool
  // this short renders the summary instead, and the marks would point at
  // nothing. `resolveSteps` would filter them all out and the tour would burn
  // itself as "seen" having shown the user zero steps, which is the exact bug
  // the duel tour's session gate exists to prevent.
  const began = useRef(false);
  useEffect(() => {
    if (began.current || pool.length === 0) return;
    began.current = true;
    onBegan?.();
    // Deliberately once: re-firing as the queue advances would raise the coach
    // over a pass already in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // How the deal is going, counted from `choices` rather than tracked
  // separately — three tallies kept in state would be three more things that
  // can disagree with the map they describe, and `undo` would have to remember
  // to decrement the right one.
  const filed: Record<Bucket, number> = { top: 0, middle: 0, bottom: 0 };
  for (const b of choices.values()) filed[b]++;

  // Applied against the CURRENT library rather than the one captured at mount,
  // so anything the credits sweep filled in while you were placing survives.
  const commit = (picked: Map<string, Bucket>) => {
    onFilms(applyRoughCut(films, tier, picked));
    // Done and Throw it away both END the pass, so neither may leave a resume
    // behind — the first has already written its answers into the library and
    // the second means you did not want them. Cleared explicitly rather than
    // left to the effect above, which will not run again after this unmounts.
    clearRoughCut();
    onExit();
  };

  /**
   * File the film on screen into one of the three piles.
   *
   * The state change is the same three lines it always was; everything around it
   * is the animation. The clone is spawned BEFORE `setAt` moves the queue on,
   * because the moment it does React swaps the poster and there is nothing left
   * to take a picture of.
   */
  const place = (bucket: Bucket) => {
    if (!film) return;

    const poster = cardRef.current?.querySelector("img");
    const target = targets.current[bucket];
    if (poster && target) flyPosterTo(poster, target, film.poster ?? "");

    const advance = () => {
      setChoices((c) => new Map(c).set(film.id, bucket));
      setAt((i) => i + 1);
      setBeat((b) => b + 1);
      setDrag(null);
      setAimed(null);
    };

    // Commit under the clone while it is still moving — but only when there was
    // a clone to hide behind. With no artwork the flight never happened, so
    // waiting would just be a delay before nothing.
    if (poster && target) setTimeout(advance, FILE_MS);
    else advance();
  };

  /**
   * Come back to this one later.
   *
   * ── Why a defer and not a skip ─────────────────────────────────────────────
   *
   * The hard part of this screen is being asked about a film before you have any
   * feel for the tier. The first few decisions are guesses, and you only learn
   * they were wrong once you have seen the rest.
   *
   * A real skip — drop it, move on — would answer that by quietly losing films,
   * which is the one thing a pass over your whole tier must not do. Sending it
   * to the BACK costs nothing and fixes the actual problem: by the time it comes
   * round again you have seen everything else, so the question has an answer it
   * did not have the first time.
   *
   * `at` deliberately does not move. Nothing was decided, so the count of what
   * is left and the progress bar must both stay exactly where they were —
   * advancing either would report work that did not happen.
   */
  const skip = () => {
    // With one film left there is no "back" to send it to, and the button would
    // redraw the same card and look broken.
    if (at >= pool.length - 1) return;
    const next = [...pool];
    const [moved] = next.splice(at, 1);
    next.push(moved);
    setPass({ films: next, n: pass.n });
    setDrag(null);
    setAimed(null);
  };

  /**
   * Apply this pass, then climb one of its piles.
   *
   * The applied library is handed OUT rather than read back from the prop: the
   * parent's state update has not landed by the time this returns, so a caller
   * reading `state.films` would start the run against the pre-pass scores and
   * throw the whole pass away.
   */
  const rankPile = (bucket: Bucket) => {
    const applied = applyRoughCut(films, tier, choices);
    const ids = [...choices.entries()].filter(([, b]) => b === bucket).map(([id]) => id);
    clearRoughCut();
    onRankPile(applied, ids);
  };

  /**
   * Apply this pass, then start another over one of its piles.
   *
   * The scores have to LAND before the next pass reads them — `applyRoughCut`
   * spreads films across a sub-band, and the second pass narrows within that
   * band. Running it against the pre-pass library would re-derive from the flat
   * order and throw the first pass away.
   */
  const refine = (bucket: Bucket) => {
    const applied = applyRoughCut(films, tier, choices);
    onFilms(applied);
    const keep = new Set(
      [...choices.entries()].filter(([, b]) => b === bucket).map(([id]) => id),
    );
    setPass({ films: applied.filter((f) => keep.has(f.id)), n: pass.n + 1 });
    setChoices(new Map());
    setAt(0);
  };

  /**
   * Leave by the nav rather than by Done.
   *
   * This screen took the whole surface and drew no nav, so a pass was a trap:
   * the only ways out were Done and Throw it away, and every other screen in
   * the app was two taps further than it looks. Adding the bar means the same
   * five cells go the same five places from here.
   *
   * It applies the pass first, for the same reason Done does — a pass abandoned
   * two-thirds through is still two-thirds of a sorted tier, and losing that
   * because you tapped the list would be a worse trap than the one being fixed.
   */
  const leaveTo = (to: "modes" | "list" | "profile") => {
    onFilms(applyRoughCut(films, tier, choices));
    onNavigate(to);
  };

  const nav = (
    <BottomNav
      screen="duel"
      onSettings={onSettings}
      onModes={() => leaveTo("modes")}
      onList={() => leaveTo("list")}
      onProfile={() => leaveTo("profile")}
      logging={logging}
      onToggleLog={onToggleLog}
    />
  );

  const undo = () => {
    if (at === 0) return;
    const back = at - 1;
    const next = new Map(choices);
    next.delete(pool[back].id);
    setChoices(next);
    setAt(back);
  };

  if (done) {
    const counts = BUCKETS.map((b) => ({
      bucket: b,
      n: [...choices.values()].filter((v) => v === b).length,
    }));
    return (
      <main className="relative flex h-app flex-col overflow-hidden select-none">
        <Header onSettings={onSettings} onTrophies={onTrophies} />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          {/* The number counts up rather than appearing. It is the one figure
              this screen exists to report, and a count-up is the cheapest way to
              make a total read as something that was accumulated. */}
          <p className="rc-rise font-display text-3xl tracking-wide text-gold" style={{ "--i": 0 } as React.CSSProperties}>
            <CountUp to={choices.size} /> placed
          </p>
          <p className="rc-rise mt-3 text-[12px] leading-relaxed text-dim" style={{ "--i": 1 } as React.CSSProperties}>
            {starsFor(tier)} is roughly in order now. Ranking it properly from here is a fraction of
            the work — the climb starts from what you just decided rather than from nothing.
          </p>

          {/* Taking ONE pile forward is the natural next move, and dropping back
              into the whole tier is not — you have just decided these films
              belong together, so the run that follows should be about them.
              `startRun` has always accepted an arbitrary pile (`only`), and it
              is independent of `crossTier`, so a pile run still writes scores
              and locks like any other climb.

              RANK or SPLIT, chosen first, so the three piles are one row of
              buttons rather than six. Split is the answer when a pile is still
              too big to duel; rank is the answer when it isn't. */}
          <div className="rc-rise mt-7 w-full max-w-[300px]" style={{ "--i": 2 } as React.CSSProperties}>
            <div className="mb-2 flex gap-1">
              {(["rank", "split"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setNext(m)}
                  className={`flex-1 rounded-lg border py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] active:scale-95 ${
                    next === m ? "border-gold text-gold" : "border-border text-dim"
                  }`}
                >
                  {m === "rank" ? "Rank a pile" : "Split again"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {counts.map(({ bucket, n }) => (
                <button
                  key={bucket}
                  disabled={n < 2}
                  onClick={() => (next === "rank" ? rankPile(bucket) : refine(bucket))}
                  className="flex-1 rounded-xl border border-border py-2.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-text-hi active:scale-[0.98] disabled:opacity-30"
                >
                  {bucket === "top" ? "Upper" : bucket === "middle" ? "Middle" : "Lower"}
                  <span className="ml-1.5 text-dim tabular-nums">{n}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => commit(choices)}
            className="rc-rise mt-7 rounded-xl border border-gold/50 px-8 py-3 text-xs font-bold text-gold active:scale-[0.98]"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            Keep it
          </button>
          <button
            onClick={onExit}
            className="rc-rise mt-2 px-6 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-dim active:scale-95"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            Throw it away
          </button>
        </div>
        {nav}
      </main>
    );
  }

  return (
    <main className="relative flex h-app flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />

      {/* `mt-7`, down from `mt-11`. The 44px was sized to clear the header's
          feather on the duel screen, where a progress bar sits immediately
          under it. Here the first thing below is a row of stars with its own
          line box, so 28px clears the fade just as well and hands the
          difference to the artwork. */}
      <div className="mx-auto mt-7 w-full max-w-[330px] flex-shrink-0 px-5">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-base text-gold">{starsFor(tier)}</span>
          <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-dim">
            Rough cut{pass.n > 1 ? ` · pass ${pass.n}` : ""}
          </span>
        </div>
        {/* `key={beat}` re-mounts the fill on every placement, which is what
            replays the bloom — a CSS animation that has already run does not
            restart because a style changed. Same mechanism as the duel screen's
            arrival veil, and for the same reason. */}
        <span className="flex h-1 w-full overflow-hidden rounded-full bg-border">
          <span
            key={beat}
            className="rc-bar-pulse h-full transition-[width] duration-300"
            style={{ width: `${(at / pool.length) * 100}%`, background: "var(--accent)" }}
          />
        </span>

        {/* The count, big, directly under the bar.
            It was "1 of 12" in 9px small caps — a figure that goes UP while the
            work goes down, in the one size on this screen guaranteed not to be
            read at speed. You answer here roughly once a second, and what you
            want to know between answers is how much is LEFT. Shared with Fast
            Shuffle: same component, same roll.

            Inside the header block rather than floating under it. As its own
            top-level row it was a `flex-shrink-0` band sitting between two
            spacers, and when the column ran out of height the spacers went to
            zero and the card's title landed straight across "FILMS LEFT". One
            block cannot collide with itself. */}
        {/* Sized DOWN from 40, and the label pulled up against it.
            At 40 with rules either side and a 10px gap the block cost ~76px,
            and on a 730px phone every one of those came out of the poster —
            which dropped from ~350 to 223. The countdown is a readout; the
            artwork is the thing being judged. So the readout yields: 26px
            digits, no hairlines, label tucked under. ~30px back to the poster,
            and it still reads at a glance because nothing else up here is
            gold. */}
        <div data-tour="rc-count" className="mt-2.5 flex justify-center">
          <Countdown
            n={pool.length - at}
            label={pool.length - at === 1 ? "film left" : "films left"}
            size={26}
            tight
          />
        </div>
      </div>

      {/* The spacer that used to sit here is gone. It held the card off the
          header block, which looked considered on a tall screen and cost the
          poster ~28px on a 730px phone — and the header block already ends in
          the countdown's own label, which is space enough. The card starts
          right under it and takes everything that is left. */}

      {/* One film, centred. `key` on the id so a new film cannot inherit the
          previous one's transition mid-flight — and so `rc-card` replays its
          entrance for every film rather than only the first. */}
      <div
        ref={cardRef}
        key={film.id}
        // `pt-3` is the float's headroom, not padding for looks. The title
        // drifts up to 11px above its resting line, so with the card flush
        // against the header block it rose into "FILMS LEFT" at the top of
        // every cycle — measured at 8px of overlap. Clearance has to exceed the
        // travel or the collision is intermittent, which is worse than
        // constant.
        data-tour="rc-card"
        className="rc-card flex min-h-0 flex-col items-center px-8 pt-4"
        onContextMenu={(e) => e.preventDefault()} // holding must not raise the OS menu
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
          held.current = false;
          // Capture, so a drag that leaves the card still reports its release
          // here. Same reason `PosterCard` does it: without this the gesture is
          // lost the moment the thumb crosses the poster's edge.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // best-effort — the gesture still works, it just cannot leave the card
          }
          // Hold to open the film. The duel screen has had this since the start
          // and this screen never did, so the same press on the same artwork did
          // two different things depending on which mode you were in — and the
          // mode WITHOUT it is the one where you are placing a film blind, with
          // no opponent to judge it against, which is exactly when you would
          // want to check what it is.
          startHold(film);
        }}
        onPointerMove={(e) => {
          const from = start.current;
          if (!from) return;
          const dy = e.clientY - from.y;
          // Any real movement means a flick, not a hold.
          if (Math.abs(dy) > 8 || Math.abs(e.clientX - from.x) > 8) cancelHold();
          // Resisted rather than followed 1:1, and capped: the card is reporting
          // the gesture, not being dragged across the screen.
          setDrag(Math.max(-DRAG_CAP, Math.min(DRAG_CAP, dy * 0.55)));
          setAimed(Math.abs(dy) > FLICK_PX ? (dy < 0 ? "top" : "bottom") : null);
        }}
        onPointerUp={(e) => {
          cancelHold();
          const from = start.current;
          start.current = null;
          if (!from) {
            setDrag(null);
            setAimed(null);
            return;
          }
          // The hold already opened the info card. Releasing must not then file
          // the film you were only looking at.
          if (held.current) {
            held.current = false;
            setDrag(null);
            setAimed(null);
            return;
          }
          const dy = e.clientY - from.y;
          // The same gestures the duel screen uses: up is better, down is worse.
          if (Math.abs(dy) > FLICK_PX) {
            place(dy < 0 ? "top" : "bottom");
            return;
          }
          // Short of the threshold, so it springs back rather than placing.
          setDrag(null);
          setAimed(null);
        }}
        onPointerCancel={() => {
          cancelHold();
          start.current = null;
          setDrag(null);
          setAimed(null);
        }}
        // `flexGrow: 8` against the spacers' 1 / 0.94 / 0.46. Plain `flex-1` put
        // the card on equal terms with three empty boxes and the artwork came
        // out 80px tall — now that the poster yields to pressure, it has to be
        // told it is the thing that matters. The spacers keep enough of the
        // remainder to hold the targets where they were measured.
        style={{ flexGrow: 8, flexBasis: 0, minHeight: 0, touchAction: "pan-x" }}
      >
        {/* The float, which this screen never had. The duel's cards hang and
            drift; here the title and the poster sat dead still, and that — more
            than any of the motion added around them — is what kept this looking
            like a different app. Same classes and same phasing as PosterCard,
            which is deliberate: this is one card rather than a pair, so it
            passes its own id and takes the left-hand phase.

            Paused while a drag is live. The float moves `translate` and the drag
            moves `transform`, so they compose rather than fight — but a card
            that keeps bobbing under the thumb reads as lag, not as life. */}
        <span
          className="float-title mb-3 line-clamp-2 text-center font-display font-normal leading-[1.15] tracking-[0.02em] text-text-hi"
          style={{
            ...floatStyle(film.id, 2, 4.1, false),
            animationPlayState: drag === null ? "running" : "paused",
            fontSize: film.title.length > 44 ? 22 : film.title.length > 28 ? 26 : 32,
          }}
        >
          {film.title}
        </span>
        {/* The lean is derived from the drag rather than fixed, so the card
            banks INTO the direction it is being sent — up tips it back, down
            tips it forward. The transition is dropped while dragging so the
            poster tracks the thumb exactly, and restored on release so it
            springs back instead of snapping. */}
        {/* ── Why the poster is sized this way and not by a maxHeight ────────
            It had `aspectRatio: 2/3` and a maxHeight, in a card that was merely
            `shrink`. An aspect-ratio box takes the height its width demands and
            a maxHeight only caps it — neither yields to a flex parent. So when
            the countdown and the pile counts were added, the column needed more
            height than the screen had, the spacers collapsed to nothing, and
            the overflow came out as things drawn on top of each other: the
            title across "FILMS LEFT", the year across the middle pile's count.

            Same fix PosterCard already uses. The wrapper is `flex-1 min-h-0`,
            so it takes whatever is left and is allowed to be smaller than its
            content; the poster is `h-full` with the aspect ratio, so it derives
            its WIDTH from the height it was given. The artwork now gives way
            first and nothing can ever collide again — which also means the
            screen looks right at any height rather than at 812px only. */}
        <div
          className="float-poster flex min-h-0 w-full flex-1 justify-center"
          style={{
            ...floatStyle(film.id, 1, 5.2, false),
            animationPlayState: drag === null ? "running" : "paused",
            transform: drag ? `translateY(${drag}px) rotate(${drag * 0.045}deg)` : undefined,
            transition: drag === null ? "transform 0.28s cubic-bezier(.2,.8,.3,1)" : "none",
          }}
        >
          <div
            className="h-full overflow-hidden rounded-xl bg-surface"
            style={{
              aspectRatio: "2 / 3",
              containerType: "inline-size",
              boxShadow: "0 8px 26px rgba(0,0,0,0.55)",
            }}
          >
            {/* Was `film.poster && <img>`, so a film with no artwork got an
                empty grey rectangle and you were asked to place a blank. This
                screen shows one film at a time, which makes it the one most
                exposed to it. */}
            <PosterArt film={film} />
          </div>
        </div>
        {/* The year was here and is gone. It is the same fact the info card
            already carries, it is not what you are judging, and it was the
            second thing colliding with the pile counts. Nothing replaces it:
            this screen asks one question a second, and a line of trivia under
            the artwork is one more thing to skip past on every single film. */}
      </div>

      {/* ── Where the three targets sit ────────────────────────────────────
          All the slack under the poster used to be here, which pushed the
          targets to the foot of the screen: measured, they sat 76% of the way
          from the poster's bottom edge to the nav, all but touching Undo.

          The slack is split instead, so they land a little below the midpoint
          of that gap — close enough to the artwork to read as belonging to it,
          far enough off the bottom that the thumb is not choosing between them
          and the controls. 0.94 : 0.46 is that ratio, and it is expressed as
          WEIGHTS rather than pixels so the proportion holds on any screen
          height. The two still sum to the 1.4 the single spacer had, so the
          card above does not move. */}
      {/* Measured: 49px above the poster and 54px below it — near enough equal
          on paper, and plainly lopsided on screen. The number that matters is
          EMPTY space, and above the poster all but 12px of that 49 is taken up
          by the title. Below it, all 54 were empty.

          So this gives its share back to the artwork and keeps only what the
          pile counts need to sit clear of the poster's shadow. `flexGrow` is
          near zero rather than zero so it still yields last rather than first
          on a very short screen, and the floor is what actually sets the gap. */}
      <div style={{ flexGrow: 0.12, minHeight: 14 }} />

      {/* Lowest on the left, rising to the right — the same direction the scale
          runs everywhere else. It read the other way round at first, which put
          the best pile where the eye expects the worst and quietly inverted
          every decision made in the first minute.

          While a drag is live the aimed target lifts and the other two recede,
          so the gesture's outcome is legible BEFORE you commit to it. Nothing
          moves at all when `aimed` is null, which is every moment you are not
          mid-drag — the row is furniture the rest of the time. */}
      {/* How full each pile is, above the button that fills it.
          Rough Cut's whole claim is that you are DEALING a tier into three, and
          until now the only way to know how the deal was going was to finish
          and read the summary. A count over each target makes the split visible
          while it is being made — and it is the cheapest possible readout,
          since the numbers are already in `choices`. */}
      <div className="mx-auto flex w-full max-w-[330px] flex-shrink-0 items-end px-5">
        {(["bottom", "middle", "top"] as const).map((b) => (
          <span
            key={b}
            className="flex-1 text-center text-[10px] font-extrabold tabular-nums"
            style={{ color: filed[b] > 0 ? "var(--gold)" : "var(--dim)", opacity: filed[b] > 0 ? 0.85 : 0.4 }}
          >
            {filed[b]}
          </span>
        ))}
      </div>

      <div data-tour="rc-targets" className="mx-auto flex w-full max-w-[330px] flex-shrink-0 items-center px-5">
        {(
          [
            { bucket: "bottom", label: "Lower", tone: "text-dim" },
            { bucket: "middle", label: "Middle", tone: "text-text-hi" },
            { bucket: "top", label: "Upper", tone: "text-gold" },
          ] as const
        ).map(({ bucket, label, tone }) => (
          <button
            key={bucket}
            ref={(el) => {
              targets.current[bucket] = el;
            }}
            onClick={() => place(bucket)}
            className={`${TARGET} ${aimed === bucket ? `rc-target-armed text-gold` : aimed ? `rc-target-idle ${tone}` : tone}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* The other half of the split above. `minHeight` is the floor: on a short
          screen the weights have almost nothing to divide, and without it the
          targets would slide back down onto Undo — which is the exact collision
          this was moved to avoid. */}
      <div style={{ flexGrow: 0.46, minHeight: 18 }} />

      {/* `pb-2`, not `pb-6`: the nav underneath now owns the bottom edge and
          carries the safe-area padding, so the old clearance would be counted
          twice and squeeze the poster. */}
      <div data-tour="rc-out" className="flex flex-shrink-0 items-center justify-center gap-1 pb-2">
        <button
          onClick={undo}
          disabled={at === 0}
          className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-dim active:scale-95 disabled:opacity-30"
        >
          Undo
        </button>
        {/* In the middle, between taking one back and stopping altogether,
            because that is what it is: neither a decision nor an exit. Disabled
            on the last film, where there is nowhere behind it to go. */}
        <button
          onClick={skip}
          disabled={at >= pool.length - 1}
          className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-dim active:scale-95 disabled:opacity-30"
        >
          Skip
        </button>
        {/* Leaving keeps what you placed. A pass abandoned two-thirds through is
            still two-thirds of a sorted tier, and throwing that away to punish
            an interruption would be the wrong lesson. */}
        <button
          onClick={() => commit(choices)}
          className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-gold/70 active:scale-95"
        >
          Done
        </button>
      </div>

      {nav}
    </main>
  );
}

/**
 * A number that arrives by counting rather than by appearing.
 *
 * Rough Cut's summary reports one figure and it is the whole point of the
 * screen, so it is worth the few hundred milliseconds it takes to read as an
 * accumulation. Nothing else in the app counts up — a total that animates
 * everywhere is a tic, and this is the only place the number IS the reward.
 *
 * Driven by `requestAnimationFrame` rather than a per-tick timer so it costs one
 * frame callback and lands exactly on `to` however long a frame took. Reduced
 * motion skips straight to the answer: a count-up is pure movement, so there is
 * nothing left of it worth keeping once movement is declined.
 */
function CountUp({ to, ms = 520 }: { to: number; ms?: number }) {
  // The decision is taken HERE, above the animating component, rather than as a
  // branch inside its effect. An effect that has to setState on the way out to
  // correct its own initial value is a cascading render — and the whole point of
  // the reduced-motion case is that nothing should move, including the number
  // jumping from 0 to its answer on the second frame. `Ticker` is mounted only
  // when there is genuinely something to animate, so its effect has one job.
  const still =
    to <= 0 ||
    (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  // `tabular-nums` so the width does not jitter as the digits change.
  if (still) return <span className="tabular-nums">{to}</span>;
  // Keyed by the target, so a changed total restarts the count rather than
  // leaving the old one stranded — which is also what lets the effect below
  // depend on nothing.
  return <Ticker key={to} to={to} ms={ms} />;
}

function Ticker({ to, ms }: { to: number; ms: number }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / ms);
      // Ease out, so it sprints and then settles rather than crawling to the end.
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);

  return <span className="tabular-nums">{n}</span>;
}
