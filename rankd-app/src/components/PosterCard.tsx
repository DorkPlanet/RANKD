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

// Degrees each card leans. The climbing card tilts one way, the challenger the
// other; clones have to match or they land crooked against the real poster.
export const TILT = 2;

// Spawn a copy of a poster that outlives the re-render, so a film can be seen
// leaving rather than simply being replaced. Positioned from the element's
// CENTRE and its untransformed size — a rotated element's bounding rect is the
// axis-aligned box around it, which is bigger than the poster itself.
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
  clone
    .animate(
      [
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
      ],
      { duration: 520, easing: "cubic-bezier(.2,.7,.3,1)" },
    )
    .addEventListener("finish", () => clone.remove());
}

// The beaten challenger sinks and fades, revealing its replacement underneath,
// rather than the two cutting straight from one film to the next.
export function fadeLoserOut(el: HTMLElement, poster: string) {
  const clone = posterClone(el, poster, "0 8px 26px rgba(0,0,0,0.55)");
  clone
    .animate(
      [
        { transform: `translate(0,0) rotate(${TILT}deg) scale(1)`, opacity: 1 },
        { transform: `translate(0,18px) rotate(${TILT}deg) scale(0.94)`, opacity: 0 },
      ],
      { duration: 320, easing: "cubic-bezier(.4,0,1,1)" },
    )
    .addEventListener("finish", () => clone.remove());
}

// The challenger sits on the right, but winning makes it the climbing film on
// the left. Without this it simply appears over there the instant state updates
// — the film you just chose jumps the screen. Slide a clone across so the pick
// visibly takes its new seat.
export function flyPosterAcross(fromImg: HTMLElement, toImg: HTMLElement, poster: string) {
  const a = centreOf(fromImg);
  const b = centreOf(toImg);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clone = posterClone(fromImg, poster, "0 0 0 3px #e7b53e,0 14px 38px rgba(0,0,0,.6)");
  clone
    .animate(
      [
        // Leaves at the challenger's lean and arrives at the climber's, so it
        // settles flush against the card it is replacing rather than crooked.
        { transform: `translate(0,0) rotate(${TILT}deg) scale(1)`, offset: 0 },
        { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 14}px) rotate(0deg) scale(1.04)`, offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) rotate(${-TILT}deg) scale(1)`, offset: 1 },
      ],
      { duration: 340, easing: "cubic-bezier(.4,0,.2,1)" },
    )
    .addEventListener("finish", () => clone.remove());
}

export function PosterCard({
  film,
  badge,
  pick,
  onPick,
  onFlick,
  onSink,
  onInfo,
}: {
  film: Film;
  badge: string;
  pick?: boolean;
  onPick: (id: string) => void;
  onFlick: (id: string) => void;
  onSink: (id: string) => void;
  onInfo: (film: Film) => void;
}) {
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
      const img = e.currentTarget.querySelector("img");
      if (img) flyPosterAway(img, film.poster ?? "", dx, dy, pick ? -TILT : TILT);
      const land = dy < 0 ? onFlick : onSink;
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
      style={{ touchAction: "none" }}
      className="group relative flex h-full w-[46%] max-w-[180px] min-h-0 flex-col items-center transition-transform active:scale-95"
    >
      {/* A fixed two-line box, whatever the title's length. Sized to the text
          rather than sized by it, so a film whose name wraps can never sit its
          poster lower than its opponent's — the two cards always share a top and
          a bottom edge, and so do their badges. */}
      <span
        className={`mb-3 flex w-full flex-shrink-0 items-end justify-center text-center font-display font-normal leading-[1.15] tracking-[0.02em] text-text-hi line-clamp-2 ${pick ? "float-c" : "float-d"}`}
        style={{
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
        className={`relative flex min-h-0 w-full flex-1 justify-center ${pick ? "float-a" : "float-b"}`}
        style={{ rotate: `${pick ? -TILT : TILT}deg` }}
      >
        <div
          className="h-full overflow-hidden rounded-xl"
          style={{
            aspectRatio: "2 / 3",
            boxShadow: pick
              ? "0 0 0 3px var(--gold), 0 10px 30px color-mix(in srgb, var(--gold) 35%, transparent)"
              : "0 8px 26px rgba(0,0,0,0.55)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={film.poster} alt={film.title} className="h-full w-full object-cover" draggable={false} />
        </div>
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
        <span className="text-[13px] leading-none text-dim">Which film do you prefer?</span>
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
