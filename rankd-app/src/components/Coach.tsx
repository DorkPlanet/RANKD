"use client";

// The coach marks themselves. See lib/tour.ts for what this is and is not.
//
// The hole is ONE transparent box over the target with an enormous spread
// `box-shadow` doing the darkening — no SVG mask, no four-rectangle jigsaw, and
// no surprises when the target sits near an edge.
//
// Its position is WRITTEN to the DOM, not held in state. The coordinates come
// from `getBoundingClientRect` on a live element, so they are a reading of the
// DOM rather than a fact React owns; state would mean measure → setState →
// re-render on every step, resize and scroll. The layout effect also runs before
// paint, so the spotlight is never seen at the previous step's coordinates.
//
// ── Ghost clicks ───────────────────────────────────────────────────────────
//
// A browser fires a synthesised `click` ~300ms after a finger lifts, at the
// coordinates it left from, and this is exactly that shape: a full-screen layer
// mounting under a finger that has just tapped. Without the arming delay one tap
// falls through and advances two steps. **No synthetic test can catch it** —
// scripted clicks fire once, immediately. Test by tapping inside 400ms.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { resolveSteps, type TourStep } from "@/lib/tour";
import { PrimaryButton, QuietButton } from "./ui";

/** Matches `Sheet`'s backdrop arming delay, and for the same reason. */
const ARM_MS = 400;
/** Breathing room around the target, so the mark frames it rather than clipping it. */
const PAD = 8;
/** Between the spotlight and the caption. */
const GAP = 16;

const find = (target: string): Element | null =>
  document.querySelector(`[data-tour="${target}"]`);

export default function Coach({
  steps: all,
  onDone,
}: {
  steps: readonly TourStep[];
  onDone: () => void;
}) {
  // Resolved once, on mount. The steps must not be recomputed as the tour runs:
  // the strip step points at a control the strip's own state can hide, the
  // UN-RNKD divider disappears when a tier is finished, and a list that shrank
  // underneath the reader would renumber "3 of 5" mid-tour.
  //
  // This resolves during RENDER, which is why AppShell must never mount this in
  // the same commit as a screen change: it would measure the screen being left.
  const [steps] = useState<TourStep[]>(() => resolveSteps((t) => !!find(t), all));
  const [i, setI] = useState(0);

  // When the current step appeared. A timestamp rather than an `armed` flag: the
  // flag needed clearing on every step, which is a synchronous setState inside an
  // effect — a cascading render to express something no render depends on.
  // Elapsed time answers the only question being asked, at the moment it is asked.
  //
  // Stamped in the layout effect below rather than seeded here: a clock read
  // during render is impure, and this one would be re-read on every re-render,
  // quietly re-arming the controls each time something else on the page changed.
  const stepAt = useRef(0);
  const armed = () => Date.now() - stepAt.current >= ARM_MS;

  const holeRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // The first placement must not animate — the element starts at 0,0 and would
  // be seen flying in from the corner. Every placement after it should.
  const placed = useRef(false);

  const step = steps[i];

  useLayoutEffect(() => {
    if (!step) return;
    // Runs on mount and on every step change — the two moments a tap could fall
    // through from the previous one.
    stepAt.current = Date.now();

    const place = () => {
      const el = find(step.target);
      const hole = holeRef.current;
      const card = cardRef.current;
      if (!el || !hole || !card) return;

      const r = el.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(el).borderRadius) || 12;

      // Clamped to the viewport. The bottom nav sits flush against the screen
      // edge, so its padded box runs 8px off the bottom and the gold ring came
      // out as a three-sided bracket — the one step where the mark has to look
      // like a frame is the one where it did not.
      const top = Math.max(r.top - PAD, 0);
      hole.style.top = `${top}px`;
      hole.style.left = `${Math.max(r.left - PAD, 0)}px`;
      hole.style.width = `${Math.min(r.width + PAD * 2, window.innerWidth - Math.max(r.left - PAD, 0))}px`;
      hole.style.height = `${Math.min(r.height + PAD * 2, window.innerHeight - top)}px`;
      hole.style.borderRadius = `${radius + PAD}px`;

      // Above the target when it sits low, below when it sits high, so the
      // caption never covers the thing it is about.
      //
      // The caption's height is MEASURED, not estimated. A constant was close
      // enough to look right and wrong enough to matter: the copy sets the
      // height, the longest step ran ~12px past the guess, and the gap under the
      // bottom-nav step collapsed from 16px to 4. Any future edit to a step's
      // body would have silently reopened it.
      const cardH = card.offsetHeight;
      const below = r.top + r.height / 2 < window.innerHeight / 2;
      card.style.top = below
        ? `${Math.min(r.bottom + PAD + GAP, window.innerHeight - cardH - GAP)}px`
        : `${Math.max(r.top - PAD - cardH - GAP, GAP)}px`;

      if (!placed.current) {
        placed.current = true;
        // Next frame, so the browser has committed the first position before the
        // transition is allowed to observe a change.
        requestAnimationFrame(() => hole.classList.add("coach-hole"));
      }
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step]);

  // Nothing on screen to point at — finish rather than render an empty scrim. A
  // tour with no steps is not a tour, and it must still count as having run so
  // it does not try again on the next open.
  //
  // Deferred by a tick because `onDone` sets state in the parent, and doing that
  // synchronously from an effect is a cascading render: the parent would re-render
  // mid-commit purely to unmount a child that has just told it there was nothing
  // to do.
  useEffect(() => {
    if (steps.length > 0) return;
    const t = setTimeout(onDone, 0);
    return () => clearTimeout(t);
  }, [steps.length, onDone]);

  if (!step) return null;

  const last = i === steps.length - 1;
  const advance = () => {
    if (!armed()) return;
    if (last) return onDone();
    setI((n) => n + 1); // the layout effect re-stamps `stepAt`
  };

  return (
    <div
      className="fixed inset-0 z-[70]"
      // Swallows every tap that is not on a control below. `touchAction: none`
      // stops the page scrolling behind a layer meant to hold you still.
      style={{ touchAction: "none" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* The hole. `pointerEvents: none` makes it a window rather than a button —
          tapping the highlighted control must do nothing, like everywhere else
          on this layer. */}
      <div
        ref={holeRef}
        aria-hidden
        className="absolute"
        style={{
          pointerEvents: "none",
          boxShadow: "0 0 0 9999px var(--scrim), inset 0 0 0 1.5px var(--gold)",
        }}
      />

      <div
        ref={cardRef}
        // Keyed by step so the card re-enters on each one. Without it React
        // reuses the element, the animation is already spent, and the caption
        // swaps its text in place while the spotlight glides away underneath.
        key={i}
        role="dialog"
        aria-live="polite"
        aria-label={`${step.title}. Step ${i + 1} of ${steps.length}.`}
        className="coach-card absolute left-1/2 w-[300px] rounded-2xl border border-border px-5 py-4"
        style={{ background: "var(--surface)" }}
      >
        <span className="block font-display text-title leading-none tracking-wide text-gold">
          {step.title}
        </span>
        <p className="mt-2.5 text-sub leading-relaxed text-text">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-label font-bold tracking-[0.18em] text-dim tabular-nums">
            {i + 1} / {steps.length}
          </span>
          <span className="flex items-center gap-2">
            {/* Skip is always available and always ends the whole thing. A
                tutorial you cannot leave on its first screen is a wall. */}
            {!last && (
              <QuietButton onClick={() => armed() && onDone()}>Skip</QuietButton>
            )}
            <PrimaryButton onClick={advance}>{last ? "Got it" : "Next"}</PrimaryButton>
          </span>
        </div>
      </div>
    </div>
  );
}
