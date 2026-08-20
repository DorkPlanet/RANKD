"use client";

// The long-press card — for settling a "wait, which one is this?" mid-duel.
//
// Poster, year and tagline are local and paint instantly; the TMDb detail
// streams in underneath so the card is never blocked on the network. It also
// carries the one honest statement about how much a placement rests on, which
// lives here rather than on a list row because rows are height-locked.

import { useEffect, useMemo, useState } from "react";

import { beliefsWhenIdle, seedOf } from "@/lib/beliefs";
import { loadLog, logFor } from "@/lib/log";
import { fetchMeta, type FilmMeta } from "@/lib/meta";
import { FixMatch } from "./FixMatch";
import { LockIcon } from "./Icons";
import { confidenceOf } from "@/lib/shuffle";
import { isHard } from "@/lib/lock";
import { rankMap } from "@/lib/list";
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
  onFixMatch,
}: {
  film: Film;
  films?: Film[];
  onClose: () => void;
  /** Open a director's or actor's filmography. */
  onPerson?: (person: Person) => void;
  /** Take this film out of the library. Absent where removal makes no sense. */
  onRemove?: (film: Film) => void;
  /** Replace this film's artwork and credits with another TMDb film's. */
  onFixMatch?: (film: Film, meta: FilmMeta) => void;
}) {
  const [meta, setMeta] = useState<FilmMeta | null>(null);
  // Whether the remove control has been armed by a first tap.
  const [armed, setArmed] = useState(false);
  const [fixing, setFixing] = useState(false);
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
  const [evidence, setEvidence] = useState<{
    duels: number;
    confidence: number;
    /** Where the evidence alone would put it, ignoring what you pinned. */
    appRank?: number;
  } | null>(null);
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
      const pool = films ?? [film];
      const beliefs = await beliefsWhenIdle(pool, log);
      if (!live) return;
      // The app's own answer, kept separate from yours.
      //
      // A hard lock pins `score` and the model may never touch it, but the
      // evidence keeps forming an opinion underneath regardless — `beliefs` is
      // fitted from the log, not from the locks. So a film you placed carries
      // BOTH a position you chose and a position the duels imply, and until now
      // only one of them was ever visible.
      //
      // ── Why this is tier-scoped, and why the obvious version was wrong ──────
      //
      // The first version sorted the whole library by belief mean. That prints a
      // number the app would never act on. Beliefs live on the star scale where
      // `PRIOR_SPREAD` is deliberately wide — "a soft starting point a handful of
      // duels can move well past, not a cap" (`bayes.ts`) — so a much-duelled
      // film really can out-mean a whole tier above it. But `shuffle.ts` projects
      // beliefs back into the score bands by RE-SPREADING A TIER IN BELIEF ORDER,
      // so a band is never escaped. Cross-tier means are not calibrated against
      // each other; nothing ever compares a 1.5★ with a 4★.
      //
      // Shipped briefly and caught on a phone: a 1.5★ film read "app says #391".
      //
      // So order within the tier by belief, then offset by everything rated
      // higher — the same shape `shuffle.ts` would produce. The number stays
      // comparable with the list's because both count every film.
      const above = pool.filter((f) => f.rating > film.rating).length;
      const meanOf = (f: Film) => beliefs.get(f.id)?.mean ?? seedOf(f);
      const within = pool
        .filter((f) => f.rating === film.rating)
        .sort((a, b) => meanOf(b) - meanOf(a) || a.title.localeCompare(b.title))
        .findIndex((f) => f.id === film.id);
      setEvidence({
        duels: mine.length,
        confidence: confidenceOf(film, beliefs),
        appRank: within >= 0 ? above + within + 1 : undefined,
      });
    })();
    return () => {
      live = false;
    };
  }, [film, films]);

  // The list's own numbering, not a second opinion about it. A guest is not in
  // the library, so it has no rank and correctly reads as unranked.
  const rank = useMemo(() => (films ? rankMap(films).get(film.id) : undefined), [films, film.id]);

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
            {/* Where it sits, and WHO PUT IT THERE.
                The list draws that difference in colour alone — gold and bold
                for a hard lock, dim for a soft one — and carries the words in a
                `title` attribute, which is a hover tooltip. There is no hover on
                a phone, so on the only device this app is really used on the
                distinction the whole product rests on had no label anywhere.
                It also made Settings' "Drop the N Rankd placed" unreadable to
                anyone who never learned the app places films at all.

                Here rather than on a list row for the same reason the evidence
                line is: rows are height-locked. `rankMap` rather than
                `overallRank` so this number cannot disagree with the list. */}
            {/* Two claims, so two lines. Run together they wrapped mid-phrase on
                a phone and read as one confused sentence. */}
            <div className="mt-1.5 text-[11px] leading-snug">
              {rank === undefined ? (
                <div className="text-dim">Not ranked yet</div>
              ) : isHard(film) ? (
                <>
                  {/* A padlock rather than the words. It already means "settled,
                      and you settled it" on the film strip (`Rolodex`), so
                      reusing it teaches one symbol twice instead of inventing a
                      second vocabulary for the same idea. The gold does the
                      rest, and it is the same gold the list row uses. */}
                  <div className="flex items-center gap-1.5 text-gold">
                    <LockIcon />
                    <span>#{rank}</span>
                  </div>
                  {/* Both answers, one per line. Only worth printing for a film
                      YOU pinned: a soft lock's position IS Rankd's opinion, so
                      repeating it there would be the same number twice. */}
                  {evidence?.appRank !== undefined && (
                    <div className="text-dim">Rankd says #{evidence.appRank}</div>
                  )}
                </>
              ) : (
                <div className="text-dim">Rankd placed it at #{rank}</div>
              )}
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
        {/* Above Remove, because it is the gentler answer to the same feeling.
            Somebody looking at a poster that is not their film reaches for the
            nearest control, and if the only one is "Remove from library" they
            will delete a film they own to get rid of artwork that is wrong. */}
        {onFixMatch &&
          (fixing ? (
            <FixMatch
              film={film}
              onCancel={() => setFixing(false)}
              onFixed={(m) => {
                onFixMatch(film, m);
                setFixing(false);
                // Closed on purpose. The card is showing the old film's
                // credits, cast and synopsis from a fetch keyed on the old
                // match, and reopening is one tap — where watching half of it
                // refresh in place would be its own small lie.
                onClose();
              }}
            />
          ) : (
            <div className="border-t border-border px-4 py-3">
              <button
                onClick={() => setFixing(true)}
                className="w-full text-center text-[11px] font-semibold text-dim active:scale-95"
              >
                Wrong film?
              </button>
            </div>
          ))}

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
