"use client";

// The long-press card — for settling a "wait, which one is this?" mid-duel.
//
// Poster, year and tagline are local and paint instantly; the TMDb detail
// streams in underneath so the card is never blocked on the network. It also
// carries the one honest statement about how much a placement rests on, which
// lives here rather than on a list row because rows are height-locked.

import { cleanTags } from "@/lib/tags";
import { useEffect, useMemo, useState } from "react";

import { beliefsWhenIdle, seedOf } from "@/lib/beliefs";
import { loadLog, logFor } from "@/lib/log";
import { fetchMeta, type FilmMeta } from "@/lib/meta";
import { FixMatch } from "./FixMatch";
import { CoverPicker } from "./CoverPicker";
import { LockIcon } from "./Icons";
import { confidenceOf, settledness } from "@/lib/shuffle";
import { isHard } from "@/lib/lock";
import { rankMap } from "@/lib/list";
import type { Person } from "@/lib/people";
import type { Film } from "@/lib/types";
import { Eyebrow } from "./ui";
import { lex } from "@/lib/lexicon";

// ── Why this is a percentage now, when it deliberately was not ─────────────
//
// It used to be three words — "barely tested" / "taking shape" / "settled" —
// and the reasoning was that a percentage could not be honest: confidence
// saturates, so a bar would sit at two-thirds forever and read as an app that
// is permanently unsure.
//
// That reasoning measured the number against a maximum that does not exist.
// The user's call: **if a bar sits at 80% forever then 80% is what finished
// looks like** — we make the app, so we set the goal. `settledness` in
// `shuffle.ts` scales between the confidence a film has when it earns its
// provisional number and the MEASURED ceiling, so it starts empty when the
// number appears and genuinely reaches 100%.
//
// The words are kept alongside it. A percentage says how far along; a word says
// what that means, and the pair reads better than either alone.
const settledWord = (t: number): string =>
  t >= 1 ? "fully settled" : t >= 0.5 ? "taking shape" : "barely tested";

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
  onPickCover,
  onRefine,
  onTags,
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
  /**
   * Keep the record and swap only the artwork.
   *
   * Absent for a medium whose artwork is canonical — see `CoverPicker` for why
   * that is films — so the control does not appear where there is nothing to
   * choose between.
   */
  onPickCover?: (film: Film, poster: string) => void;
  /**
   * Duel this one film for a run of `duels` answers.
   *
   * `movePlaced` is only ever true for a film the user LOCKED and then chose to
   * let move — see the sheet below. It is passed explicitly rather than inferred
   * because it is the one thing here that can undo a decision somebody made.
   */
  onRefine?: (film: Film, duels: number, movePlaced: boolean) => void;
  /** Open the tag sheet for this film. Absent where editing makes no sense. */
  onTags?: (film: Film) => void;
}) {
  const tags = cleanTags(film.tags);
  const [meta, setMeta] = useState<FilmMeta | null>(null);
  const [refining, setRefining] = useState(false);
  // Off by default, and deliberately not remembered between opens: letting a
  // locked film move is a decision about THIS run, not a preference.
  const [letMove, setLetMove] = useState(false);
  // Whether the remove control has been armed by a first tap.
  const [armed, setArmed] = useState(false);
  const [fixing, setFixing] = useState(false);
  // Its own flag rather than a second value on `fixing`. The two sheets answer
  // different questions and only one may be open, which a pair of booleans
  // states badly — but the alternative is a union type for two mutually
  // exclusive panels in a card that has no other modes, and each opener closes
  // the other, so the rule holds where it is written.
  const [picking, setPicking] = useState(false);
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
        [lex().Maker, meta.director],
        ["Written by", meta.writer],
        ["Cinematography", meta.cinematographer],
        ["Music", meta.composer],
      ].filter(([, v]) => v) as [string, string][])
    : [];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center backdrop-blur-sm"
      style={{ background: "rgba(0, 0, 0, 0.7)", padding: "1.5rem" }}
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
            <div className="font-display text-title leading-none tracking-wide text-text-hi">{film.title}</div>
            <div className="mt-1.5 text-label font-bold tracking-[0.14em] text-gold">
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
            <div className="mt-1.5 text-sub leading-snug">
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
                // The same blue the list legend and the row numerals use for
                // this state, and four words rather than seven. It is a label
                // for a state, not a sentence about a mode.
                <div className="text-accent">Shuffled at #{rank}</div>
              )}
            </div>
            {evidence && (
              <div className="mt-1.5 text-sub leading-snug text-dim">
                {evidence.duels === 0
                  ? "Never duelled"
                  : `${evidence.duels} duel${evidence.duels === 1 ? "" : "s"} · ${Math.round(
                      settledness(evidence.confidence) * 100,
                    )}% ${settledWord(settledness(evidence.confidence))}`}
              </div>
            )}
            {meta?.genres?.length ? (
              <div className="mt-1.5 text-sub leading-snug text-dim">{meta.genres.slice(0, 3).join(" · ")}</div>
            ) : null}
            {film.tagline && (
              <p className="mt-2 font-serif text-sub italic leading-snug text-text">“{film.tagline}”</p>
            )}
          </div>
        </div>

        {meta?.synopsis && (
          <p className="px-4 pb-3 text-sub leading-relaxed text-text">{meta.synopsis}</p>
        )}

        {/* ── Your reasons, and the way to change them ────────────────────
            Offered at the lock and edited here, which is the only other place
            somebody is already looking at one film and thinking about it. A
            film with nothing said about it shows the invitation instead, so
            the feature is discoverable without a tour. */}
        {onTags && (
          <div className="px-4 pb-3">
            {tags.length > 0 || film.note || film.scene ? (
              <button onClick={() => onTags(film)} className="block w-full text-left active:opacity-70">
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full px-2.5 py-1 text-label tracking-[0.14em] text-gold"
                      style={{ background: "var(--wash)" }}
                    >
                      {tag.toUpperCase()}
                    </span>
                  ))}
                </div>
                {/* The scene first, because it is the concrete one: it names a
                    moment, where the line below is a thought about the film.
                    Marked when it gives something away, so the person who wrote
                    it can see the warning their readers will get. */}
                {film.scene && (
                  <p className="mt-2 text-sub leading-snug text-text">
                    {film.spoiler && (
                      <span className="mr-1.5 text-label font-extrabold tracking-[0.14em] text-dim">
                        SPOILER
                      </span>
                    )}
                    {film.scene}
                  </p>
                )}
                {film.note && (
                  <p className="mt-2 font-serif text-sub italic leading-snug text-text">{film.note}</p>
                )}
              </button>
            ) : (
              <button onClick={() => onTags(film)} className="active:opacity-70">
                  <Eyebrow>Say why it is here</Eyebrow>
                </button>
            )}
          </div>
        )}

        {/* Names are the way in to a person's filmography, so they are controls
            rather than text. This card was already the one place the app showed
            you who made a film and then gave you nowhere to go with it. */}
        {meta?.cast?.length ? (
          <div className="px-4 pb-3">
            <Eyebrow>Starring</Eyebrow>
            <div className="mt-1 text-sub leading-snug text-text">
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
              <div key={role} className="flex justify-between gap-3 py-0.5 text-sub">
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

        {!meta && <div className="px-4 pb-4 text-sub text-dim">Loading details…</div>}

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
        {/* ── Right book, wrong cover ────────────────────────────────────
            Above "Wrong book?" because it is the gentler answer to the same
            feeling, exactly as that control sits above "Remove". Somebody
            looking at artwork that is not the edition they own reaches for the
            nearest thing, and if the nearest thing REPLACES THE RECORD they
            will retire their book from the metadata queue to fix a picture. */}
        {onPickCover &&
          !fixing &&
          (picking ? (
            <CoverPicker
              film={film}
              onCancel={() => setPicking(false)}
              onPick={(poster) => {
                onPickCover(film, poster);
                setPicking(false);
                // NOT closed, unlike a match correction. That one is showing a
                // different book's credits and has to go; this one has changed
                // a single image, and the card behind it is still true — so it
                // stays open with the new artwork already on it, which is the
                // confirmation.
              }}
            />
          ) : (
            <div className="border-t border-border px-4 py-3">
              <button
                onClick={() => setPicking(true)}
                className="w-full text-center text-sub font-semibold text-dim active:scale-95"
              >
                Change {lex().art}
              </button>
            </div>
          ))}

        {onFixMatch &&
          !picking &&
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
                className="w-full text-center text-sub font-semibold text-dim active:scale-95"
              >
                Wrong {lex().one}?
              </button>
            </div>
          ))}

        {/* ── Refine ────────────────────────────────────────────────────────
            Duel this film and nothing else, for a run you pick.

            Sizes rather than one fixed length, matching how Fast Shuffle's
            batches work — the same control shape reads as the same idea.

            ── The locked case, which is the whole design ──
            A hard lock is the one thing the model may never move. Refining a
            locked film would therefore either do nothing or quietly break that,
            so it asks instead: an off-by-default toggle saying plainly that the
            run can change a position you settled.

            That keeps the invariant honest rather than bending it. The MODEL
            still never takes back a decision; the USER can hand one back to it
            for a run, which is a different thing and is theirs to do.

            With the toggle off the run writes NO scores — see `readOnly` in
            `ShuffleDuel`. The obvious implementation, passing `movePlaced:
            false`, is not enough and a test written on that assumption is what
            found it: that flag preserves the ORDER of hard locks against each
            other while still re-spreading the whole tier, so the number moves.
            Refusing to write is the only version of "it won't move" that is
            true. The duels still land in the log and confidence still climbs. */}
        {onRefine && (
          <div className="border-t border-border px-4 py-3">
            {refining ? (
              <>
                <Eyebrow>How many duels</Eyebrow>
                <div className="mt-2 flex gap-2">
                  {[10, 25, 50].map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        onRefine(film, d, isHard(film) && letMove);
                        onClose();
                      }}
                      className="flex-1 rounded-xl border border-border py-2.5 text-sub font-bold text-text-hi active:scale-95"
                    >
                      {d}
                    </button>
                  ))}
                </div>
                {isHard(film) && (
                  <label className="mt-2.5 flex items-center justify-between gap-3">
                    <span className="min-w-0 text-sub leading-snug text-dim">
                      {letMove
                        ? "You locked this one. The run can move it."
                        : "You locked this one, so the run won't move it. The duels still count."}
                    </span>
                    <input
                      type="checkbox"
                      checked={letMove}
                      onChange={(e) => setLetMove(e.target.checked)}
                      className="tickbox"
                    />
                  </label>
                )}
              </>
            ) : (
              <button
                onClick={() => setRefining(true)}
                className="w-full text-center text-sub font-semibold text-dim active:scale-95"
              >
                Refine this film
              </button>
            )}
          </div>
        )}

        {onRemove && (
          <div className="border-t border-border px-4 py-3">
            {/* ── Safe on the LEFT, always ──────────────────────────────────
                The two buttons below were the other way round, and Settings' two
                identical confirmations — "Clear my ranking" and "Delete
                everything" — both put Keep it first. So the same two words in
                the same two slots meant opposite things depending on which sheet
                you were in, and the one where the LEFT-hand button destroyed
                something was the one reached by long-pressing a poster mid-duel.

                A thumb learns a position long before it learns a label. There is
                no version of this where the answer differs by screen. */}
            {armed ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setArmed(false)}
                  className="flex-1 rounded-lg border border-border py-2 text-sub font-bold text-dim active:scale-95"
                >
                  Keep it
                </button>
                <button
                  onClick={() => {
                    onRemove(film);
                    onClose();
                  }}
                  style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                  className="flex-1 rounded-lg border py-2 text-sub font-bold active:scale-95"
                >
                  Remove it
                </button>
              </div>
            ) : (
              <button
                onClick={() => setArmed(true)}
                className="w-full text-center text-sub font-semibold text-dim active:scale-95"
              >
                Remove from library
              </button>
            )}
            {armed && (
              <p className="mt-2 text-center text-label leading-snug text-dim">
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
