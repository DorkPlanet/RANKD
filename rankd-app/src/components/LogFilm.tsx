"use client";

// Log a film you have just watched.
//
// Until now the only way into the library was a Letterboxd CSV, which means the
// app could rank your past and had nothing to say about tonight. This is the
// other door: search, pick the right film, give it stars, and it lands in the
// library unplaced — ready to be ranked like anything else, rather than being
// dropped somewhere by a number nobody chose.
//
// It deliberately stops at the star rating. Placing it inside the tier is the
// climb's job, and doing it here would mean inventing a position from a single
// opinion, which is the one thing the whole app exists not to do.
//
// PROVISIONAL LOOK — the shape is settled, the styling has had no design pass.

import { useEffect, useRef, useState } from "react";
import { ORDERED_TIERS, seedScore, starsFor, type Rating } from "@/lib/tiers";
import { slugId } from "@/lib/importCsv";
import { Sheet } from "./ui";
import type { Film } from "@/lib/types";

interface SearchHit {
  tmdbId: number;
  title: string;
  year: string;
  poster?: string;
  blurb?: string;
}

/** Long enough that typing a title is one request, short enough to feel live. */
const DEBOUNCE_MS = 320;

export function LogFilm({
  films,
  onAdd,
  onClose,
}: {
  /** The current library — used only to spot a film that is already in it. */
  films: Film[];
  onAdd: (film: Film) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<SearchHit | null>(null);

  // Every keystroke supersedes the one before it. Without the sequence check a
  // slow early request can land after a fast later one and overwrite the results
  // for a query the user has already moved on from — the classic version of this
  // bug, and the one that makes search feel haunted rather than broken.
  // Everything that should happen the instant you type happens in the change
  // handler below, not here. An effect that sets state synchronously on its own
  // dependency is a cascading render, and the states in question — "the field is
  // empty", "a request is in flight" — are consequences of the keystroke, so
  // they belong to the event that caused them. The effect owns only the fetch.
  const seq = useRef(0);
  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (mine !== seq.current) return;
        setHits(data.results ?? []);
        setFailed(!res.ok);
      } catch {
        if (mine === seq.current) setFailed(true);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const add = (hit: SearchHit, rating: Rating) => {
    onAdd({
      id: slugId(hit.title, hit.year),
      title: hit.title,
      year: hit.year,
      rating,
      // The tier's midpoint, exactly as an import seeds one. It is a starting
      // position, not a verdict — the film shows no rank until it is placed.
      score: seedScore(rating),
      poster: hit.poster,
    });
    onClose();
  };

  return (
    <Sheet title={chosen ? "How was it?" : "Log a film"} onClose={onClose}>
      {chosen ? (
        <RatingStep hit={chosen} onPick={(r) => add(chosen, r)} onBack={() => setChosen(null)} />
      ) : (
        <>
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              // Clearing the field must clear the results with it — otherwise
              // an empty box sits above the last query's films, which reads as
              // the app having ignored you.
              if (!v.trim()) {
                seq.current++; // orphan any request still in flight
                setHits([]);
                setBusy(false);
                setFailed(false);
              } else {
                setBusy(true);
              }
            }}
            placeholder="Search for a film"
            className="w-full rounded-xl border border-border bg-transparent px-4 py-3 text-sm text-text-hi outline-none placeholder:text-dim"
          />

          <div className="mt-3 flex flex-col gap-1">
            {hits.map((h) => {
              // Already in the library is worth saying before the tap, not after
              // — adding it again would silently overwrite the rating it already
              // has, which is exactly the thing you would not expect.
              const have = films.find((f) => f.id === slugId(h.title, h.year));
              return (
                <button
                  key={h.tmdbId}
                  onClick={() => setChosen(h)}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-left active:scale-[0.99]"
                >
                  {h.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.poster} alt="" className="w-10 flex-shrink-0 rounded" style={{ aspectRatio: "2/3" }} />
                  ) : (
                    <span className="w-10 flex-shrink-0 rounded bg-border" style={{ aspectRatio: "2/3" }} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-hi">{h.title}</span>
                    <span className="block truncate text-[11px] text-dim">
                      {h.year}
                      {have ? ` · already in your list at ${starsFor(have.rating)}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}

            {/* One line, four states, so the panel never sits blank and unexplained. */}
            {q.trim() !== "" && hits.length === 0 && (
              <p className="px-1 py-3 text-center text-[11px] text-dim">
                {busy ? "Searching…" : failed ? "Couldn't reach the film database." : "Nothing found."}
              </p>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

// Stars only. The position inside the tier is what the climb is for, and picking
// it here would mean inventing an order from one film's worth of opinion.
function RatingStep({
  hit,
  onPick,
  onBack,
}: {
  hit: SearchHit;
  onPick: (r: Rating) => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        {hit.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hit.poster} alt="" className="w-14 flex-shrink-0 rounded-md" style={{ aspectRatio: "2/3" }} />
        ) : (
          <span className="w-14 flex-shrink-0 rounded-md bg-border" style={{ aspectRatio: "2/3" }} />
        )}
        <span className="min-w-0">
          <span className="block font-display text-lg leading-tight text-text-hi">{hit.title}</span>
          <span className="block text-[11px] text-dim">{hit.year}</span>
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {ORDERED_TIERS.map((t) => (
          <button
            key={t}
            onClick={() => onPick(t)}
            className="rounded-xl border border-border px-4 py-2.5 text-left text-sm text-gold active:scale-[0.99]"
          >
            {starsFor(t)}
          </button>
        ))}
      </div>

      <button onClick={onBack} className="mt-3 w-full text-center text-xs font-semibold text-dim active:scale-95">
        ‹ Back
      </button>
    </>
  );
}
