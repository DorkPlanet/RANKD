"use client";

// Left alone, the list slowly drifts — a showcase of your own taste rather than
// a document sitting still. Any input kills it instantly and it waits for you to
// go quiet again before resuming.
//
// Driven by requestAnimationFrame with a fractional accumulator, not a timer
// stepping whole pixels: the prototype moved 3px every 50ms and visibly
// stuttered. Sub-pixel per frame reads as motion rather than as ticking.

import { useEffect, useRef } from "react";

const IDLE_MS = 2500;

export function useDriftScroll(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  pxPerSec = 20,
) {
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    // Motion nobody asked for is exactly what this setting is for.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let last = 0;
    let carry = 0; // sub-pixel remainder, so 20px/s doesn't round away to zero

    const step = (t: number) => {
      if (!last) last = t;
      const dt = t - last;
      last = t;
      carry += (pxPerSec * dt) / 1000;
      const whole = Math.floor(carry);
      if (whole > 0) {
        carry -= whole;
        const before = el.scrollTop;
        el.scrollTop = before + whole;
        // Hit the end — nothing left to show, so stop rather than spin.
        if (el.scrollTop === before) return stop();
      }
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (raf) return;
      last = 0;
      carry = 0;
      raf = requestAnimationFrame(step);
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const bump = () => {
      stop();
      if (idle.current) clearTimeout(idle.current);
      idle.current = setTimeout(start, IDLE_MS);
    };

    // `wheel` and `touchstart` are passive listeners on purpose — this only ever
    // reads that input happened, so it must never delay the scroll itself.
    const opts = { passive: true } as const;
    el.addEventListener("wheel", bump, opts);
    el.addEventListener("touchstart", bump, opts);
    el.addEventListener("pointerdown", bump, opts);
    window.addEventListener("keydown", bump);

    bump(); // arm the first drift

    return () => {
      stop();
      if (idle.current) clearTimeout(idle.current);
      el.removeEventListener("wheel", bump);
      el.removeEventListener("touchstart", bump);
      el.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [ref, enabled, pxPerSec]);
}
