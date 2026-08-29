"use client";

// The film strip under the arena — the map of where you are.
//
// It is the only place the whole pile is visible at once, and the only way to
// aim the next duel at a film other than the one directly above. Scrubbing it
// commits nothing: it moves the crosshair, not the pile, so the strip holds
// still under the thumb while you look around.

import { useEffect, useRef } from "react";

import type { Film } from "@/lib/types";
import { LockIcon } from "./Icons";
import { lex } from "@/lib/lexicon";

export function Rolodex({
  lowToHigh,
  locked,
  contenderId,
  challengerId,
  onScrub,
  open,
  onToggle,
}: {
  lowToHigh: Film[];
  locked: { film: Film; rank: number }[];
  contenderId: string;
  challengerId: string;
  onScrub: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef(0);
  const userScrolling = useRef(false);
  const prevPileKey = useRef("");
  const prevContenderId = useRef("");
  const pullFrom = useRef<number | null>(null);
  const pileKey = lowToHigh.map((f) => f.id).join(",");

  const syncHighlight = () => {
    const track = trackRef.current;
    if (!track) return null;
    const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    const cells = track.querySelectorAll<HTMLElement>("[data-fid]");
    cells.forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    });
    cells.forEach((el) => el.classList.toggle("rol-centered", el === best));
    return (best as HTMLElement | null)?.dataset.fid ?? null;
  };

  const centerFilm = (id: string) => {
    const track = trackRef.current;
    if (!track) return;
    const el = track.querySelector<HTMLElement>(`[data-fid="${id}"]`);
    if (el) track.scrollLeft = el.offsetLeft - track.clientWidth / 2 + el.clientWidth / 2;
  };

  // Re-centre the challenger when the PILE changes (flick / confirm / contender
  // win) OR the contender changes — tapping the challenger makes IT the new
  // contender without reordering the pile, so watching pileKey alone misses it.
  // Never re-centre on a plain scrub (challengerId-only change) so the strip
  // stays put under the thumb.
  useEffect(() => {
    if (prevPileKey.current === pileKey && prevContenderId.current === contenderId) return;
    prevPileKey.current = pileKey;
    prevContenderId.current = contenderId;
    requestAnimationFrame(() => {
      centerFilm(challengerId);
      syncHighlight();
    });
  }, [pileKey, contenderId, challengerId]);

  useEffect(() => {
    syncHighlight();
  });

  // Re-opening mounts a fresh, unscrolled track, but prevPileKey still holds the
  // key from before it was folded away — so clear it or the centring effect
  // decides nothing has changed and leaves the strip parked at the far left.
  useEffect(() => {
    if (!open) return;
    prevPileKey.current = "";
    requestAnimationFrame(() => {
      centerFilm(challengerId);
      syncHighlight();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const markUserScroll = () => (userScrolling.current = true);
  const handleScroll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(syncHighlight);
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      const id = syncHighlight();
      // Only commit a scrub for a user-driven scroll — a programmatic reorder
      // (flick / confirm) also fires scroll events and must NOT override the challenger.
      // Any film but the contender is a legal target: scrubbing up leaps past
      // films it clears, scrubbing down drops it below a weaker one.
      if (userScrolling.current && id && id !== challengerId) onScrub(id);
      userScrolling.current = false;
    }, 100);
  };

  return (
    // flex-shrink-0 so the drawer keeps the height it asked for and the arena
    // above gives way instead. Without it both fought for the same space and
    // neither yielded, pushing the nav off the bottom of the screen.
    <div className="relative w-full flex-shrink-0 pb-1">
      {/* A grabber, not a chevron — the strip pulls open and closed like a
          drawer, so drag it or tap it. */}
      <button
        onClick={onToggle}
        onPointerDown={(e) => (pullFrom.current = e.clientY)}
        onPointerUp={(e) => {
          const from = pullFrom.current;
          pullFrom.current = null;
          if (from == null) return;
          const dy = e.clientY - from;
          // A deliberate pull wins over the tap; anything smaller is a tap.
          if (Math.abs(dy) > 12) {
            e.preventDefault();
            if (dy > 0 === open) onToggle(); // pull down to close, up to open
          }
        }}
        aria-label={`${open ? "Hide" : "Show"} the ${lex().one} strip`}
        aria-expanded={open}
        data-tour="strip"
        className="mx-auto flex h-7 w-20 items-center justify-center"
        style={{ touchAction: "none" }}
      >
        <span
          className="block rounded-full"
          style={{
            width: 34,
            height: 4,
            background: open ? "var(--border)" : "color-mix(in srgb, var(--gold) 55%, transparent)",
            transition: "background 0.25s var(--ease)",
          }}
        />
      </button>
      {/* pt-7: the centred poster scales 1.16x upward from its bottom edge, and
          overflow-x:auto forces overflow-y to auto — without headroom the track
          slices the top off it and its glow. */}
      {/* Stays mounted and animates its row from 0fr to 1fr, so it slides rather
          than snaps — and keeps its scroll position while folded away. */}
      <div
        className="grid"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.3s var(--ease)" }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
        <div
          ref={trackRef}
          onScroll={handleScroll}
          onPointerDown={markUserScroll}
          onTouchStart={markUserScroll}
          onWheel={markUserScroll}
          className="rol-track flex items-end gap-2.5 overflow-x-auto pb-2 pt-7 px-[calc(50%-25px)] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [scroll-snap-type:x_proximity] [&::-webkit-scrollbar]:hidden"
        >
        {lowToHigh.map((f) =>
          f.id === contenderId ? (
            // The climbing film sits IN the strip at its real position, so it
            // occupies layout space — overlaying it caused it to stack on top of
            // whichever cell happened to scroll under it. No data-fid: it must
            // never be pickable as its own challenger.
            <div key={f.id} className="flex w-[50px] flex-shrink-0 flex-col items-center gap-1">
              <div
                className="w-full overflow-hidden rounded-md"
                style={{ aspectRatio: "2 / 3", boxShadow: "0 0 0 2px var(--gold), 0 0 16px color-mix(in srgb, var(--gold) 70%, transparent)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.poster} alt="" className="h-full w-full object-cover" draggable={false} />
              </div>
              <span className="font-serif text-label font-bold tracking-wide text-gold">YOU</span>
            </div>
          ) : (
            // Every film in the pile is a live opponent: a climb rules nothing
            // out, so there is nothing to grey.
            <div
              key={f.id}
              data-fid={f.id}
              className="rol-cell flex w-[50px] flex-shrink-0 flex-col items-center gap-1 [scroll-snap-align:center]"
            >
              <div className="rol-poster w-full overflow-hidden rounded-md bg-surface" style={{ aspectRatio: "2 / 3" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.poster} alt="" className="h-full w-full object-cover" draggable={false} />
              </div>
              <span className="text-label font-bold tracking-wide text-dim/70">UN-RNKD</span>
            </div>
          ),
        )}
        {/* Locked films tail the strip — they outrank the whole pile, so the
            shelf you're building stays in view. They carry no data-fid, so they
            can't be scrubbed to; re-opening them is a later feature. */}
        {locked.map(({ film }) => (
          <div key={film.id} className="flex w-[50px] flex-shrink-0 flex-col items-center gap-1">
            {/* A padlock, not a number. `confirmed` is per-tier, so a rank shown
                here would read as "#1 of everything" when it only means "#1 of
                this tier" — and a 5★ film already outranks the whole 4★ shelf.
                The strip's job is "this is settled"; the real number belongs
                where it can say "#2 overall, #1 in 4★" (overallRank exists for
                that). */}
            <span className="text-gold"><LockIcon /></span>
            <div
              className="w-full overflow-hidden rounded-md bg-surface"
              style={{ aspectRatio: "2 / 3", boxShadow: "0 0 0 1.5px var(--gold)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={film.poster} alt="" className="h-full w-full object-cover" draggable={false} />
            </div>
            {/* Matches the UN-RNKD label height so every poster shares a baseline */}
            <span className="text-label leading-none text-transparent">.</span>
          </div>
        ))}
        </div>
        </div>
      </div>
    </div>
  );
}

// Bookends: the tier's own boundary marks. The strip only ever holds one star
// tier, so these are the walls it runs between — and they'll read as real
// dividers once more than one tier is in play.
