"use client";

// "That's the wrong film."
//
// ── Why this has to exist ──────────────────────────────────────────────────
//
// An imported library carries titles and years, not ids, so every film's
// artwork is the result of a GUESS: search TMDb for the title and take
// something. `bestMatch` scores the candidates now and refuses the weak ones,
// which cut the failures a long way — but no scoring makes a guess right every
// time. Remakes, shared titles, a niche film TMDb simply does not hold.
//
// And a wrong poster is worse than no poster, which is the whole reason this is
// worth building. A blank says "not found" and you move on. Artwork says "found
// it", with total confidence, and you believe it — so the app is confidently
// lying about a film you own, on a screen whose job is to help you judge it.
//
// The search endpoint that answers this already existed for logging a film. Its
// own header notes that correcting a bad match is the same missing capability
// wearing a second hat. This is that hat.

import { useEffect, useState } from "react";

import type { SearchHit } from "@/app/api/search/route";
import type { FilmMeta } from "@/lib/meta";
import type { Film } from "@/lib/types";
import { lex } from "@/lib/lexicon";
import { currentMedium } from "@/lib/medium";

export function FixMatch({
  film,
  onFixed,
  onCancel,
}: {
  film: Film;
  /** The chosen film's metadata, to be written over this one's. */
  onFixed: (meta: FilmMeta) => void;
  onCancel: () => void;
}) {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Keyed by the medium-neutral `id`, not `tmdbId`. A book hit has no TMDb id
  // at all, so the old key was `undefined` for every row — which made every row
  // look busy at once the moment one was tapped.
  const [busyId, setBusyId] = useState<string | null>(null);
  const L = lex();

  // Searched on the film's own title, because that is what went wrong — the
  // reader is looking for the film they already named, not a different one. A
  // free-text field would be a second way to log a film rather than a way to
  // correct this one.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(film.title)}&medium=${currentMedium()}`,
        );
        const body = (await res.json()) as { results?: SearchHit[] };
        if (live) setHits(body.results ?? []);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [film.title]);

  const choose = async (hit: SearchHit) => {
    setBusyId(hit.id);
    try {
      // BY ID, never by title again. Searching a second time could only find
      // its way back to the film being corrected.
      const res = await fetch(`/api/film?id=${hit.id}&medium=${currentMedium()}`);
      if (!res.ok) throw new Error("failed");
      onFixed((await res.json()) as FilmMeta);
    } catch {
      setFailed(true);
      setBusyId(null);
    }
  };

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sub font-semibold text-text-hi">Which {L.one} is this?</span>
        <button onClick={onCancel} className="text-label text-dim active:scale-95">
          Cancel
        </button>
      </div>

      {failed && (
        <p className="mb-2 text-label leading-snug text-gold">
          That didn&rsquo;t work. Check your connection and try again.
        </p>
      )}

      {hits === null && !failed && <p className="text-sub text-dim">Looking…</p>}
      {hits?.length === 0 && (
        <p className="text-sub leading-snug text-dim">
          {L.source} has nothing under that title. Nothing to swap it for.
        </p>
      )}

      <div className="flex flex-col gap-1">
        {hits?.map((h) => (
          <button
            key={h.id}
            disabled={busyId !== null}
            onClick={() => void choose(h)}
            className="flex items-center gap-2.5 rounded-lg border border-border px-2 py-1.5 text-left active:scale-[0.99] disabled:opacity-40"
          >
            {/* The poster is the whole point of the choice — this is a visual
                mistake and it is corrected by eye, not by reading titles. */}
            <span
              className="h-[42px] w-[28px] flex-shrink-0 overflow-hidden rounded"
              style={{ background: "var(--surface)" }}
            >
              {h.poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.poster} alt="" className="h-full w-full object-cover" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sub text-text-hi">{h.title}</span>
              <span className="block truncate text-label text-dim">
                {h.year || "—"}
                {h.blurb ? ` · ${h.blurb}` : ""}
              </span>
            </span>
            {busyId === h.id && <span className="text-label text-dim">…</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
