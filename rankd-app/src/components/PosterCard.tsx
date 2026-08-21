"use client";

// The two posters, and the trace they leave.
//
// This is the app's most physical surface: a tap picks, a hold explains, a flick
// asserts. It carries no idea of piles, tiers or sessions — it is handed two
// films and reports what the thumb did — which is exactly why Fast Shuffle,
// which has none of that machinery, can reuse it unchanged.
//
// The animation helpers live here too. They exist because a poster that is
// simply REPLACED reads as a glitch, while one seen leaving reads as a
// consequence. Each spawns a clone that outlives the re-render, so the film can
// finish its exit after React has already moved on.

import { useRef } from "react";

import type { Film } from "@/lib/types";
import { PosterArt } from "./PosterArt";

// Degrees each card leans. The climbing card tilts one way, the challenger the
// other; clones have to match or they land crooked against the real poster.
export const TILT = 2;

// Spawn a copy of a poster that outlives the re-render, so a film can be seen
// leaving rather than simply being replaced. Positioned from the element's
// CENTRE and its untransformed size — a rotated element's bounding rect is the
// axis-aligned box around it, which is bigger than the poster itself.
/**
 * Play a clone's animation and ALWAYS take the clone away afterwards.
 *
 * ── Why this is not just `addEventListener("finish")` ──────────────────────
 *
 * Every one of these clones is a `position: fixed` div holding a full-size
 * poster, and a poster is a decoded bitmap — roughly a megabyte and a half of
 * graphics memory that does NOT appear in `performance.memory.usedJSHeapSize`,
 * because that measures the JS heap and nothing else.
 *
 * All four call sites used to remove the clone on the `finish` event alone. That
 * event is not guaranteed: an animation on a backgrounded tab does not run, a
 * cancelled animation fires `cancel` instead, and a page frozen or discarded
 * mid-flight never fires either. Any of those leaks the clone permanently, with
 * its bitmap.
 *
 * One leak is invisible. A few hundred would be hundreds of megabytes of
 * graphics memory held by a tab, which is enough to take a phone down rather
 * than just the page.
 *
 * **This was NOT the cause of the Fast Shuffle lockup**, and the correction is
 * worth keeping. It was written as the fix for it and the next reading disproved
 * it outright: the DOM sat at 121 nodes during a freeze, against 680 in King of
 * the Hill, which was working fine. Nothing was accumulating. The real cause was
 * an unpaced backfill rewriting the whole library once per film — see
 * `backfillPosters` in `lib/meta.ts`.
 *
 * Kept anyway, because removal that depends on an event which is not guaranteed
 * to fire is wrong on its own terms. It just does not explain anything that has
 * actually happened.
 *
 * Removal is unconditional now: `finish`, `cancel`, and a hard timer past the
 * animation's own length. `remove()` on an already-removed node does nothing, so
 * firing three times is free.
 */
function playOnce(clone: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): void {
  const done = () => clone.remove();
  try {
    const anim = clone.animate(keyframes, options);
    anim.addEventListener("finish", done);
    anim.addEventListener("cancel", done);
  } catch {
    // No Web Animations, or animating threw. The clone must still go.
  }
  const ms = typeof options.duration === "number" ? options.duration : 0;
  const delay = typeof options.delay === "number" ? options.delay : 0;
  // Generous, so it never races a real finish and never becomes the thing that
  // makes an animation look cut short.
  setTimeout(done, ms + delay + 600);
}

function posterClone(el: HTMLElement, poster: string, ring: string): HTMLElement {
  const r = el.getBoundingClientRect();
  const w = el.offsetWidth || r.width;
  const h = el.offsetHeight || r.height;
  const left = r.left + r.width / 2 - w / 2;
  const top = r.top + r.height / 2 - h / 2;
  const clone = document.createElement("div");
  clone.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${w}px;height:${h}px;border-radius:12px;overflow:hidden;z-index:9999;pointer-events:none;box-shadow:${ring}`;
  clone.innerHTML = `<img src="${poster}" style="width:100%;height:100%;object-fit:cover;display:block"/>`;
  document.body.appendChild(clone);
  return clone;
}

// A stable phase in 0..1 for one film, so its float never keeps time with
// anything else on screen.
//
// Derived from the id rather than randomised, because the poster remounts as
// artwork arrives and a fresh random number each time would make the card jump
// mid-bob. Same film, same phase, every render.
//
// `seed` lets one film ask for two unrelated phases — its poster and its title
// must not rise together, which is exactly what the old fixed classes did.
// `Math.imul`, not `*`: a 32-bit multiply overflows to a float and silently
// drops the low bits, which washed the seed out — the first version handed a
// poster and its title 0.336 and 0.331 and they bobbed together anyway. The
// final avalanche is what stops two nearby inputs landing on nearby phases.
function floatPhase(id: string, seed: number): number {
  let h = 2166136261 ^ Math.imul(seed, 0x9e3779b9);
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Inline float timing for one element.
 *
 * ── Why the two cards are ANTIPHASE rather than merely different ───────────
 *
 * The first version gave each element an independent phase and a jittered
 * duration. That is "usually different", not "never the same": two films whose
 * ids happen to hash close together still bob almost in step, and it comes up
 * often enough to notice because the pair changes every duel.
 *
 * So the period is shared and the right-hand card is offset half a cycle. One
 * rises exactly as the other falls, every time, for every pair.
 *
 * The phase is hashed from the PAIR's id, not each card's own — that is the part
 * that took two goes. Adding half a cycle to a DIFFERENT film's hash does not
 * produce antiphase, it produces another arbitrary phase; measured on screen the
 * two cards came out 0.9s and 0.4s apart on a 6.5s period, which is nearly in
 * step. Both cards have to start from one number for the offset to mean
 * anything. Which point of the cycle the pair sits at still varies per duel, so
 * it never looks mechanical.
 *
 * The delay is NEGATIVE on purpose: it starts the animation part-way through
 * rather than making the card sit still and wait for its turn.
 */
export function floatStyle(pairId: string, seed: number, base: number, right: boolean): React.CSSProperties {
  const phase = (floatPhase(pairId, seed) + (right ? 0.5 : 0)) % 1;
  return { animationDelay: `${-phase * base}s`, animationDuration: `${base}s` };
}

// Centre point of an element, which rotation about the centre leaves unmoved.
function centreOf(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Flick: the poster carries on along the throw, so it leaves the way it was
// thrown rather than always arcing to the same spot regardless of the gesture.
function flyPosterAway(el: HTMLElement, poster: string, vx: number, vy: number, tilt: number) {
  const mag = Math.hypot(vx, vy) || 1;
  const ux = vx / mag;
  const uy = vy / mag;
  const travel = Math.max(window.innerWidth, window.innerHeight);
  const spin = tilt + ux * 22; // start from the card's lean, then lean into the throw
  const clone = posterClone(el, poster, "0 0 0 3px #e7b53e,0 16px 44px rgba(231,181,62,.5)");
  playOnce(clone, [
        { transform: `translate(0,0) rotate(${tilt}deg) scale(1)`, opacity: 1, offset: 0 },
        {
          transform: `translate(${ux * travel * 0.3}px,${uy * travel * 0.3}px) rotate(${tilt + (spin - tilt) * 0.4}deg) scale(0.94)`,
          opacity: 1,
          offset: 0.35,
        },
        {
          transform: `translate(${ux * travel}px,${uy * travel}px) rotate(${spin}deg) scale(0.45)`,
          opacity: 0,
          offset: 1,
        },
      ], { duration: 520, easing: "cubic-bezier(.2,.7,.3,1)" });
}

// The beaten challenger sinks and fades, revealing its replacement underneath,
// rather than the two cutting straight from one film to the next.
// `tilt` because a clone that does not match its card's lean lands crooked
// against it. Defaults to the challenger's lean, which is every caller but the
// left-hand card in Fast Shuffle.
export function fadeLoserOut(el: HTMLElement, poster: string, tilt: number = TILT) {
  const clone = posterClone(el, poster, "0 8px 26px rgba(0,0,0,0.55)");
  playOnce(clone, [
        { transform: `translate(0,0) rotate(${tilt}deg) scale(1)`, opacity: 1 },
        { transform: `translate(0,18px) rotate(${tilt}deg) scale(0.94)`, opacity: 0 },
      ], { duration: 320, easing: "cubic-bezier(.4,0,1,1)" });
}

// A `liftWinner` lived here — the chosen card swelling and fading in place, to
// answer the fact that in Fast Shuffle only the LOSER animates. It was rejected
// on sight: a card that performs where it stands reads as a notification, not as
// a choice landing. Deleted rather than left dead. If the asymmetry is worth
// solving, the candidate is the surviving card settling into the freed space,
// not the winner putting on a show.

// The challenger sits on the right, but winning makes it the climbing film on
// the left. Without this it simply appears over there the instant state updates
// — the film you just chose jumps the screen. Slide a clone across so the pick
// visibly takes its new seat.
/**
 * Send a poster to a control, so a choice is seen going where it was filed.
 *
 * Rough Cut's version of `flyPosterAway`. The difference is the destination:
 * a flick throws a film off the edge because there is nowhere in particular for
 * it to go, whereas here there are exactly three places and the whole mechanic
 * is which one you picked. Aiming at the button's measured centre — rather than
 * a fixed left/down/right — means the animation says the same thing the layout
 * does, and keeps saying it if the targets are ever moved or resized.
 *
 * It shrinks to nearly nothing rather than fading at full size: the card is
 * joining a pile, and something that recedes reads as filed away while something
 * that dissolves reads as discarded.
 */
export function flyPosterTo(fromEl: HTMLElement, toEl: HTMLElement, poster: string) {
  const a = centreOf(fromEl);
  const b = centreOf(toEl);
  const clone = posterClone(fromEl, poster, "0 10px 30px rgba(0,0,0,0.55)");
  playOnce(clone, [
        { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
        // Lifts slightly on the way, so the path is an arc rather than a slide.
        {
          transform: `translate(${(b.x - a.x) * 0.55}px,${(b.y - a.y) * 0.55 - 10}px) scale(0.62)`,
          opacity: 0.85,
          offset: 0.55,
        },
        { transform: `translate(${b.x - a.x}px,${b.y - a.y}px) scale(0.12)`, opacity: 0, offset: 1 },
      ], { duration: 380, easing: "cubic-bezier(.35,.8,.4,1)" });
}

export function flyPosterAcross(fromImg: HTMLElement, toImg: HTMLElement, poster: string) {
  const a = centreOf(fromImg);
  const b = centreOf(toImg);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clone = posterClone(fromImg, poster, "0 0 0 3px #e7b53e,0 14px 38px rgba(0,0,0,.6)");
  playOnce(clone, [
        // Leaves at the challenger's lean and arrives at the climber's, so it
        // settles flush against the card it is replacing rather than crooked.
        { transform: `translate(0,0) rotate(${TILT}deg) scale(1)`, offset: 0 },
        { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 14}px) rotate(0deg) scale(1.04)`, offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) rotate(${-TILT}deg) scale(1)`, offset: 1 },
      ], { duration: 340, easing: "cubic-bezier(.4,0,.2,1)" });
}

export function PosterCard({
  film,
  badge,
  pick,
  side,
  pairId,
  onPick,
  onFlick,
  onSink,
  onInfo,
}: {
  film: Film;
  badge: string;
  /** The climbing film: gold ring, and it leans left unless `side` says otherwise. */
  pick?: boolean;
  /**
   * Which way the card leans, independently of whether it is the pick.
   *
   * The two were the same thing until Fast Shuffle needed them apart. There
   * neither film is a pick — they are peers, and neither wears the gold — so
   * both cards fell through to the same lean and the pair sat parallel instead
   * of mirrored, which is the one thing that made that mode look unlike the
   * climb. Leaning is about the PAIR; the gold is about the state.
   */
  side?: "left" | "right";
  /**
   * Identifies the PAIR, so both cards can float from one shared phase and sit
   * exactly half a cycle apart. Pass the same value to both — the left film's id
   * is the obvious choice. Falls back to this card's own film, which is correct
   * for anything rendering a single poster.
   */
  pairId?: string;
  onPick: (id: string) => void;
  /** Send it to the top of the pile. Absent in a mode with no pile — see the
   *  throw handler for why that is not the same as a no-op. */
  onFlick?: (id: string) => void;
  /** Send it to the bottom. Absent for the same reason. */
  onSink?: (id: string) => void;
  onInfo: (film: Film) => void;
}) {
  const pair = pairId ?? film.id;
  const tilt = side ? (side === "left" ? -TILT : TILT) : pick ? -TILT : TILT;
  const start = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    held.current = false;
    // Capture the pointer so an upward drag off the poster still reports its
    // release here — without this the flick is lost the moment you leave the card.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — capture is a best-effort enhancement
    }
    holdTimer.current = setTimeout(() => {
      held.current = true; // swallows the tap on release, so holding never picks
      onInfo(film);
    }, 450);
  };

  // Any real movement means they're flicking or scrolling, not holding.
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    if (Math.abs(e.clientX - s.x) > 8 || Math.abs(e.clientY - s.y) > 8) cancelHold();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    cancelHold();
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (held.current) {
      held.current = false;
      return; // the hold already opened the info card
    }
    const dy = e.clientY - s.y;
    const dx = e.clientX - s.x;
    if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx)) {
      // vertical throw → up sends it to the top of the pile, down to the bottom
      //
      // ── Only when there is somewhere for it to GO ────────────────────────
      //
      // Fast Shuffle passes no handler: it has no pile, so there is no top and
      // no bottom to throw a film to. It used to pass `noop`, and the effect
      // was worse than ignoring the gesture — the poster played the full
      // fly-away animation and then nothing happened, so the app appeared to
      // accept a throw and then quietly refused it.
      //
      // Springing back says "not here" honestly. Falling through to `onPick`
      // was the other option and is worse: a deliberate throw is not a vote,
      // and turning one into a pick would answer a duel the user did not.
      const land = dy < 0 ? onFlick : onSink;
      if (!land) return;
      const img = e.currentTarget.querySelector("img");
      if (img) flyPosterAway(img, film.poster ?? "", dx, dy, tilt);
      setTimeout(() => land(film.id), 170);
    } else {
      onPick(film.id); // tap = pick winner
    }
  };

  const onPointerCancel = () => {
    cancelHold();
    start.current = null;
  };

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()} // holding must not raise the OS menu
      // Where the tour's first three steps point. Both cards carry it and the
      // tour takes the first — this surface is one control with three gestures,
      // so which of the pair is framed does not matter.
      data-tour="card"
      style={{ touchAction: "none" }}
      className="group relative flex h-full w-[46%] max-w-[180px] min-h-0 flex-col items-center transition-transform active:scale-95"
    >
      {/* A fixed two-line box, whatever the title's length. Sized to the text
          rather than sized by it, so a film whose name wraps can never sit its
          poster lower than its opponent's — the two cards always share a top and
          a bottom edge, and so do their badges. */}
      <span
        className="mb-3 flex w-full flex-shrink-0 items-end justify-center text-center font-display font-normal leading-[1.15] tracking-[0.02em] text-text-hi line-clamp-2 float-title"
        style={{
          // Seed 2, so a title never shares a phase with its own poster — which
          // is precisely what the old float-a/float-c pairing did.
          // 4.1s matches `.float-title` in globals.css — see the note there.
          ...floatStyle(pair, 2, 4.1, tilt > 0),
          // Long titles step down instead of being silently cut off at two
          // lines — the whole name is the point, it's what you're choosing between.
          fontSize: film.title.length > 44 ? 22 : film.title.length > 28 ? 26 : 32,
          minHeight: "2.3em",
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
        }}
      >
        {film.title}
      </span>
      {/* Wrapper carries the float so the badge drifts with its poster. The
          poster itself keeps overflow-hidden for its rounded corners, so the
          badge has to hang off this wrapper to straddle the bottom edge. */}
      {/* The tilt lives on the wrapper, not the poster, so the badge rotates with
          the card and sits square to its bottom edge — a level badge on a tilted
          card reads as off-centre even when it is mathematically centred. */}
      {/* min-h-0 + flex-1 lets the poster take whatever height is left rather
          than demanding width × 1.5, so a short screen shrinks the artwork
          instead of driving the column past the bottom of the viewport. */}
      <div
        className="relative flex min-h-0 w-full flex-1 justify-center float-poster"
        // 5.2s matches `.float-poster` in globals.css — see the note there.
        style={{ rotate: `${tilt}deg`, ...floatStyle(pair, 1, 5.2, tilt > 0) }}
      >
        {/* `containerType: inline-size` is what lets the placeholder size its
            own type off the card rather than off the viewport — these are 46%
            of the screen each in a duel and nearly full width in Rough Cut, and
            one fixed font size cannot serve both. */}
        <div
          className="h-full overflow-hidden rounded-xl"
          style={{
            aspectRatio: "2 / 3",
            containerType: "inline-size",
            background: "var(--surface)",
            boxShadow: pick
              ? "0 0 0 3px var(--gold), 0 10px 30px color-mix(in srgb, var(--gold) 35%, transparent)"
              : "0 8px 26px rgba(0,0,0,0.55)",
          }}
        >
          <PosterArt film={film} />
        </div>
        {/* No badge, no pill. Fast Shuffle passes "" — its films are peers with
            nothing to label — and this drew the capsule anyway, so both posters
            carried an empty bar straddling their bottom edge. An empty container
            is not a neutral default; it is a visible object that says nothing. */}
        {badge && (
          <span
            className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-[0.07em]"
            style={
              pick
                ? { color: "#1c1405", background: "var(--gold)" }
                : { color: "var(--dim)", background: "var(--surface)", border: "1px solid var(--border)" }
            }
          >
            {badge}
          </span>
        )}
      </div>
    </button>
  );
}

// Sits between the arena and the strip. Until now nothing on screen confirmed a
// tap had registered — you picked, the posters changed, and that was it. Keyed
// on the timestamp so it replays even when the same film wins twice running.
// Beaten films read in a cool silver-blue — clearly not the gold of a winner,
// but still legible rather than faded out.
export const LOSER = "#9db4d6";

export function LastResult({ results }: { results: { won: string; lost: string; at: number; drew?: boolean }[] }) {
  // No fixed height: with one, padding only squeezed the text inside the box and
  // the row still butted straight onto the strip's handle, so the line read as
  // that control's label.
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 pb-6 pt-2">
      {results.length === 0 ? (
        // Holds the question until the first pick answers it.
        <span className="text-[13px] leading-none text-dim">Which do you prefer?</span>
      ) : (
        results.map((r, i) => (
          // Keyed on its own timestamp, so React moves the same element down a
          // row rather than rebuilding it — which is what lets it shrink and
          // fade on the way instead of snapping.
          <span
            key={r.at}
            className={`result-line leading-none ${i === 0 ? "result-in" : ""}`}
            style={{ fontSize: i === 0 ? 13 : 11, opacity: i === 0 ? 1 : 0.55 }}
          >
            {/* A draw reads as neither film winning — same weight both sides,
                because that is exactly what was said. */}
            <span className={r.drew ? "text-dim" : "font-semibold text-gold"}>{r.won}</span>
            <span className="text-dim">{r.drew ? " ≈ " : " beat "}</span>
            <span style={r.drew ? undefined : { color: LOSER }} className={r.drew ? "text-dim" : undefined}>
              {r.lost}
            </span>
            {r.drew && <span className="text-dim"> · too close</span>}
          </span>
        ))
      )}
    </div>
  );
}
