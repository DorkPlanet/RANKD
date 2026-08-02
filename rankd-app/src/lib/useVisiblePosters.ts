"use client";

// Artwork for a list you can scroll through, fetched for what you're actually
// looking at.
//
// A CSV import brings in no posters, so ~800 of the library has none. Fetching
// them all would be ~100 seconds of continuous requests for films you may never
// scroll past. Instead the viewport decides: rows near the screen enter a queue,
// and whatever you scrolled to last goes to the FRONT of it — a fast flick
// through the library shouldn't leave you staring at placeholders while the
// worker finishes fetching the tier you've already left behind.
//
// `backfillPosters` can't serve this because it walks a fixed array; a queue
// that reorders mid-flight needs its own loop. The fetchMeta cache underneath is
// shared with the duel screen either way, so nothing is fetched twice.

import { useEffect, useRef } from "react";
import type { Film } from "./types";
import { fetchMeta, needsMeta, type FilmMeta } from "./meta";

const GAP_MS = 120; // same pacing as backfillPosters — TMDb rate limits
const NEAR_VIEWPORT = "600px 0px"; // "onscreen and slightly beyond"

export function useVisiblePosters(
  root: React.RefObject<HTMLElement | null>,
  films: Film[],
  onFound: (id: string, meta: FilmMeta) => void,
) {
  const queue = useRef<string[]>([]);
  const running = useRef(false);
  const done = useRef(new Set<string>());
  // Kept in refs so the observer and worker never need re-creating when the
  // library changes underneath them — a re-created observer loses every row it
  // was already watching.
  const byId = useRef(new Map<string, Film>());
  const found = useRef(onFound);
  // Synced after render rather than during it: a ref written mid-render is torn
  // if React re-renders without committing.
  useEffect(() => {
    found.current = onFound;
    byId.current = new Map(films.map((f) => [f.id, f]));
  });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let stopped = false;

    const pump = async () => {
      if (running.current) return;
      running.current = true;
      while (!stopped) {
        const id = queue.current.shift();
        if (!id) break;
        const film = byId.current.get(id);
        if (!film || !needsMeta(film) || done.current.has(id)) continue;
        done.current.add(id); // never ask twice, even if it comes back empty
        const meta = await fetchMeta(film);
        if (stopped) break;
        if (meta.poster || meta.director || meta.cast?.length) found.current(id, meta);
        await new Promise((r) => setTimeout(r, GAP_MS));
      }
      running.current = false;
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset.filmId;
          const film = byId.current.get(id ?? "");
          if (!id || done.current.has(id) || !film || !needsMeta(film)) continue;
          // Front, not back: the newest thing on screen is the thing you're
          // looking at right now.
          queue.current = [id, ...queue.current.filter((q) => q !== id)];
        }
        void pump();
      },
      { root: el, rootMargin: NEAR_VIEWPORT },
    );

    // Re-observed whenever rows are added or removed (search, tier jump), since
    // an IntersectionObserver only knows about the nodes it was handed.
    const observeAll = () => {
      el.querySelectorAll<HTMLElement>("[data-film-id]").forEach((n) => io.observe(n));
    };
    observeAll();
    const mo = new MutationObserver(observeAll);
    mo.observe(el, { childList: true, subtree: true });

    return () => {
      stopped = true;
      io.disconnect();
      mo.disconnect();
    };
  }, [root]);
}
