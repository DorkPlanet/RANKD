"use client";

// Three designs, one swipe, download whichever you like.
//
// ── Why scroll-snap and not a pointer-drag ─────────────────────────────────
//
// `PosterCard` implements its flick by hand because it needs continuous
// feedback during a drag mapped to a semantic decision, on a full-screen element
// with nothing scrolling behind it. This is the opposite case: a pager sitting
// inside a vertically scrolling screen. A hand-rolled version would have to
// arbitrate its own axis against the page's scroll and fight iOS momentum, which
// is exactly the fiddly part `PosterCard`'s axis test exists to handle — and it
// only has to get it right in one, simpler, context.
//
// So the browser does it: `scroll-snap-type: x mandatory`. Mandatory rather than
// the `proximity` the Rolodex uses — that one has a hundred items and free
// scrolling between them is the point, where a three-card pager must always land
// on a card. Momentum, rubber-banding, trackpads and keyboards come free.
//
// ── Why images and not canvases ────────────────────────────────────────────
//
// Each design is drawn once, to a JPEG, and shown as an <img> on an object URL.
// Three live 1920x1080 canvases would hold ~24MB of backing store for as long as
// this screen exists, and Safari's canvas ceiling on a phone is real. A JPEG is
// a few hundred KB and the browser can drop its decode whenever it likes.
//
// It also means the preview IS the file: what you swipe past is the exact image
// the download hands you, not a smaller re-render that might differ.

import { useCallback, useEffect, useRef, useState } from "react";
import { designName, designs, renderCard } from "@/lib/card/render";
import { cardFilename, shareCard } from "@/lib/card/share";
import type { CardData, CardDesign } from "@/lib/card/types";
import { PrimaryButton } from "./ui";

type Made = { blob: Blob; url: string };

export function CardPicker({ data }: { data: CardData }) {
  const track = useRef<HTMLDivElement>(null);
  const [made, setMade] = useState<Partial<Record<CardDesign, Made>>>({});
  const [active, setActive] = useState<CardDesign>("classic");
  const [failed, setFailed] = useState<Partial<Record<CardDesign, true>>>({});
  const [sent, setSent] = useState<CardDesign | null>(null);

  // Which designs have been ASKED for, as opposed to finished. Written only
  // from `drawOne`, never during render — a ref assigned mid-render is torn if
  // React re-renders without committing, which is why `useVisiblePosters` syncs
  // its refs in an effect rather than in the body.
  const started = useRef(new Set<CardDesign>());
  // A separate mirror for cleanup, synced after render the same way.
  const madeRef = useRef(made);
  useEffect(() => {
    madeRef.current = made;
  });

  const drawOne = useCallback(
    async (design: CardDesign) => {
      if (started.current.has(design)) return;
      started.current.add(design);
      try {
        const blob = await renderCard(design, data);
        const url = URL.createObjectURL(blob);
        setMade((m) => {
          // A second render finishing for the same design would strand the first
          // URL — revoke rather than leak.
          if (m[design]) {
            URL.revokeObjectURL(url);
            return m;
          }
          return { ...m, [design]: { blob, url } };
        });
      } catch {
        started.current.delete(design); // a failure may be retried
        setFailed((x) => ({ ...x, [design]: true }));
      }
    },
    [data],
  );

  // The visible one first, then the others once it has landed. Posters are
  // memoised inside the canvas helpers, so designs two and three cost only their
  // draw and encode — usually fast enough to beat the swipe.
  useEffect(() => {
    let stopped = false;
    void (async () => {
      await drawOne("classic");
      for (const d of designs) {
        if (stopped) return;
        await drawOne(d);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [drawOne]);

  // Revoke on unmount only — not on every change, which would pull the URL out
  // from under an <img> that is still showing it.
  useEffect(
    () => () => {
      Object.values(madeRef.current).forEach((m) => m && URL.revokeObjectURL(m.url));
    },
    [],
  );

  // Which card is on screen. Three fixed-width panels make a threshold enough;
  // the Rolodex needs geometry only because it has a hundred variable ones.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.design as CardDesign);
        }
      },
      { root: el, threshold: 0.6 },
    );
    el.querySelectorAll<HTMLElement>("[data-design]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  const download = async () => {
    const m = made[active];
    if (!m) return;
    await shareCard(m.blob, cardFilename(data.title, active));
    setSent(active);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={track}
        className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {designs.map((design) => {
          const m = made[design];
          return (
            <div
              key={design}
              data-design={design}
              // `snap-always` is load-bearing, not decoration: without
              // `scroll-snap-stop: always` a fast flick keeps its momentum
              // straight past a snap point, so on a three-card pager the middle
              // card is unreachable — you can only ever get to the two ends.
              // Mandatory snapping alone does not prevent skipping; this does.
              className="w-full flex-shrink-0 snap-center snap-always"
            >
              <div
                className="w-full overflow-hidden rounded-xl border border-border"
                style={{ aspectRatio: "16 / 9" }}
              >
                {m ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={`${designName[design]} card`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sub text-dim">
                    {failed[design] ? "Couldn't draw this one" : "Drawing…"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Which of the three you're looking at, and how many there are. Dots
          rather than a label alone: the label says what it is, the dots say
          that there are others to swipe to. */}
      <div className="flex items-center justify-center gap-2">
        {designs.map((d) => (
          <span
            key={d}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: d === active ? 16 : 6,
              background: d === active ? "var(--gold)" : "var(--border)",
            }}
          />
        ))}
        <span className="ml-1.5 text-sub font-semibold text-dim">{designName[active]}</span>
      </div>

      <PrimaryButton wide onClick={download} disabled={!made[active]}>
        {sent === active ? `Saved the ${designName[active]} card ✓` : `Download the ${designName[active]} card`}
      </PrimaryButton>
    </div>
  );
}
