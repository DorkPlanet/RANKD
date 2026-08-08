"use client";

// One person's films — yours in order, and the ones you never logged.
//
// Two things the app could not do before. It could not answer "what do I think
// of Michael Mann", because every ordering it produced stopped at a star band;
// and it could not answer "what have I missed", because a library can only
// describe itself.
//
// The order here crosses tiers. It is read from the Bayesian belief means rather
// than from `score`, which is the only number in the app that spans the whole
// library — so a 3★ can sit above a 4★ here without a single band being broken
// anywhere else. See the note at the top of lib/people.ts.
//
// PROVISIONAL LOOK — the shape is settled, the styling has had no design pass.

import { useEffect, useState } from "react";
import { beliefsFor } from "@/lib/beliefs";
import { filmsBy, mergeCredits, rankByBelief, type CreditRow, type Person } from "@/lib/people";
import { isHard } from "@/lib/lock";
import { seedScore, starsFor } from "@/lib/tiers";
import { slugId } from "@/lib/importCsv";
import { Sheet } from "./ui";
import { loadLog, type Judgement } from "@/lib/log";
import type { Film } from "@/lib/types";

export function PersonSheet({
  person,
  films,
  onClose,
  onRank,
  onInfo,
  onAddFilm,
}: {
  person: Person;
  films: Film[];
  onClose: () => void;
  /** Start a cross-tier run over this person's films. */
  onRank: (person: Person) => void;
  onInfo: (film: Film) => void;
  onAddFilm: (film: Film) => void;
}) {
  const [showMissing, setShowMissing] = useState(false);
  const [credits, setCredits] = useState<CreditRow[] | null>(null);
  // Derived, not stored: "asked for the filmography and haven't got it yet" is
  // exactly these two facts, and a third piece of state saying the same thing is
  // one more thing that can disagree with them.
  const loading = showMissing && !credits;

  // Read on open, every open.
  //
  // The first version took the log as a prop from AppShell, which loads it once
  // at startup — so ranking a director's films and coming straight back showed
  // the order from before you ranked them. The ordering here is the entire point
  // of the screen, and a stale one is worse than none: it looks like the duels
  // did nothing. Owning the read means it cannot go stale, at the cost of one
  // localStorage hit per open.
  const [log, setLog] = useState<Judgement[] | null>(null);
  useEffect(() => {
    let stale = false;
    void loadLog().then((l) => {
      if (!stale) setLog(l);
    });
    return () => {
      stale = true;
    };
  }, [person.name, person.role]);

  const mine = rankByBelief(filmsBy(films, person), beliefsFor(films, log ?? []));

  // Only fetched when asked for. The filmography is a network call about films
  // you do not own, so it should not be the price of opening the page.
  useEffect(() => {
    if (!showMissing || credits) return;
    let stale = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/person?name=${encodeURIComponent(person.name)}&role=${person.role}`,
        );
        const data = await res.json();
        if (!stale) setCredits(mergeCredits(mine, data.credits ?? []));
      } catch {
        // An empty list rather than a null, so the screen stops saying it is
        // still looking and says it found nothing — which is the truth.
        if (!stale) setCredits([]);
      }
    })();
    return () => {
      stale = true;
    };
    // `mine` is derived from films and would re-run this on every judgement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMissing, person.name, person.role]);

  const missing = credits?.filter((c) => !c.film) ?? [];

  return (
    <Sheet title={person.name} onClose={onClose}>
      <p className="mb-3 text-[11px] uppercase tracking-wider text-dim">
        {person.role === "director" ? "Director" : "Actor"} · {mine.length} in your list
        {showMissing && credits ? ` · ${missing.length} not logged` : ""}
      </p>

      {/* Ranked, and honest that the ranking ignores stars — otherwise a 3★ above
          a 4★ reads as a bug rather than as the point. */}
      <div className="flex flex-col gap-1">
        {mine.map((f, i) => (
          <button
            key={f.id}
            onClick={() => onInfo(f)}
            className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-left active:scale-[0.99]"
          >
            <span
              className={`w-6 flex-shrink-0 text-center font-serif text-sm ${isHard(f) ? "font-bold text-gold" : "text-dim"}`}
            >
              {i + 1}
            </span>
            {f.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.poster} alt="" className="w-9 flex-shrink-0 rounded" style={{ aspectRatio: "2/3" }} />
            ) : (
              <span className="w-9 flex-shrink-0 rounded bg-border" style={{ aspectRatio: "2/3" }} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text-hi">{f.title}</span>
              <span className="block truncate text-[11px] text-dim">
                {f.year} · {starsFor(f.rating)}
              </span>
            </span>
          </button>
        ))}
        {mine.length === 0 && (
          <p className="px-1 py-3 text-center text-[11px] text-dim">
            Nothing of theirs in your list yet.
          </p>
        )}
      </div>

      {mine.length >= 2 && (
        <button
          onClick={() => onRank(person)}
          className="mt-3 w-full rounded-full py-3 text-sm font-extrabold tracking-wide active:scale-95"
          style={{ color: "#1c1405", background: "var(--gold)" }}
        >
          Rank these {mine.length}
        </button>
      )}

      {/* The gap. This is the reason to be on this screen at all — a list of only
          what you already have answers a question you could already answer. */}
      <button
        onClick={() => setShowMissing((v) => !v)}
        className="mt-3 w-full rounded-xl border border-border py-2.5 text-xs font-bold text-dim active:scale-95"
      >
        {showMissing ? "Hide what I haven't logged" : "Show what I haven't logged"}
      </button>

      {showMissing && (
        <div className="mt-2 flex flex-col gap-1">
          {loading && <p className="px-1 py-3 text-center text-[11px] text-dim">Looking them up…</p>}
          {!loading && missing.length === 0 && credits && (
            <p className="px-1 py-3 text-center text-[11px] text-dim">
              You&rsquo;ve logged everything of theirs we could find.
            </p>
          )}
          {missing.map((c) => (
            <button
              key={`${c.title}-${c.year}`}
              // Logging from here keeps the star rating as the only decision, the
              // same as the nav's Log a film — the film is already identified, so
              // asking again would be asking twice.
              onClick={() => onAddFilm({
                id: slugId(c.title, c.year),
                title: c.title,
                year: c.year,
                rating: 3,
                score: seedScore(3),
                poster: c.poster,
              })}
              className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-left opacity-70 active:scale-[0.99]"
            >
              {c.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.poster} alt="" className="w-9 flex-shrink-0 rounded" style={{ aspectRatio: "2/3" }} />
              ) : (
                <span className="w-9 flex-shrink-0 rounded bg-border" style={{ aspectRatio: "2/3" }} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-hi">{c.title}</span>
                <span className="block truncate text-[11px] text-dim">{c.year} · tap to log at ★★★</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
