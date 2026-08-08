"use client";

// The long-press card — for settling a "wait, which one is this?" mid-duel.
//
// Poster, year and tagline are local and paint instantly; the TMDb detail
// streams in underneath so the card is never blocked on the network. It also
// carries the one honest statement about how much a placement rests on, which
// lives here rather than on a list row because rows are height-locked.

import { useEffect, useState } from "react";

import { beliefsWhenIdle } from "@/lib/beliefs";
import { loadLog, logFor } from "@/lib/log";
import { fetchMeta, type FilmMeta } from "@/lib/meta";
import { confidenceOf } from "@/lib/shuffle";
import type { Person } from "@/lib/people";
import type { Film } from "@/lib/types";

// Confidence as words rather than a percentage. "0.62" invites the question
// "out of what?", which the number can't answer honestly — it saturates around
// 0.73 in practice (see PLACE_CONFIDENCE), so a percentage would read as though
// the app were permanently only two-thirds sure. Bands say the true thing.
const settledness = (confidence: number): string =>
  confidence >= 0.6 ? "settled" : confidence >= 0.35 ? "taking shape" : "barely tested";

// Long-press card — for settling a "wait, which one is this?" mid-duel. Poster,
// year and tagline are local and paint instantly; the TMDb detail streams in
// underneath so the card is never blocked on the network.
export function FilmInfo({
  film,
  films,
  onClose,
  onPerson,
  onRemove,
}: {
  film: Film;
  films?: Film[];
  onClose: () => void;
  /** Open a director's or actor's filmography. */
  onPerson?: (person: Person) => void;
  /** Take this film out of the library. Absent where removal makes no sense. */
  onRemove?: (film: Film) => void;
}) {
  const [meta, setMeta] = useState<FilmMeta | null>(null);
  // Whether the remove control has been armed by a first tap.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    let live = true;
    fetchMeta(film).then((m) => {
      if (live) setMeta(m);
    });
    return () => {
      live = false;
    };
  }, [film]);

  // How much this film's position actually rests on. `duels` counts questions
  // asked; this says how much the answers settled it — a film that beat things
  // it obviously beats has been asked a lot and told us very little. Shown here
  // rather than on a list row because list rows are height-locked (their heights
  // drive the section spacers and the tier jump) and this sheet is not.
  const [evidence, setEvidence] = useState<{ duels: number; confidence: number } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const log = await loadLog();
      const mine = logFor(log, film.id);
      if (!live) return;
      if (mine.length === 0) {
        setEvidence({ duels: 0, confidence: 0 });
        return;
      }
      const beliefs = await beliefsWhenIdle(films ?? [film], log);
      if (!live) return;
      setEvidence({ duels: mine.length, confidence: confidenceOf(film, beliefs) });
    })();
    return () => {
      live = false;
    };
  }, [film, films]);

  const crew = meta
    ? ([
        ["Director", meta.director],
        ["Written by", meta.writer],
        ["Cinematography", meta.cinematographer],
        ["Music", meta.composer],
      ].filter(([, v]) => v) as [string, string][])
    : [];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center backdrop-blur-sm"
      style={{ background: "rgba(0,0,0,0.7)", padding: "1.5rem" }}
      onClick={onClose}
    >
      <div
        className="w-full overflow-y-auto border border-border"
        style={{ background: "var(--surface)", maxWidth: 300, maxHeight: "88vh", borderRadius: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={film.poster}
            alt={film.title}
            style={{ width: 88, flexShrink: 0, aspectRatio: "2 / 3", objectFit: "cover", borderRadius: 8 }}
          />
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl leading-none tracking-wide text-text-hi">{film.title}</div>
            <div className="mt-1.5 text-[11px] font-bold tracking-[0.1em] text-gold">
              {film.year} · {film.rating}★{meta?.runtime ? ` · ${meta.runtime}m` : ""}
            </div>
            {evidence && (
              <div className="mt-1.5 text-[11px] leading-snug text-dim">
                {evidence.duels === 0
                  ? "Never duelled"
                  : `${evidence.duels} duel${evidence.duels === 1 ? "" : "s"} · ${settledness(evidence.confidence)}`}
              </div>
            )}
            {meta?.genres?.length ? (
              <div className="mt-1.5 text-[11px] leading-snug text-dim">{meta.genres.slice(0, 3).join(" · ")}</div>
            ) : null}
            {film.tagline && (
              <p className="mt-2 font-serif text-[13px] italic leading-snug text-text">“{film.tagline}”</p>
            )}
          </div>
        </div>

        {meta?.synopsis && (
          <p className="px-4 pb-3 text-[12px] leading-relaxed text-text">{meta.synopsis}</p>
        )}

        {/* Names are the way in to a person's filmography, so they are controls
            rather than text. This card was already the one place the app showed
            you who made a film and then gave you nowhere to go with it. */}
        {meta?.cast?.length ? (
          <div className="px-4 pb-3">
            <div className="text-[10px] font-extrabold tracking-[0.12em] text-dim">STARRING</div>
            <div className="mt-1 text-[12px] leading-snug text-text">
              {meta.cast.map((name, i) => (
                <span key={name}>
                  {i > 0 && ", "}
                  <button
                    onClick={() => onPerson?.({ name, role: "actor", count: 0 })}
                    className="underline decoration-border underline-offset-2 active:text-gold"
                  >
                    {name}
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {crew.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            {crew.map(([role, name]) => (
              <div key={role} className="flex justify-between gap-3 py-0.5 text-[12px]">
                <span className="text-dim">{role}</span>
                {/* Only the director opens a filmography: they are the only crew
                    role the library stores per film, so the others have nothing
                    to search on. */}
                {role === "Director" ? (
                  <button
                    onClick={() => onPerson?.({ name, role: "director", count: 0 })}
                    className="text-right text-text-hi underline decoration-border underline-offset-2 active:text-gold"
                  >
                    {name}
                  </button>
                ) : (
                  <span className="text-right text-text-hi">{name}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {!meta && <div className="px-4 pb-4 text-[11px] text-dim">Loading details…</div>}

        {/* Two taps, not one, and no browser confirm().
            This is the only destructive control in the app, it sits on a card
            you open by long-pressing a poster mid-duel, and a mis-tap here costs
            a film and its history. The second tap states the consequence rather
            than asking "are you sure" — the thing worth knowing is that the
            duels it fought stay in the record, because someone about to lose a
            film assumes they lose everything with it. */}
        {onRemove && (
          <div className="border-t border-border px-4 py-3">
            {armed ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onRemove(film);
                    onClose();
                  }}
                  // The app has no danger colour — nothing else in it destroys
                  // anything — so this borrows the wordmark bar's red directly
                  // rather than inventing a token for one button.
                  style={{ color: "#D81E26", borderColor: "#D81E26" }}
                  className="flex-1 rounded-lg border py-2 text-[11px] font-bold active:scale-95"
                >
                  Remove it
                </button>
                <button
                  onClick={() => setArmed(false)}
                  className="flex-1 rounded-lg border border-border py-2 text-[11px] font-bold text-dim active:scale-95"
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                onClick={() => setArmed(true)}
                className="w-full text-center text-[11px] font-semibold text-dim active:scale-95"
              >
                Remove from library
              </button>
            )}
            {armed && (
              <p className="mt-2 text-center text-[10px] leading-snug text-dim">
                Taken out of your list. The duels it fought stay in the record.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Settings sheet — home for the brightness slider (and future settings).
